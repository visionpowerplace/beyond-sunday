import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { sql } from '../db.js';
import { run } from './ingest.js';

/**
 * Stage 4 — cut one clip, crop it to 9:16, burn the captions on.
 *
 * Captions are built as an ASS subtitle file from the word timings, not with
 * drawtext: drawtext needs one filter per line and falls over on a long clip,
 * while libass handles hundreds of cues, wraps text and centres it properly.
 *
 * This runs in a long-lived worker. It will not finish inside a serverless
 * function and no amount of tuning changes that.
 */

const W = config.clipWidth, H = Math.round((config.clipWidth * 16) / 9);
const PAD = 0.3;            // air at each end so the clip does not clip a word
const WORDS_PER_CUE = 3;

export async function runRenderClip(job) {
  const [item] = await sql`select * from items where id = ${job.item_id}`;
  if (!item) throw new Error(`item ${job.item_id} not found`);
  const [sermon] = await sql`select * from sermons where id = ${item.sermon_id}`;
  if (!sermon?.source_path) throw new Error('sermon has no source video');

  const dir = path.join(config.storageDir, sermon.id, 'clips');
  await fs.promises.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${item.id}.mp4`);

  const start = Math.max(0, Number(item.start_s) - PAD);
  const end = Number(item.end_s) + PAD;

  await renderClipFile({
    sourcePath: sermon.source_path,
    start,
    end,
    words: sermon.transcript?.words ?? [],
    scripture: scriptureCues(item, start, end),
    outPath,
  });

  const rel = path.relative(config.storageDir, outPath);
  await sql`update items set asset_path = ${rel}, updated_at = now() where id = ${item.id}`;
  await markSermonReadyIfDone(sermon.id);
  return { outPath, duration: end - start };
}

/**
 * The ffmpeg half, with no database in it, so it can be tested on its own.
 * Everything that can go wrong with rendering goes wrong in here.
 */
export async function renderClipFile({ sourcePath, start, end, words = [], scripture = [], outPath }) {
  const duration = end - start;
  if (!(duration > 1)) throw new Error(`nonsense clip duration: ${duration}s`);

  const inWindow = words.filter(w => w.end > start && w.start < end);
  const assPath = outPath.replace(/\.mp4$/, '.ass');
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(assPath, buildAss(inWindow, start, scripture), 'utf8');

  await run('ffmpeg', [
    '-y',
    // -ss before -i seeks fast; re-encoding below keeps the cut frame-accurate.
    '-ss', start.toFixed(3),
    '-t', duration.toFixed(3),
    '-i', sourcePath,
    '-filter_complex', filterGraph(assPath),
    '-map', '[out]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
    '-movflags', '+faststart',
    outPath,
  ]);

  return { outPath, duration };
}

async function markSermonReadyIfDone(sermonId) {
  const [{ pending }] = await sql`
    select count(*)::int as pending from items
    where sermon_id = ${sermonId} and kind = 'clip' and asset_path is null`;
  if (pending === 0) {
    await sql`update sermons set status = 'ready', updated_at = now() where id = ${sermonId}`;
  }
}

function scriptureCues(item, start, end) {
  return (item.scripture ?? [])
    .filter(s => s.start_s != null && s.start_s >= start && s.start_s <= end && !s.unverified)
    .map(s => ({ ref: s.ref, at: s.start_s - start }));
}

/**
 * Two styles: the spoken caption in the lower third, and the scripture
 * reference pinned under it for six seconds from when it was said.
 */
export function buildAss(words, offset, scripture) {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${config.captionFont},${px(86)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,${px(6)},${px(2)},2,${px(80)},${px(80)},${px(420)},1
Style: Verse,${config.captionFont},${px(52)},&H00D7B46A,&H00D7B46A,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,${px(5)},0,2,${px(80)},${px(80)},${px(300)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CUE) {
    const group = words.slice(i, i + WORDS_PER_CUE);
    const s = Math.max(0, group[0].start - offset);
    const e = Math.max(s + 0.2, group[group.length - 1].end - offset);
    const text = group.map(w => String(w.w).trim()).join(' ').replace(/[{}\\]/g, '');
    if (!text) continue;
    events.push(`Dialogue: 0,${ts(s)},${ts(e)},Caption,,0,0,0,,${text.toUpperCase()}`);
  }
  for (const v of scripture) {
    events.push(`Dialogue: 1,${ts(v.at)},${ts(v.at + 6)},Verse,,0,0,0,,${v.ref.replace(/[{}\\]/g, '')}`);
  }
  return header + events.join('\n') + '\n';
}

// Caption geometry is authored against a 1080-wide frame; scale it with W so
// a 720 render looks the same, not like 1080 captions shrunk.
const px = n => Math.round((n * W) / 1080);

function ts(seconds) {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
}

/**
 * Two layouts, and the default is the safe one.
 *
 * 'fit' puts the whole 16:9 frame in the middle of a blurred, darkened copy of
 * itself. The preacher can walk the entire stage and never leaves the shot.
 * 'crop' fills the screen edge to edge and looks better — right up until the
 * pastor steps left and the clip is a shoulder and a microphone stand.
 *
 * Proper face tracking replaces this later. Until it exists, cropping a sermon
 * blind is the wrong default.
 */
function filterGraph(assPath) {
  const ass = `ass=${escapeFilterPath(assPath)}`;
  if (config.clipLayout === 'crop') {
    return [
      `[0:v]crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',`
        + `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},`
        + `${ass},format=yuv420p[out]`,
    ].join(';');
  }
  // The backdrop is blurred at a fraction of the size and scaled back up.
  // Blurring 1080x1920 directly costs more than everything else in the graph
  // put together, and once it is this out of focus nobody can tell which way
  // it was done — the upscale is itself a blur.
  const bgW = 192, bgH = Math.round((bgW * H) / W);
  return [
    `[0:v]split=2[bg][fg]`,
    `[bg]scale=${bgW}:${bgH}:force_original_aspect_ratio=increase,crop=${bgW}:${bgH},`
      + `gblur=sigma=6,scale=${W}:${H}:flags=bilinear,eq=brightness=-0.14[bgb]`,
    `[fg]scale=${W}:-2[fgs]`,
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2[stacked]`,
    `[stacked]${ass},format=yuv420p[out]`,
  ].join(';');
}

// ffmpeg filter arguments need colons and backslashes escaped inside a path.
function escapeFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
