import assert from 'node:assert/strict';
import { sql, closeDb } from '../packages/core/src/db.js';
import { enqueue, claimNext, heartbeat, releaseJobs, reclaimStale } from '../packages/core/src/queue.js';

await sql`delete from jobs`;
await sql`delete from churches`;
const [church] = await sql`insert into churches (name) values ('Heartbeat Test') returning *`;
const [sermon] = await sql`
  insert into sermons (church_id, title, status) values (${church.id}, 'HB', 'generating') returning *`;

await enqueue({ sermonId: sermon.id, type: 'generate', payload: { kinds: ['carousel'] } });
const job = await claimNext('worker-a');
assert.ok(job, 'claimed a job');

// THE BUG: heartbeat used sql.array(), which Postgres rejects on the right of
// ANY(). It threw on every call into a silent catch, so locked_at was never
// refreshed and any job running longer than the stale window was reclaimed
// and re-run while still in flight.
await sql`update jobs set locked_at = now() - interval '30 minutes' where id = ${job.id}`;
await heartbeat([job.id], 'worker-a');

const [afterBeat] = await sql`select status, locked_at, locked_by from jobs where id = ${job.id}`;
assert.equal(afterBeat.status, 'running', 'still running');
assert.ok(Date.now() - new Date(afterBeat.locked_at).getTime() < 60_000,
  'heartbeat actually moved locked_at to now');

// A beating job survives the sweep, however long it has been working.
await reclaimStale();
const [swept] = await sql`select status from jobs where id = ${job.id}`;
assert.equal(swept.status, 'running', 'a job that heartbeats is not reclaimed');

// Another worker's heartbeat must not touch it.
await sql`update jobs set locked_at = now() - interval '30 minutes' where id = ${job.id}`;
await heartbeat([job.id], 'worker-b');
const [foreign] = await sql`select locked_at from jobs where id = ${job.id}`;
assert.ok(Date.now() - new Date(foreign.locked_at).getTime() > 60_000,
  'a different worker cannot refresh someone else\'s lock');

// A silent job IS reclaimed, which is the whole point of the short window.
await reclaimStale();
const [stale] = await sql`select status, locked_at from jobs where id = ${job.id}`;
assert.equal(stale.status, 'queued', 'an abandoned job goes back on the queue');

// Shutdown hands work back without charging the restart to the retry count.
const again = await claimNext('worker-a');
const attemptsBefore = again.attempts;
await releaseJobs([again.id], 'worker-a');
const [released] = await sql`select status, locked_by, attempts from jobs where id = ${again.id}`;
assert.equal(released.status, 'queued', 'released back to the queue');
assert.equal(released.locked_by, null, 'lock cleared');
assert.equal(released.attempts, attemptsBefore - 1, 'the restart is not a failed attempt');

console.log('heartbeat: ok — lock refreshed, foreign worker refused, release works');
await closeDb();
