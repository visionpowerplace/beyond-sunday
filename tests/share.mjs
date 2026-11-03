/**
 * "Post now" used to do nothing at all.
 *
 * The network checkboxes lived on the scheduling form, so ticking Instagram
 * and pressing Post now left the item with no networks. publishNow returned
 * false, the action discarded the answer, and the page came back unchanged
 * with nothing said. These assertions describe the order the UI now follows:
 * save the ticked accounts first, then publish.
 */
import assert from 'node:assert/strict';
import { sql, closeDb } from '../packages/core/src/db.js';
import { scheduleItem, publishNow } from '../apps/web/lib/data.js';

const [church] = await sql`insert into churches (name) values ('Share test') returning *`;
const [sermon] = await sql`
  insert into sermons (church_id, title, status) values (${church.id}, 'S', 'ready') returning *`;
const [item] = await sql`
  insert into items (sermon_id, kind, ordinal, title, status, body)
  values (${sermon.id}, 'summary', 0, 'An item', 'approved', ${sql.json({ caption: 'Hi' })})
  returning *`;

// The old path: approve, press Post now, no accounts chosen.
assert.equal(await publishNow(item.id), false, 'refuses to post with no account chosen');
const queuedNone = await sql`
  select id from jobs where item_id = ${item.id} and type = 'publish' and status = 'queued'`;
assert.equal(queuedNone.length, 0, 'and queues nothing');

// The new path: the ticked accounts are saved first, then it posts.
await scheduleItem(item.id, null, ['instagram', 'facebook']);
const [ready] = await sql`select networks, status from items where id = ${item.id}`;
assert.deepEqual(ready.networks, ['instagram', 'facebook'], 'accounts saved without a date');
assert.equal(ready.status, 'approved', 'still approved, not scheduled');

assert.equal(await publishNow(item.id), true, 'posts once accounts are chosen');
const queued = await sql`
  select id, run_after from jobs where item_id = ${item.id} and type = 'publish' and status = 'queued'`;
assert.equal(queued.length, 1, 'exactly one publish job');
assert.ok(new Date(queued[0].run_after).getTime() <= Date.now() + 1000, 'due immediately');

// Pressing it twice must not post twice.
await publishNow(item.id);
const again = await sql`
  select id from jobs where item_id = ${item.id} and type = 'publish' and status = 'queued'`;
assert.equal(again.length, 1, 'a second press replaces the job rather than adding one');

// Scheduling for later is still a future job, not an immediate one.
const when = new Date(Date.now() + 3600_000);
await scheduleItem(item.id, when, ['instagram']);
const [sched] = await sql`
  select run_after from jobs where item_id = ${item.id} and type = 'publish' and status = 'queued'`;
assert.ok(new Date(sched.run_after).getTime() > Date.now() + 3_000_000, 'runs in the future');
const [schedItem] = await sql`select status from items where id = ${item.id}`;
assert.equal(schedItem.status, 'scheduled');

await sql`delete from jobs where sermon_id = ${sermon.id}`;
await sql`delete from items where sermon_id = ${sermon.id}`;
await sql`delete from sermons where id = ${sermon.id}`;
await sql`delete from churches where id = ${church.id}`;

console.log('share: ok — no accounts refuses, accounts then post works, no double post');
await closeDb();
