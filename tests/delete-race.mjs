/**
 * Deleting twice, and deleting something already gone, must not throw.
 * This reproduces the foreign key violation that showed a server error page.
 */
import { sql, closeDb } from '../packages/core/src/db.js';
import { deleteSermon, deleteFailedSermons } from '../apps/web/lib/data.js';
import { runDeleteSermon } from '../packages/core/src/pipeline/cleanup.js';

await sql`delete from churches where name = 'Race test'`;
const [church] = await sql`insert into churches (name) values ('Race test') returning *`;
const mk = (status = 'ready') => sql`
  insert into sermons (church_id, title, status) values (${church.id}, 'Doomed', ${status}) returning *`;

const checks = [];
const c = (n, p, d = '') => checks.push([n, p, d]);

// Press Delete, let the worker finish, then press Delete again.
const [a] = await mk();
c('first press queues the delete', await deleteSermon(a.id));
await runDeleteSermon({ sermon_id: a.id });
const [gone] = await sql`select 1 from sermons where id = ${a.id}`;
c('the worker removed it', !gone);

let threw = null;
try { c('a second press is quiet', (await deleteSermon(a.id)) === false); }
catch (err) { threw = err; c('a second press is quiet', false, err.message); }
c('and does not throw', threw === null, threw?.message ?? '');

// Two presses before the worker gets to it.
const [b] = await mk();
const [first, second] = await Promise.all([deleteSermon(b.id), deleteSermon(b.id)]);
c('a double click queues only one job', [first, second].filter(Boolean).length === 1);
const jobs = await sql`select count(*)::int as n from jobs where sermon_id = ${b.id} and type = 'delete_sermon'`;
c('one job in the table', jobs[0].n === 1, String(jobs[0].n));

// Clearing failures while one of them vanishes underneath.
const [f1] = await mk('failed');
const [f2] = await mk('failed');
await sql`delete from sermons where id = ${f2.id}`;
let bulkThrew = null;
try { await deleteFailedSermons(); } catch (err) { bulkThrew = err; }
c('clearing failures survives a missing row', bulkThrew === null, bulkThrew?.message ?? '');

// Deleting a sermon that never existed.
let ghostThrew = null;
try { await deleteSermon('00000000-0000-0000-0000-000000000000'); }
catch (err) { ghostThrew = err; }
c('deleting an unknown id is quiet', ghostThrew === null, ghostThrew?.message ?? '');

for (const [n, p, d] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`);
await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
