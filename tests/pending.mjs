/**
 * Pressing a button twice must not queue the same work twice, and a sermon
 * must not call itself ready while siblings are still running.
 */
import { sql, closeDb } from '../packages/core/src/db.js';
import { generateKinds, pendingGenerations } from '../apps/web/lib/data.js';

const [church] = await sql`insert into churches (name) values ('Pending test') returning *`;
const [sermon] = await sql`
  insert into sermons (church_id, title, status, transcript)
  values (${church.id}, 'Busy', 'ready', ${sql.json({ text: 'x', segments: [], words: [] })}) returning *`;

const first  = await generateKinds(sermon.id, ['carousel']);
const second = await generateKinds(sermon.id, ['carousel']);        // the double press
const third  = await generateKinds(sermon.id, ['carousel', 'summary']);  // only summary is new

const jobs = await sql`select payload from jobs where sermon_id = ${sermon.id} and type = 'generate'`;
const queued = jobs.flatMap(j => j.payload.kinds);
const pending = await pendingGenerations(sermon.id);

const checks = [
  ['first press queues it', first.join() === 'carousel'],
  ['second press queues nothing', second.length === 0],
  ['third press queues only what is new', third.join() === 'summary'],
  ['one carousel job, not three', queued.filter(k => k === 'carousel').length === 1],
  ['both kinds reported pending', pending.sort().join() === 'carousel,summary'],
];
for (const [n, p] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}`);
await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
