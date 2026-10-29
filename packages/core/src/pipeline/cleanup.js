import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { sql } from '../db.js';

/**
 * Keeping every source recording forever fills the volume, and a full volume
 * fails an upload with ENOSPC — which the church reads as "the app is broken".
 *
 * The source file is the only big thing here: a sermon is one to three
 * gigabytes, its clips are a few megabytes, and its transcript is text in the
 * database. So once the clips are rendered the source has done its job, and we
 * keep it only long enough that someone can correct the sermon window and
 * re-render the same day.
 */

export async function diskFree(dir = config.storageDir) {
  await fs.promises.mkdir(dir, { recursive: true });
  const s = await fs.promises.statfs(dir);
  return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
}

/**
 * Delete sources that have outlived their retention, then keep deleting the
 * oldest finished ones until there is room. Returns what it freed.
 */
export async function reclaimSpace({ needBytes = 0 } = {}) {
  const retentionHours = config.sourceRetentionHours;
  let freedBytes = 0, freedCount = 0;

  const expired = await sql`
    select id, source_path, audio_path from sermons
    where source_path is not null
      and updated_at < now() - ${retentionHours + ' hours'}::interval
      and not exists (select 1 from items i where i.sermon_id = sermons.id and i.kind = 'clip' and i.asset_path is null)
    order by updated_at asc`;

  for (const s of expired) {
    const n = await dropSource(s);
    freedBytes += n; freedCount += n ? 1 : 0;
  }

  let { free } = await diskFree();
  if (free >= needBytes + config.minFreeBytes) return { freedBytes, freedCount, free };

  // Still tight: take the oldest finished sermons, newest left alone.
  const candidates = await sql`
    select id, source_path, audio_path from sermons
    where source_path is not null
      and not exists (select 1 from items i where i.sermon_id = sermons.id and i.kind = 'clip' and i.asset_path is null)
    order by updated_at asc`;

  for (const s of candidates) {
    if (free >= needBytes + config.minFreeBytes) break;
    const n = await dropSource(s);
    freedBytes += n; freedCount += n ? 1 : 0;
    ({ free } = await diskFree());
  }

  return { freedBytes, freedCount, free };
}

async function dropSource(sermon) {
  let bytes = 0;
  for (const p of [sermon.source_path, sermon.audio_path]) {
    if (!p) continue;
    try {
      bytes += (await fs.promises.stat(p)).size;
      await fs.promises.rm(p, { force: true });
    } catch { /* already gone */ }
  }
  // Clips stay. Only the source is forgotten, and the UI says so.
  await sql`
    update sermons set source_path = null, audio_path = null, source_cleaned_at = now()
    where id = ${sermon.id}`;
  return bytes;
}

export const human = b =>
  b == null ? '?'
  : b >= 1e9 ? `${(b / 1e9).toFixed(2)}GB`
  : b >= 1e6 ? `${Math.round(b / 1e6)}MB`
  : `${Math.round(b / 1e3)}KB`;

/**
 * Delete a sermon outright: its folder, its clips, its row.
 *
 * Retention only clears sources that have aged out, which is no help when a
 * volume fills with today's test runs. This is the deliberate version.
 */
export async function runDeleteSermon(job) {
  const id = job.sermon_id;
  const dir = path.join(config.storageDir, id);
  let bytes = 0;
  try {
    bytes = await dirSize(dir);
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch (err) {
    // A missing folder is not a reason to keep the row around.
    if (err.code !== 'ENOENT') throw err;
  }
  await sql`delete from sermons where id = ${id}`;
  return { freed: human(bytes) };
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(full) : (await fs.promises.stat(full)).size;
  }
  return total;
}
