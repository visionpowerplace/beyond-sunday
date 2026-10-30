/**
 * Scheduling must create a job that fires at the right time, rescheduling
 * must cancel the old one, and publishing must refuse an item nobody approved.
 */
import { sql, closeDb } from '../packages/core/src/db.js';
import { scheduleItem } from '../apps/web/lib/data.js';
import { runPublish } from '../packages/core/src/pipeline/publish.js';

const [church] = await sql`insert into churches (name) values ('Publish test') returning *`;
const [sermon] = await sql`insert into sermons (church_id, title, status) values (${church.id}, 'S', 'ready') returning *`;
const mk = (kind, extra = {}) => sql`
  insert into items (sermon_id, kind, ordinal, title, status, body, asset_path)
  values (${sermon.id}, ${kind}, 0, 'An item', ${extra.status ?? 'approved'},
          ${sql.json(extra.body ?? { caption: 'Hello' })}, ${extra.asset ?? null}) returning *`;

const [clip] = await mk('clip', { asset: 'a/b.mp4' });
const soon = new Date(Date.now() + 3600_000);
const later = new Date(Date.now() + 7200_000);

await scheduleItem(clip.id, soon, ['instagram']);
const first = await sql`select id, run_after from jobs where item_id = ${clip.id} and type = 'publish' and status = 'queued'`;
const [afterSchedule] = await sql`select status, scheduled_for, publish_key, networks from items where id = ${clip.id}`;

await scheduleItem(clip.id, later, ['instagram', 'facebook']);
const second = await sql`select id, run_after from jobs where item_id = ${clip.id} and type = 'publish' and status = 'queued'`;

// Unscheduling clears the job and drops back to approved.
await scheduleItem(clip.id, null, []);
const none = await sql`select id from jobs where item_id = ${clip.id} and type = 'publish' and status = 'queued'`;
const [afterClear] = await sql`select status, scheduled_for from items where id = ${clip.id}`;

// A rejected item must never go out, even if a job somehow reaches it.
const [rejected] = await mk('clip', { status: 'rejected', asset: 'a/b.mp4' });
const skipped = await runPublish({ item_id: rejected.id });

const checks = [
  ['scheduling queues one publish job', first.length === 1],
  ['the job waits for the scheduled time', Math.abs(new Date(first[0].run_after) - soon) < 2000],
  ['the item records when and where', afterSchedule.status === 'scheduled' && afterSchedule.networks.join() === 'instagram'],
  ['it gets an idempotency key', Boolean(afterSchedule.publish_key)],
  ['rescheduling replaces the job', second.length === 1 && second[0].id !== first[0].id],
  ['the new job uses the new time', Math.abs(new Date(second[0].run_after) - later) < 2000],
  ['unscheduling cancels it', none.length === 0 && afterClear.status === 'approved' && !afterClear.scheduled_for],
  ['a rejected item is never posted', Boolean(skipped?.skipped)],
];
for (const [n, p] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}`);
await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
