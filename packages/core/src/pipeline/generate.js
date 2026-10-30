import { sql } from '../db.js';
import { enqueue } from '../queue.js';
import { completeJson } from '../providers/llm.js';
import { BASE_SYSTEM, KINDS, buildUser, LOCATE_SYSTEM, locateUser } from './prompts.js';

/**
 * Stage 3 — make one kind of thing from the sermon.
 *
 * A job carries `kinds`: the first run after transcription asks for clips
 * only, so the church sees video as fast as possible. Everything else is
 * generated when someone asks for it, each as its own call. Someone who only
 * wants a devotional pays for one call, not six.
 */
export async function runGenerate(job) {
  const [sermon] = await sql`
    select s.*, c.name as church_name from sermons s join churches c on c.id = s.church_id
    where s.id = ${job.sermon_id}`;
  if (!sermon?.transcript) throw new Error('sermon has no transcript; transcribe must run first');

  const kinds = (job.payload?.kinds?.length ? job.payload.kinds : ['clip']).filter(k => KINDS[k]);
  if (!kinds.length) throw new Error(`nothing to generate: ${JSON.stringify(job.payload?.kinds)}`);

  const t = sermon.transcript;
  const all = t.segments ?? [];
  const win = await resolveWindow(sermon, all);
  const segments = all.filter(s => s.end > win.start && s.start < win.end);
  if (!segments.length) throw new Error('the chosen sermon window contains no speech — check the start and end times');

  const context = {
    title: sermon.title,
    preacher: sermon.preacher,
    church: sermon.church_name,
    durationS: win.end - win.start,
    segments: capSegments(segments),
    scripture: t.scripture ?? [],
  };

  const made = {};
  for (const kind of kinds) {
    // Carousels and write-ups are built on the points, so make those first if
    // they are not there yet rather than failing or inventing new ones.
    const highlights = KINDS[kind].needsHighlights ? await ensureHighlights(sermon, context, t, win) : null;
    const rows = await generateKind({ kind, sermon, context, transcript: t, win, highlights });
    await replaceItems(sermon.id, kind, rows);
    made[kind] = rows.length;
  }

  if (made.clip) {
    const clips = await sql`select id from items where sermon_id = ${sermon.id} and kind = 'clip' order by ordinal`;
    for (const c of clips) await enqueue({ type: 'render_clip', sermonId: sermon.id, itemId: c.id });
  }
  await settleStatus(sermon.id, job.id);
  return made;
}

async function generateKind({ kind, sermon, context, transcript, win, highlights }) {
  const data = (await completeJson({
    system: BASE_SYSTEM,
    user: buildUser({ kind, ...context, highlights }),
    maxTokens: KINDS[kind].maxTokens,
  })) ?? mockFor(kind, context);

  const rows = toItems(kind, data, sermon, transcript);

  if (kind === 'clip') {
    const musicFlag = data.music_warning ? ['music_under_speech'] : [];
    return rows
      .map(r => ({
        ...r,
        start_s: Math.max(win.start, r.start_s),
        end_s: Math.min(win.end, r.end_s),
        flags: sql.json([...(r._flags ?? []), ...musicFlag]),
      }))
      .filter(r => r.end_s - r.start_s >= 5)
      .map(({ _flags, ...r }) => r);
  }
  return rows.map(({ _flags, ...r }) => r);
}

async function ensureHighlights(sermon, context, transcript, win) {
  const existing = await sql`select title, body from items where sermon_id = ${sermon.id} and kind = 'highlight' order by ordinal`;
  if (existing.length) return existing.map(h => ({ point: h.title, explain: h.body?.explain ?? '' }));

  const rows = await generateKind({ kind: 'highlight', sermon, context, transcript, win, highlights: null });
  await replaceItems(sermon.id, 'highlight', rows);
  return rows.map(r => ({ point: r.title, explain: r.body?.explain ?? '' }));
}

async function replaceItems(sermonId, kind, rows) {
  await sql.begin(async tx => {
    await tx`delete from items where sermon_id = ${sermonId} and kind = ${kind}`;
    for (const r of rows) {
      await tx`insert into items ${tx(r, 'sermon_id','kind','ordinal','title','body','start_s','end_s','score','scripture','flags')}`;
    }
  });
}

/**
 * Ready only when nothing else is still working on this sermon.
 *
 * With several jobs running at once, the first to finish used to mark the
 * sermon ready while its siblings were still going. The page stopped
 * refreshing, the remaining sections arrived silently, and it looked broken.
 */
async function settleStatus(sermonId, currentJobId) {
  const [{ generating }] = await sql`
    select count(*)::int as generating from jobs
    where sermon_id = ${sermonId} and type = 'generate'
      and status in ('queued', 'running') and id <> ${currentJobId ?? 0}`;
  const [{ rendering }] = await sql`
    select count(*)::int as rendering from items
    where sermon_id = ${sermonId} and kind = 'clip' and asset_path is null`;

  const status = generating ? 'generating' : rendering ? 'rendering' : 'ready';
  await sql`update sermons set status = ${status}, updated_at = now() where id = ${sermonId}`;
}

function toItems(kind, data, sermon, transcript) {
  const base = { sermon_id: sermon.id };
  const empty = { start_s: null, end_s: null, score: null, scripture: sql.json([]), flags: sql.json([]) };

  if (kind === 'clip') return (data.clips ?? []).map((c, i) => ({
    ...base, kind, ordinal: i,
    title: c.title ?? `Clip ${i + 1}`,
    body: sql.json({ hook: c.hook ?? '', caption: c.caption ?? '' }),
    start_s: Math.max(0, Number(c.start_s) || 0),
    end_s: Number(c.end_s) || 0,
    score: Math.min(100, Math.max(0, Number(c.score) || 0)),
    scripture: sql.json(refsWithTime(c.scripture_refs, transcript)),
    flags: sql.json([]),
    _flags: c.flags ?? [],
  }));

  if (kind === 'highlight') return (data.highlights ?? []).map((h, i) => ({
    ...base, kind, ordinal: i, ...empty,
    title: h.point ?? `Point ${i + 1}`,
    body: sql.json({ explain: h.explain ?? '', quote: h.quote ?? '', quote_at_s: h.quote_at_s ?? null }),
    scripture: sql.json(refsWithTime(h.scripture_refs, transcript)),
  }));

  if (kind === 'carousel') return (data.carousels ?? []).map((c, i) => ({
    ...base, kind, ordinal: i, ...empty,
    title: c.title ?? `Carousel ${i + 1}`,
    body: sql.json({ slides: c.slides ?? [], caption: c.caption ?? '', highlight_index: c.highlight_index ?? i }),
  }));

  if (kind === 'writeup') return (data.writeups ?? []).map((w, i) => ({
    ...base, kind, ordinal: i, ...empty,
    title: w.title ?? `Write-up ${i + 1}`,
    body: sql.json({ text: w.body ?? '', caption: w.caption ?? '', highlight_index: w.highlight_index ?? i }),
  }));

  if (kind === 'summary') return data.summary ? [{
    ...base, kind, ordinal: 0, ...empty,
    title: data.summary.title ?? sermon.title,
    body: sql.json({ text: data.summary.body ?? '', caption: data.summary.caption ?? '' }),
  }] : [];

  if (kind === 'devotional') return (data.devotional ?? []).map((d, i) => ({
    ...base, kind, ordinal: Number(d.day) || i + 1, ...empty,
    title: d.title ?? `Day ${i + 1}`,
    body: sql.json({ text: d.body ?? '', question: d.question ?? '', prayer: d.prayer ?? '', day: Number(d.day) || i + 1 }),
    scripture: sql.json(refsWithTime(d.scripture_ref ? [d.scripture_ref] : [], transcript)),
  }));

  return [];
}

/**
 * Which part of the recording is the sermon.
 *
 * A manual window always wins: if a person typed the times, they watched it and
 * we did not. Otherwise one cheap call finds the teaching block, and if the
 * model is unsure we use the whole recording rather than cutting the wrong half.
 */
async function resolveWindow(sermon, segments) {
  const full = { start: 0, end: Number(sermon.duration_s) || (segments.at(-1)?.end ?? 0) };

  if (sermon.sermon_start_s != null || sermon.sermon_end_s != null) {
    return { start: Number(sermon.sermon_start_s ?? 0), end: Number(sermon.sermon_end_s ?? full.end) };
  }
  if (!segments.length) return full;

  let found = null;
  try {
    found = await completeJson({ system: LOCATE_SYSTEM, user: locateUser({ segments }), maxTokens: 800, temperature: 0.1 });
  } catch {
    found = null;   // locating is a convenience; never fail the work over it
  }

  const start = Number(found?.start_s), end = Number(found?.end_s);
  const sane = found?.confident && Number.isFinite(start) && Number.isFinite(end)
    && end - start > 120 && start >= 0 && end <= full.end + 1;
  const win = sane ? { start, end: Math.min(end, full.end) } : full;

  await sql`
    update sermons set sermon_start_s = ${win.start}, sermon_end_s = ${win.end},
      window_source = ${sane ? 'auto' : 'auto-fullservice'}, updated_at = now()
    where id = ${sermon.id}`;
  return win;
}

// A 90-minute service can overflow the context; sample evenly rather than
// truncating, so the end of the sermon is not simply lost.
function capSegments(segments, maxChars = 90_000) {
  const total = segments.reduce((n, s) => n + s.text.length + 20, 0);
  if (total <= maxChars) return segments;
  const keepEvery = Math.ceil(total / maxChars);
  return segments.filter((_, i) => i % keepEvery === 0);
}

// Only keeps references the detector also heard in the audio. A reference the
// model produced that nobody said is the exact mistake we will not ship.
function refsWithTime(refs, transcript) {
  const heard = new Map((transcript.scripture ?? []).map(s => [norm(s.ref), s]));
  return (refs ?? []).map(r => heard.get(norm(r)) ?? { ref: r, start_s: null, unverified: true });
}
const norm = r => String(r).toLowerCase().replace(/\s+/g, ' ').trim();

// Mock mode: enough structure to build the UI against, obviously fake.
function mockFor(kind, context) {
  const segs = context.segments ?? [];
  return {
    clip: { clips: segs.slice(0, 4).map((s, i) => ({ title: `Mock clip ${i + 1}`, hook: s.text.slice(0, 60), start_s: s.start, end_s: Math.min(s.start + 30, s.end + 25), score: 50, flags: [], caption: '[mock mode]', scripture_refs: [] })), music_warning: false },
    highlight: { highlights: [{ point: 'Mock highlight', explain: '[mock mode]', quote: segs[0]?.text ?? '', quote_at_s: 0, scripture_refs: [] }] },
    carousel: { carousels: [{ highlight_index: 0, title: 'Mock carousel', slides: [{ heading: 'Mock', body: '[mock mode]' }], caption: '[mock mode]' }] },
    writeup: { writeups: [{ highlight_index: 0, title: 'Mock write-up', body: '[mock mode]', caption: '[mock mode]' }] },
    summary: { summary: { title: 'Mock summary', body: '[mock mode]', caption: '[mock mode]' } },
    devotional: { devotional: [1, 2, 3, 4, 5].map(day => ({ day, title: `Mock day ${day}`, scripture_ref: '', body: '[mock mode]', question: '?', prayer: '[mock mode]' })) },
  }[kind] ?? {};
}
