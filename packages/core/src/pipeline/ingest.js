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

  if (!sourcePath && sermon.source_url) {
    sourcePath = path.join(dir, 'source.mp4');
    await downloadYoutube(sermon.source_url, sourcePath);
  }
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error('no source video: give the sermon either a source_url or an uploaded source_path');
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

function downloadYoutube(url, outPath) {
  // yt-dlp, not a library: the libraries wrap this binary anyway and go stale
  // every time YouTube changes. Capped at 1080p — nothing above that survives a
  // 9:16 crop, and the download is three times the size.
  return run('yt-dlp', [
    '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/b',
    '--merge-output-format', 'mp4',
    '--no-playlist',
    '--retries', '5',
    '-o', outPath,
    url,
  ]);
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
