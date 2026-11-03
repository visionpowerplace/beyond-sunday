import { sql } from './db.js';

/**
 * Durable job queue on Postgres.
 *
 * Why not a cron or a serverless function: a 60-minute sermon takes minutes to
 * render and must survive a deploy, a restart and a crash. FOR UPDATE SKIP
 * LOCKED lets several workers pull from the same table without stepping on
 * each other, and a job that dies mid-flight is reclaimed by the stale sweep.
 */

/**
 * A running job is abandoned if its lock has not been touched recently.
 *
 * This used to be a flat 30 minutes, because a long clip render holds its
 * job for a long time and must not be stolen mid-render. But that also meant
 * a job orphaned by a deploy — claimed, then the container stops before it
 * finishes — sat untouchable for half an hour while the sermon showed
 * "making these now" and nothing happened.
 *
 * A live worker now touches locked_at every half minute, so a lock going
 * cold means the worker is gone, however long the job itself takes.
 */
const STALE_AFTER_MINUTES = 3;
export const HEARTBEAT_MS = 30_000;

/** Keep this worker's claim on the jobs it is actually still running. */
export async function heartbeat(jobIds, workerId) {
  if (!jobIds.length) return;
  await sql`
    update jobs set locked_at = now()
    where id = any(${jobIds}) and locked_by = ${workerId} and status = 'running'`;
}

/**
 * Hand back the jobs this worker holds, so a restart requeues them at once
 * instead of leaving them for the stale sweep.
 */
export async function releaseJobs(jobIds, workerId) {
  if (!jobIds.length) return;
  await sql`
    update jobs set status = 'queued', locked_at = null, locked_by = null,
      attempts = greatest(attempts - 1, 0), updated_at = now()
    where id = any(${jobIds}) and locked_by = ${workerId} and status = 'running'`;
}

export async function enqueue({ type, sermonId = null, itemId = null, payload = {}, runAfter = null, maxAttempts = 3 }) {
  const [job] = await sql`
    insert into jobs (type, sermon_id, item_id, payload, max_attempts, run_after)
    values (${type}, ${sermonId}, ${itemId}, ${sql.json(payload)}, ${maxAttempts}, ${runAfter ?? sql`now()`})
    returning *`;
  return job;
}

export async function claimNext(workerId) {
  await reclaimStale();
  const [job] = await sql`
    update jobs set
      status = 'running',
      attempts = attempts + 1,
      locked_at = now(),
      locked_by = ${workerId},
      updated_at = now()
    where id = (
      select id from jobs
      where status = 'queued' and run_after <= now()
      order by id
      for update skip locked
      limit 1
    )
    returning *`;
  return job ?? null;
}

export async function finishJob(id) {
  await sql`update jobs set status = 'done', locked_at = null, updated_at = now() where id = ${id}`;
}

export async function failJob(job, err) {
  const message = String(err?.stack || err).slice(0, 4000);
  const exhausted = job.attempts >= job.max_attempts;
  // Back off 1, 4, 9 minutes so a flaky provider does not burn the retries in ten seconds.
  const backoffMinutes = job.attempts * job.attempts;
  await sql`
    update jobs set
      status = ${exhausted ? 'failed' : 'queued'},
      last_error = ${message},
      locked_at = null,
      run_after = now() + ${backoffMinutes + ' minutes'}::interval,
      updated_at = now()
    where id = ${job.id}`;
  return { exhausted };
}

export async function reclaimStale() {
  await sql`
    update jobs set status = 'queued', locked_at = null, updated_at = now()
    where status = 'running'
      and locked_at < now() - ${STALE_AFTER_MINUTES + ' minutes'}::interval`;
}
