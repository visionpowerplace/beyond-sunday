/**
 * End-to-end: transcribe -> generate -> render, against a real Postgres and a
 * real video, with the providers in mock mode. Proves the queue, the stage
 * handoffs, the item fan-out and the ffmpeg render all line up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql, closeDb } from '../packages/core/src/db.js';
import { config } from '../packages/core/src/config.js';
import { enqueue, claimNext, finishJob, failJob } from '../packages/core/src/queue.js';
import { runTranscribe } from '../packages/core/src/pipeline/transcribe.js';
import { runGenerate } from '../packages/core/src/pipeline/generate.js';
import { runRenderClip } from '../packages/core/src/pipeline/render.js';
import { probeDuration } from '../packages/core/src/pipeline/ingest.js';

const SRC = process.env.TEST_SOURCE;
const HANDLERS = { transcribe: runTranscribe, generate: runGenerate, render_clip: runRenderClip };

await sql`delete from churches`;
const [church] = await sql`insert into churches (name) values ('The Empowerment Center') returning *`;
const [sermon] = await sql`
  insert into sermons (church_id, title, preacher, source_path, audio_path, duration_s, status)
  values (${church.id}, 'A Promise Of Presence', 'Pastor Ben', ${SRC}, ${SRC}, ${await probeDuration(SRC)}, 'transcribing')
  returning *`;

await enqueue({ type: 'transcribe', sermonId: sermon.id });

let processed = 0;
for (let i = 0; i < 40; i++) {
  const job = await claimNext('test');
  if (!job) break;
  try {
    const out = await HANDLERS[job.type](job);
    await finishJob(job.id);
    processed++;
    console.log(`  ${job.type}:`, JSON.stringify(out));
  } catch (err) {
    await failJob(job, err);
    console.error(`  ${job.type} FAILED: ${err.message}`);
    break;
  }
}

const items = await sql`select kind, count(*)::int as n, count(asset_path)::int as rendered from items where sermon_id = ${sermon.id} group by kind order by kind`;
const [final] = await sql`select status from sermons where id = ${sermon.id}`;

console.log(`\njobs processed: ${processed}`);
console.table(items.map(r => ({ kind: r.kind, items: r.n, rendered: r.rendered })));
console.log('sermon status:', final.status);

const clips = await sql`select id, asset_path, start_s, end_s from items where sermon_id = ${sermon.id} and kind = 'clip'`;
let ok = true;
for (const c of clips) {
  const full = path.join(config.storageDir, c.asset_path ?? '');
  const exists = c.asset_path && fs.existsSync(full);
  const dur = exists ? await probeDuration(full) : null;
  const want = Number(c.end_s) - Number(c.start_s) + 0.6;
  const drift = dur == null ? null : Math.abs(dur - want);
  const pass = exists && drift < 0.5;
  if (!pass) ok = false;
  console.log(`  clip ${String(c.id).slice(0, 8)} exists=${!!exists} duration=${dur?.toFixed(2)}s expected=${want.toFixed(2)}s ${pass ? 'OK' : 'MISMATCH'}`);
}

console.log(ok && final.status === 'ready' ? '\nPASS' : '\nFAIL');
await closeDb();
process.exit(ok && final.status === 'ready' ? 0 : 1);
