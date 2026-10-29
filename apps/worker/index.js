import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, describeProviders } from '@bs/core/config.js';
import { sql, closeDb } from '@bs/core/db.js';
import { claimNext, finishJob, failJob } from '@bs/core/queue.js';
import { runIngest } from '@bs/core/pipeline/ingest.js';
import { runTranscribe } from '@bs/core/pipeline/transcribe.js';
import { runGenerate } from '@bs/core/pipeline/generate.js';
import { runRenderClip } from '@bs/core/pipeline/render.js';

const WORKER_ID = `${process.env.RAILWAY_REPLICA_ID ?? 'local'}-${randomUUID().slice(0, 8)}`;
const IDLE_MS = 3000;

const HANDLERS = {
  ingest: runIngest,
  transcribe: runTranscribe,
  generate: runGenerate,
  render_clip: runRenderClip,
};

// What the church sees while each job runs. Keeps the page honest on a retry.
const STAGE_STATUS = {
  ingest: 'ingesting',
  transcribe: 'transcribing',
  generate: 'generating',
  render_clip: 'rendering',
};

let running = true;
let current = null;

async function loop() {
  console.log(`[worker ${WORKER_ID}] up  ${describeProviders()}`);
  while (running) {
    let job;
    try {
      job = await claimNext(WORKER_ID);
    } catch (err) {
      console.error('[worker] cannot reach the queue:', err.message);
      await sleep(5000);
      continue;
    }

    if (!job) { await sleep(IDLE_MS); continue; }

    current = job;
    const started = Date.now();
    console.log(`[job ${job.id}] ${job.type} attempt ${job.attempts}`);
    try {
      const handler = HANDLERS[job.type];
      if (!handler) throw new Error(`no handler for job type ${job.type}`);
      if (job.sermon_id && STAGE_STATUS[job.type]) {
        await sql`update sermons set status = ${STAGE_STATUS[job.type]}, error = null, updated_at = now()
                  where id = ${job.sermon_id} and status <> 'ready'`;
      }
      const result = await handler(job);
      await finishJob(job.id);
      console.log(`[job ${job.id}] done in ${((Date.now() - started) / 1000).toFixed(1)}s`, result ?? '');
    } catch (err) {
      const { exhausted } = await failJob(job, err);
      console.error(`[job ${job.id}] ${exhausted ? 'FAILED for good' : 'failed, will retry'}: ${err.message}`);
      // A sermon whose pipeline is dead should say so in the UI, not sit on
      // "processing" forever. Silent failure is the complaint every tool in
      // this market gets.
      if (exhausted && job.sermon_id) {
        await sql`update sermons set status = 'failed', error = ${String(err.message).slice(0, 1000)}, updated_at = now() where id = ${job.sermon_id}`;
      }
    } finally {
      current = null;
    }
  }
}

/**
 * The worker also serves what it rendered. The web app is a separate service
 * with its own filesystem, so it links here rather than trying to read the volume.
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, worker: WORKER_ID, job: current?.id ?? null }));
  }

  if (url.pathname.startsWith('/files/')) {
    const rel = decodeURIComponent(url.pathname.slice('/files/'.length));
    const full = path.resolve(config.storageDir, rel);
    // Never serve outside the storage root, whatever the path says.
    if (!full.startsWith(path.resolve(config.storageDir) + path.sep)) {
      res.writeHead(403); return res.end('forbidden');
    }
    if (!fs.existsSync(full)) { res.writeHead(404); return res.end('not found'); }

    const stat = await fs.promises.stat(full);
    const type = full.endsWith('.mp4') ? 'video/mp4'
      : full.endsWith('.png') ? 'image/png'
      : full.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';

    // Range support, so a phone can scrub a clip instead of downloading it whole.
    const range = req.headers.range;
    if (range) {
      const [a, b] = range.replace('bytes=', '').split('-');
      const start = Number(a) || 0;
      const end = b ? Number(b) : stat.size - 1;
      res.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
      });
      return fs.createReadStream(full, { start, end }).pipe(res);
    }

    res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'accept-ranges': 'bytes' });
    return fs.createReadStream(full).pipe(res);
  }

  res.writeHead(404); res.end('not found');
});

server.listen(config.workerPort, () => console.log(`[worker] files on :${config.workerPort}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    console.log(`[worker] ${sig}, finishing current job then stopping`);
    running = false;
    server.close();
    // The in-flight job keeps its lock; the stale sweep reclaims it if we die here.
    setTimeout(async () => { await closeDb(); process.exit(0); }, 1000).unref();
  });
}

loop().catch(async err => { console.error(err); await closeDb(); process.exit(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
