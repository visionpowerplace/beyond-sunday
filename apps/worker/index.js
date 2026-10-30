import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, describeProviders } from '@bs/core/config.js';
import { sql, closeDb } from '@bs/core/db.js';
import { claimNext, finishJob, failJob, enqueue } from '@bs/core/queue.js';
import { runIngest } from '@bs/core/pipeline/ingest.js';
import { runTranscribe } from '@bs/core/pipeline/transcribe.js';
import { runGenerate } from '@bs/core/pipeline/generate.js';
import { runRenderClip } from '@bs/core/pipeline/render.js';
import { diskFree, reclaimSpace, human, runDeleteSermon } from '@bs/core/pipeline/cleanup.js';
import { runRenderCarousel } from '@bs/core/pipeline/carousel.js';
import { runPublish } from '@bs/core/pipeline/publish.js';

const WORKER_ID = `${process.env.RAILWAY_REPLICA_ID ?? 'local'}-${randomUUID().slice(0, 8)}`;
const IDLE_MS = 3000;

const HANDLERS = {
  ingest: runIngest,
  transcribe: runTranscribe,
  generate: runGenerate,
  render_clip: runRenderClip,
  delete_sermon: runDeleteSermon,
  render_carousel: runRenderCarousel,
  publish: runPublish,
};

// What the church sees while each job runs. Keeps the page honest on a retry.
const STAGE_STATUS = {
  ingest: 'ingesting',
  transcribe: 'transcribing',
  generate: 'generating',
  render_clip: 'rendering',
  delete_sermon: 'deleting',
  render_carousel: 'rendering',
};

let running = true;
const inFlight = new Map();

/**
 * Several jobs at once, from one queue.
 *
 * Rendering six clips one after another was most of the wait. claimNext uses
 * FOR UPDATE SKIP LOCKED, so workers and the slots inside a worker never claim
 * the same job, and nothing here needs a lock of its own.
 */
/**
 * Apply the schema before anything else.
 *
 * The web service does this too, in its pre-deploy. Whichever of the two boots
 * first wins and the other is a no-op, which is the point: the worker used to
 * come up against a database the web service had not migrated yet and spend an
 * hour logging errors about a missing column.
 */
async function migrate() {
  try {
    const schema = await fs.promises.readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8');
    await sql.unsafe(schema);
    console.log('[worker] schema up to date');
  } catch (err) {
    console.error('[worker] could not apply the schema:', err.message);
  }
}

async function loop() {
  console.log(`[worker ${WORKER_ID}] up  ${describeProviders()}  concurrency=${config.concurrency}`);
  await migrate();
  sweepStorage();   // on boot, then hourly
  setInterval(sweepStorage, 60 * 60 * 1000).unref();

  while (running) {
    if (inFlight.size >= config.concurrency) { await Promise.race(inFlight.values()); continue; }

    let job;
    try {
      job = await claimNext(WORKER_ID);
    } catch (err) {
      console.error('[worker] cannot reach the queue:', err.message);
      await sleep(5000);
      continue;
    }

    if (!job) {
      // Nothing waiting: idle only if nothing is running, otherwise loop back
      // and pick up the slot the moment a job finishes.
      if (inFlight.size) await Promise.race(inFlight.values());
      else await sleep(IDLE_MS);
      continue;
    }

    const task = runJob(job).finally(() => inFlight.delete(job.id));
    inFlight.set(job.id, task);
  }

  await Promise.allSettled(inFlight.values());
}

async function sweepStorage() {
  try {
    const before = await diskFree();
    const { freedBytes, freedCount, free } = await reclaimSpace();
    console.log(`[storage] ${human(free ?? before.free)} free of ${human(before.total)}`
      + (freedCount ? `, cleared ${human(freedBytes)} from ${freedCount} old recording(s)` : ''));
  } catch (err) {
    console.error('[storage] sweep failed:', err.message);
  }
}

async function runJob(job) {
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
  }
}

/**
 * The worker also serves what it rendered. The web app is a separate service
 * with its own filesystem, so it links here rather than trying to read the volume.
 */
function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, PUT, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

/**
 * PUT /upload/<sermonId>?token=...  with the file as the raw body.
 *
 * The token is minted on the sermon row when the web app creates it and is
 * cleared the moment the upload lands, so a link cannot be reused and nobody
 * can write to the volume without having created a sermon first.
 */
async function handleUpload(req, res, url) {
  const sermonId = url.pathname.slice('/upload/'.length);
  const token = url.searchParams.get('token');
  const fail = (code, msg) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: msg })); };

  if (!/^[0-9a-f-]{36}$/i.test(sermonId)) return fail(400, 'bad sermon id');
  if (!token) return fail(401, 'missing token');

  const [sermon] = await sql`select id, upload_token from sermons where id = ${sermonId}`;
  if (!sermon) return fail(404, 'no such sermon');
  if (!sermon.upload_token) return fail(409, 'this sermon already has its recording; create a new one to replace it');
  if (sermon.upload_token !== token) return fail(403, 'that upload link is not valid for this sermon');

  // A recording that dies halfway through with ENOSPC looks like a broken app.
  // Check first, clear old sources out of the way, and say so if it still will
  // not fit rather than letting the write fail.
  const incoming = Number(req.headers['content-length']) || 0;
  let { free } = await diskFree();
  if (free < incoming + config.minFreeBytes) {
    const reclaimed = await reclaimSpace({ needBytes: incoming });
    free = reclaimed.free;
    if (reclaimed.freedCount) console.log(`[storage] freed ${human(reclaimed.freedBytes)} from ${reclaimed.freedCount} old recording(s)`);
  }
  if (incoming && free < incoming + config.minFreeBytes) {
    return fail(507, `Not enough storage for this file: it needs ${human(incoming)} and only ${human(free)} is free. `
      + 'Delete some older sermons, or ask for a bigger volume.');
  }

  const dir = path.join(config.storageDir, sermonId);
  await fs.promises.mkdir(dir, { recursive: true });
  const dest = path.join(dir, 'source.mp4');
  const partial = dest + '.part';

  try {
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(partial);
      req.pipe(out);
      req.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
    });
    // Only becomes the source once it is completely written: a half-uploaded
    // file that ffmpeg then chokes on is a confusing way to fail.
    await fs.promises.rename(partial, dest);
  } catch (err) {
    await fs.promises.rm(partial, { force: true });
    const outOfSpace = err.code === 'ENOSPC' || /ENOSPC/.test(err.message);
    return fail(outOfSpace ? 507 : 500, outOfSpace
      ? 'The storage filled up partway through this upload. Older recordings are cleared automatically; try again in a moment, and if it keeps happening the volume needs to be bigger.'
      : `upload failed: ${err.message}`);
  }

  await sql`update sermons set source_path = ${dest}, upload_token = null, status = 'ingesting', error = null, updated_at = now() where id = ${sermonId}`;

  // A sermon that already has a transcript came from a caption file: it needs
  // the audio extracted for nothing, so skip straight to rendering the clips
  // that have been waiting for a video.
  const [existing] = await sql`select transcript from sermons where id = ${sermonId}`;
  if (existing?.transcript) {
    const waiting = await sql`
      select id from items where sermon_id = ${sermonId} and kind = 'clip' and asset_path is null`;
    if (waiting.length) {
      await sql`update sermons set status = 'rendering' where id = ${sermonId}`;
      for (const c of waiting) await enqueue({ type: 'render_clip', sermonId, itemId: c.id });
    } else {
      await enqueue({ type: 'generate', sermonId, payload: { kinds: ['clip'] } });
    }
  } else {
    await enqueue({ type: 'ingest', sermonId });
  }

  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

/**
 * PUT /logo/<churchId>?token=...  — the church's logo, normalised to a square
 * PNG so every render can place it without thinking about its shape.
 */
async function handleLogo(req, res, url) {
  const churchId = url.pathname.slice('/logo/'.length);
  const token = url.searchParams.get('token');
  const fail = (code, msg) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: msg })); };

  if (!/^[0-9a-f-]{36}$/i.test(churchId)) return fail(400, 'bad church id');
  const [church] = await sql`select id, logo_token from churches where id = ${churchId}`;
  if (!church) return fail(404, 'no such church');
  if (!church.logo_token || church.logo_token !== token) return fail(403, 'that logo link is not valid');

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8e6) return fail(413, 'a logo should be under 8MB');
    chunks.push(chunk);
  }

  const dir = path.join(config.storageDir, 'brand');
  await fs.promises.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${churchId}.png`);
  try {
    const { default: sharp } = await import('sharp');
    await sharp(Buffer.concat(chunks)).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toFile(dest);
  } catch (err) {
    return fail(400, `that file could not be read as an image (${err.message})`);
  }

  await sql`update churches set logo_path = ${path.relative(config.storageDir, dest)}, logo_token = null where id = ${churchId}`;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // The browser uploads straight here, so the recording never passes through
  // the web service. A 2GB service video has no business going through Next.js.
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'PUT' && url.pathname.startsWith('/upload/')) {
    return handleUpload(req, res, url);
  }
  if (req.method === 'PUT' && url.pathname.startsWith('/logo/')) {
    return handleLogo(req, res, url);
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    const disk = await diskFree().catch(() => null);
    return res.end(JSON.stringify({
      ok: true, worker: WORKER_ID, running: [...inFlight.keys()], concurrency: config.concurrency,
      storage: disk ? { free: human(disk.free), total: human(disk.total) } : null,
    }));
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
    console.log(`[worker] ${sig}, finishing ${inFlight.size} running job(s) then stopping`);
    running = false;
    server.close();
    // The in-flight job keeps its lock; the stale sweep reclaims it if we die here.
    setTimeout(async () => { await closeDb(); process.exit(0); }, 1000).unref();
  });
}

loop().catch(async err => { console.error(err); await closeDb(); process.exit(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
