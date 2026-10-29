import { sql } from '../db.js';
import { enqueue } from '../queue.js';
import { completeJson } from '../providers/llm.js';
import { CONTENT_PACK_SYSTEM, contentPackUser } from './prompts.js';

/**
 * Stage 3 — one sermon becomes a content pack.
 *
 * Everything here comes out of the transcript we already paid to make, which is
 * why the pack costs barely more than the clips alone. Each produced thing
 * becomes an `items` row: its own card in the review queue, approved and
 * scheduled on its own.
 */
export async function runGenerate(job) {
  const [sermon] = await sql`select s.*, c.name as church_name from sermons s join churches c on c.id = s.church_id where s.id = ${job.sermon_id}`;
  if (!sermon?.transcript) throw new Error('sermon has no transcript; transcribe must run first');

  const t = sermon.transcript;
  const pack = (await completeJson({
    system: CONTENT_PACK_SYSTEM,
    user: contentPackUser({
      title: sermon.title,
      preacher: sermon.preacher,
      church: sermon.church_name,
      durationS: Number(sermon.duration_s) || null,
      transcriptText: t.text,
      segments: capSegments(t.segments ?? []),
      scripture: t.scripture ?? [],
    }),
    maxTokens: 12000,
  })) ?? mockPack(t);

  const rows = toItems(pack, sermon, t);
  if (!rows.length) throw new Error('the model returned an empty pack');

  await sql.begin(async tx => {
    await tx`delete from items where sermon_id = ${sermon.id}`;
    for (const r of rows) {
      await tx`insert into items ${tx(r, 'sermon_id','kind','ordinal','title','body','start_s','end_s','score','scripture','flags')}`;
    }
    await tx`update sermons set status = 'rendering', updated_at = now() where id = ${sermon.id}`;
  });

  // Only clips need the renderer. Text and carousels are ready to review now,
  // which is the point: the pastor can start approving while video is still cooking.
  const clips = await sql`select id from items where sermon_id = ${sermon.id} and kind = 'clip' order by ordinal`;
  for (const c of clips) await enqueue({ type: 'render_clip', sermonId: sermon.id, itemId: c.id });
  if (!clips.length) await sql`update sermons set status = 'ready' where id = ${sermon.id}`;

  return { items: rows.length, clips: clips.length, musicWarning: !!pack.music_warning };
}

// A 90-minute service can overflow the context. Segments are already compact;
// this keeps the newest-to-oldest balance by sampling evenly rather than truncating the end.
function capSegments(segments, maxChars = 90_000) {
  const total = segments.reduce((n, s) => n + s.text.length + 20, 0);
  if (total <= maxChars) return segments;
  const keepEvery = Math.ceil(total / maxChars);
  return segments.filter((_, i) => i % keepEvery === 0);
}

function toItems(pack, sermon, transcript) {
  const rows = [];
  const base = { sermon_id: sermon.id };
  const musicFlag = pack.music_warning ? ['music_under_speech'] : [];

  (pack.clips ?? []).forEach((c, i) => {
    const start = Math.max(0, Number(c.start_s) || 0);
    const end = Number(c.end_s) || 0;
    if (end - start < 5) return;  // nothing under five seconds is a clip
    rows.push({
      ...base, kind: 'clip', ordinal: i,
      title: c.title ?? `Clip ${i + 1}`,
      body: sql.json({ hook: c.hook ?? '', caption: c.caption ?? '' }),
      start_s: start, end_s: end,
      score: clamp(Number(c.score) || 0),
      scripture: sql.json(refsWithTime(c.scripture_refs, transcript)),
      flags: sql.json([...(c.flags ?? []), ...musicFlag]),
    });
  });

  (pack.highlights ?? []).forEach((h, i) => rows.push({
    ...base, kind: 'highlight', ordinal: i,
    title: h.point ?? `Point ${i + 1}`,
    body: sql.json({ explain: h.explain ?? '', quote: h.quote ?? '', quote_at_s: h.quote_at_s ?? null }),
    start_s: null, end_s: null, score: null,
    scripture: sql.json(refsWithTime(h.scripture_refs, transcript)),
    flags: sql.json([]),
  }));

  (pack.carousels ?? []).forEach((c, i) => rows.push({
    ...base, kind: 'carousel', ordinal: i,
    title: c.title ?? `Carousel ${i + 1}`,
    body: sql.json({ slides: c.slides ?? [], caption: c.caption ?? '', highlight_index: c.highlight_index ?? i }),
    start_s: null, end_s: null, score: null, scripture: sql.json([]), flags: sql.json([]),
  }));

  (pack.writeups ?? []).forEach((w, i) => rows.push({
    ...base, kind: 'writeup', ordinal: i,
    title: w.title ?? `Write-up ${i + 1}`,
    body: sql.json({ text: w.body ?? '', caption: w.caption ?? '', highlight_index: w.highlight_index ?? i }),
    start_s: null, end_s: null, score: null, scripture: sql.json([]), flags: sql.json([]),
  }));

  if (pack.summary) rows.push({
    ...base, kind: 'summary', ordinal: 0,
    title: pack.summary.title ?? sermon.title,
    body: sql.json({ text: pack.summary.body ?? '', caption: pack.summary.caption ?? '' }),
    start_s: null, end_s: null, score: null, scripture: sql.json([]), flags: sql.json([]),
  });

  (pack.devotional ?? []).forEach((d, i) => rows.push({
    ...base, kind: 'devotional', ordinal: Number(d.day) || i + 1,
    title: d.title ?? `Day ${i + 1}`,
    body: sql.json({ text: d.body ?? '', question: d.question ?? '', prayer: d.prayer ?? '', day: Number(d.day) || i + 1 }),
    start_s: null, end_s: null, score: null,
    scripture: sql.json(refsWithTime(d.scripture_ref ? [d.scripture_ref] : [], transcript)),
    flags: sql.json([]),
  }));

  return rows;
}

// Only keeps references the detector also heard in the audio. A reference the
// model produced that nobody actually said is the exact mistake we will not ship.
function refsWithTime(refs, transcript) {
  const heard = new Map((transcript.scripture ?? []).map(s => [norm(s.ref), s]));
  return (refs ?? [])
    .map(r => heard.get(norm(r)) ?? { ref: r, start_s: null, unverified: true })
    .filter(Boolean);
}

const norm = r => String(r).toLowerCase().replace(/\s+/g, ' ').trim();
const clamp = n => Math.min(100, Math.max(0, n));

// Mock mode: enough structure to build and test the UI against, obviously fake.
function mockPack(t) {
  const segs = t.segments ?? [];
  const pick = segs.slice(0, 4);
  return {
    clips: pick.map((s, i) => ({
      title: `Mock clip ${i + 1}`,
      hook: s.text.slice(0, 60),
      start_s: s.start, end_s: Math.min(s.start + 30, s.end + 25),
      score: 50, flags: [], caption: '[mock mode] set LLM_PROVIDER=openrouter for real captions.',
      scripture_refs: [],
    })),
    highlights: [{ point: 'Mock highlight', explain: '[mock mode]', quote: pick[0]?.text ?? '', quote_at_s: 0, scripture_refs: [] }],
    carousels: [{ highlight_index: 0, title: 'Mock carousel', slides: [{ heading: 'Mock', body: '[mock mode]' }], caption: '[mock mode]' }],
    writeups: [{ highlight_index: 0, title: 'Mock write-up', body: '[mock mode]', caption: '[mock mode]' }],
    summary: { title: 'Mock summary', body: '[mock mode]', caption: '[mock mode]' },
    devotional: [1, 2, 3, 4, 5].map(day => ({ day, title: `Mock day ${day}`, scripture_ref: '', body: '[mock mode]', question: '?', prayer: '[mock mode]' })),
    music_warning: false,
  };
}
