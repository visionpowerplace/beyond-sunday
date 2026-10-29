/**
 * Boots the real worker and hits every endpoint it serves.
 *
 * This exists because a refactor once deleted two handler functions and
 * `node --check` was perfectly happy: the failure was a ReferenceError on the
 * first request, which only a running process can catch.
 *
 *   DATABASE_URL=... STORAGE_DIR=... node tests/worker-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { sql, closeDb } from '../packages/core/src/db.js';

const PORT = process.env.SMOKE_PORT ?? '8098';
const base = `http://127.0.0.1:${PORT}`;
const worker = spawn('node', ['apps/worker/index.js'], {
  env: { ...process.env, WORKER_PORT: PORT },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
worker.stdout.on('data', d => { log += d; });
worker.stderr.on('data', d => { log += d; });

const checks = [];
const check = (name, pass, detail = '') => { checks.push({ name, pass, detail }); };

try {
  await waitFor(async () => (await fetch(`${base}/health`)).ok, 15000);

  const health = await (await fetch(`${base}/health`)).json();
  check('health responds', health.ok === true, JSON.stringify(health));
  check('reports concurrency', Number(health.concurrency) >= 1, `concurrency=${health.concurrency}`);

  check('CORS preflight', (await fetch(`${base}/upload/x`, { method: 'OPTIONS' })).status === 204);

  const [church] = await sql`insert into churches (name) values ('Smoke test') returning *`;
  const [sermon] = await sql`
    insert into sermons (church_id, title, status, upload_token)
    values (${church.id}, 'Smoke', 'awaiting_upload', 'smoke-token') returning *`;

  const put = (token, body) => fetch(`${base}/upload/${sermon.id}?token=${token}`, { method: 'PUT', body });

  check('rejects a bad sermon id', (await fetch(`${base}/upload/not-a-uuid?token=x`, { method: 'PUT', body: 'x' })).status === 400);
  check('rejects a missing token', (await fetch(`${base}/upload/${sermon.id}`, { method: 'PUT', body: 'x' })).status === 401);
  check('rejects a wrong token', (await put('wrong', 'x')).status === 403);
  check('accepts the right token', (await put('smoke-token', 'hello')).ok);
  check('refuses a reused link', (await put('smoke-token', 'hello')).status === 409);

  const [after] = await sql`select source_path, upload_token, status from sermons where id = ${sermon.id}`;
  check('records the file', !!after.source_path && after.upload_token === null, after.status);
  const [job] = await sql`select type from jobs where sermon_id = ${sermon.id}`;
  check('queues ingest', job?.type === 'ingest');

  check('404s an unknown path', (await fetch(`${base}/nope`)).status === 404);
  check('404s a missing file', (await fetch(`${base}/files/nothing/here.mp4`)).status === 404);
  check('refuses a path escape', [403, 404].includes((await fetch(`${base}/files/..%2f..%2fetc%2fpasswd`)).status));

  await sql`delete from churches where id = ${church.id}`;
} catch (err) {
  check('ran without crashing', false, err.message);
} finally {
  worker.kill('SIGKILL');
}

for (const c of checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
const failed = checks.filter(c => !c.pass).length;
if (failed) console.log('\n--- worker output ---\n' + log.slice(-1500));
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);

async function waitFor(fn, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if (await fn()) return; } catch {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`worker did not come up in ${ms}ms`);
}
