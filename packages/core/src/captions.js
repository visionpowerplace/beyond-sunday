/**
 * Reading a caption file.
 *
 * This is the one legitimate way a YouTube video gets into the app without
 * the video: the owner downloads the caption track from YouTube Studio (or
 * through captions.download, which needs edit permission on the video) and
 * gives us that. No download of the video, no bot check to get around.
 *
 * It is also the cheapest path in the whole product — no transcription call
 * at all — and it works for any video anywhere, not only YouTube.
 *
 * Handles SRT, WebVTT, and plain text with no timings at all.
 */

const TIME = /(\d{1,3}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,3}):(\d{2})[.,](\d{1,3})/;

export function parseCaptions(raw) {
  const text = String(raw ?? '').replace(/\r\n?/g, '\n').trim();
  if (!text) throw new Error('That file is empty.');

  const cues = text.includes('-->') ? parseCues(text) : null;
  if (cues?.length) return fromCues(cues);

  // No timings: still usable for everything except clips.
  const plain = stripNoise(text);
  if (plain.split(/\s+/).length < 40) {
    throw new Error('That does not look like a transcript — it is only a few words long.');
  }
  return { text: plain, segments: syntheticSegments(plain), words: [], timed: false, source: 'text' };
}

function parseCues(text) {
  const cues = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter(l => l.trim() !== '');
    const arrow = lines.findIndex(l => l.includes('-->'));
    if (arrow === -1) continue;

    const [from, to] = lines[arrow].split('-->').map(s => s.trim());
    const start = seconds(from), end = seconds(to);
    if (start == null || end == null) continue;

    const body = lines.slice(arrow + 1).join(' ');
    const clean = stripNoise(body);
    if (clean) cues.push({ start, end: Math.max(end, start + 0.2), text: clean });
  }
  return cues;
}

function seconds(stamp) {
  const m = TIME.exec(String(stamp));
  if (!m) return null;
  if (m[1] != null) return +m[1] * 3600 + +m[2] * 60 + +m[3] + +`0.${m[4]}`;
  return +m[5] * 60 + +m[6] + +`0.${m[7]}`;
}

/**
 * YouTube's auto-captions repeat each line as the next one rolls on, so a
 * naive join says everything twice. Drop a cue that only extends the one
 * before it.
 */
function fromCues(cues) {
  const kept = [];
  for (const cue of cues) {
    const prev = kept.at(-1);
    if (prev && (cue.text === prev.text || cue.text.startsWith(prev.text))) {
      prev.end = cue.end;
      prev.text = cue.text;
      continue;
    }
    if (prev && prev.text.endsWith(cue.text)) { prev.end = cue.end; continue; }
    kept.push({ ...cue });
  }

  // Cue-level timings, spread across the words inside each cue. Good enough
  // to cut a clip on a sentence; not as tight as real word timings, so a
  // clip from captions gets a little more air at each end.
  const words = [];
  for (const cue of kept) {
    const parts = cue.text.split(/\s+/).filter(Boolean);
    const per = (cue.end - cue.start) / Math.max(1, parts.length);
    parts.forEach((w, i) => words.push({
      w,
      start: +(cue.start + i * per).toFixed(2),
      end: +(cue.start + (i + 1) * per).toFixed(2),
    }));
  }

  // Cues are a line or two each; group them into sentence-sized segments.
  const segments = [];
  let current = null;
  for (const cue of kept) {
    if (!current) current = { text: cue.text, start: cue.start, end: cue.end };
    else if (current.end - current.start > 18 || /[.!?]$/.test(current.text)) {
      segments.push(current);
      current = { text: cue.text, start: cue.start, end: cue.end };
    } else {
      current.text += ' ' + cue.text;
      current.end = cue.end;
    }
  }
  if (current) segments.push(current);

  return {
    text: kept.map(c => c.text).join(' '),
    segments,
    words,
    timed: true,
    source: 'captions',
    duration: kept.at(-1)?.end ?? null,
  };
}

/** Caption furniture nobody said out loud. */
function stripNoise(s) {
  return String(s)
    .replace(/<[^>]*>/g, '')                       // vtt styling
    .replace(/\{[^}]*\}/g, '')                     // ssa overrides
    .replace(/^\s*(WEBVTT|Kind:|Language:|NOTE)\b.*$/gim, '')
    .replace(/^\s*\d+\s*$/gm, '')                  // srt sequence numbers
    .replace(/\[[^\]]{0,40}\]|\([^)]{0,40}\)/g, m => // [music], (applause)
      /music|applause|laughter|inaudible|silence|singing/i.test(m) ? '' : m)
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text: break on sentences so the model still sees structure. */
function syntheticSegments(text) {
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text];
  const out = [];
  let buffer = '';
  for (const s of sentences) {
    buffer += s;
    if (buffer.length > 240) { out.push({ text: buffer.trim(), start: 0, end: 0 }); buffer = ''; }
  }
  if (buffer.trim()) out.push({ text: buffer.trim(), start: 0, end: 0 });
  return out;
}
