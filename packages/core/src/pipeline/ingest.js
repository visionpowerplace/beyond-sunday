import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { sql } from '../db.js';
import { enqueue } from '../queue.js';

/**
 * Stage 1 — get a playable video and a small audio file onto disk.
 *
 * Source is either a YouTube link or a file the church uploaded. Either way we
 * end up with: source.mp4 (for rendering) and audio.ogg (16kHz mono opus, for
 * transcription — small enough for Groq's upload cap on an hour-long service).
 */
export async function runIngest(job) {
  const [sermon] = await sql`select * from sermons where id = ${job.sermon_id}`;
  if (!sermon) throw new Error(`sermon ${job.sermon_id} not found`);

  const dir = path.join(config.storageDir, sermon.id);
  await fs.promises.mkdir(dir, { recursive: true });

  let sourcePath = sermon.source_path;

  // An uploaded file is already on the volume; only a link needs fetching.
  if (!sourcePath && sermon.source_url) {
    sourcePath = path.join(dir, 'source.mp4');
    try {
      await downloadFromUrl(sermon.source_url, sourcePath);
    } catch (err) {
      throw new Error(explainDownloadFailure(sermon.source_url, err.message));
    }
  }
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('no source video: upload the recording or paste a direct link to the file');
  }

  const audioPath = path.join(dir, 'audio.ogg');
  await extractAudio(sourcePath, audioPath);
  const duration = await probeDuration(sourcePath);

  await sql`
    update sermons set
      source_path = ${sourcePath},
      audio_path  = ${audioPath},
      duration_s  = ${duration},
      status      = 'transcribing',
      updated_at  = now()
    where id = ${sermon.id}`;

  await enqueue({ type: 'transcribe', sermonId: sermon.id });
  return { sourcePath, audioPath, duration };
}

/**
 * Downloading from a link.
 *
 * A direct media URL — the church's own recording, Drive, Dropbox, S3, a CDN —
 * always works and is the route to prefer.
 *
 * YouTube often will not work from here, and it is worth knowing why rather
 * than fighting it: Railway's addresses are shared by a lot of traffic, so
 * YouTube serves them its "Sign in to confirm you're not a bot" check. That is
 * YouTube deliberately refusing automated downloads from this kind of server.
 * We do not try to get around it. When it happens we say so and point at the
 * upload route, which does not involve YouTube at all.
 */
function downloadFromUrl(url, outPath) {
  return run('yt-dlp', [
    '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--retries', '3',
    '--socket-timeout', '30',
    '-o', outPath,
    url,
  ]);
}

export function explainDownloadFailure(url, message) {
  if (/not a bot|Sign in to confirm/i.test(message)) {
    return 'YouTube would not serve this video to the server: it asks automated downloads from shared server addresses to sign in and prove they are not a bot. '
      + 'Use the Upload button instead and send the recording straight from your computer, or paste a direct link to the video file. '
      + 'If the church owns the channel, downloading the original from YouTube Studio and uploading it here is the reliable route.';
  }
  if (/Private video|members-only|unavailable/i.test(message)) {
    return 'That video is private, members-only or unavailable, so it cannot be fetched from a link. Upload the file instead.';
  }
  return `Could not download from that link: ${String(message).trim().split('\n').filter(Boolean).at(-1)?.slice(0, 300)}`;
}

function extractAudio(inPath, outPath) {
  return run('ffmpeg', [
    '-y', '-i', inPath,
    '-vn', '-ac', '1', '-ar', '16000',
    '-c:a', 'libopus', '-b:a', '16k',
    outPath,
  ]);
}

export async function probeDuration(file) {
  const out = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ], { capture: true });
  const n = Number(String(out).trim());
  return Number.isFinite(n) ? n : null;
}

export function run(cmd, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { if (capture) stdout += d; });
    child.stderr.on('data', d => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(capture ? stdout : true);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-1500)}`));
    });
  });
}
