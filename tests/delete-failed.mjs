// Clearing failures queues a delete for each one and leaves the rest alone.
import { sql, closeDb } from '../packages/core/src/db.js';
import { deleteFailedSermons } from '../apps/web/lib/data.js';

const [church] = await sql`insert into churches (name) values ('Bulk delete test') returning *`;
const mk = (title, status) => sql`insert into sermons (church_id, title, status) values (${church.id}, ${title}, ${status}) returning *`;
const [f1] = await mk('Failed one', 'failed');
const [f2] = await mk('Failed two', 'failed');
const [ok] = await mk('Good one', 'ready');

const n = await deleteFailedSermons();
const rows = await sql`select id, status from sermons where church_id = ${church.id}`;
const jobs = await sql`select sermon_id from jobs where type = 'delete_sermon' and sermon_id in (${f1.id}, ${f2.id}, ${ok.id})`;

const checks = [
  ['counts both failures', n === 2],
  ['queues a delete for each', jobs.length === 2],
  ['leaves the good one alone', rows.find(r => r.id === ok.id)?.status === 'ready'],
  ['marks failures deleting', rows.filter(r => r.status === 'deleting').length === 2],
];
for (const [name, pass] of checks) console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`);
await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
