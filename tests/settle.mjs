// A finished job must not call the sermon ready while another is still running.
import { sql, closeDb } from '../packages/core/src/db.js';
import { runGenerate } from '../packages/core/src/pipeline/generate.js';
import { enqueue } from '../packages/core/src/queue.js';

const [church] = await sql`insert into churches (name) values ('Settle test') returning *`;
const segments = [{ text: 'A sermon about prayer and waiting.', start: 0, end: 30 }];
const [sermon] = await sql`
  insert into sermons (church_id, title, status, duration_s, transcript)
  values (${church.id}, 'Settle', 'generating', 30,
          ${sql.json({ text: segments[0].text, segments, words: [], scripture: [] })}) returning *`;

// Two jobs: one we run, one left queued as if a sibling were still going.
const mine = await enqueue({ type: 'generate', sermonId: sermon.id, payload: { kinds: ['summary'] } });
await enqueue({ type: 'generate', sermonId: sermon.id, payload: { kinds: ['devotional'] } });

await runGenerate({ sermon_id: sermon.id, id: mine.id, payload: { kinds: ['summary'] } });
const [mid] = await sql`select status from sermons where id = ${sermon.id}`;

// Now nothing else is outstanding.
await sql`delete from jobs where sermon_id = ${sermon.id} and id <> ${mine.id}`;
await runGenerate({ sermon_id: sermon.id, id: mine.id, payload: { kinds: ['summary'] } });
const [end] = await sql`select status from sermons where id = ${sermon.id}`;

const checks = [
  ['stays generating while a sibling is queued', mid.status === 'generating'],
  ['becomes ready once nothing is left', end.status === 'ready'],
];
for (const [n, p] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}  (${n.includes('stays') ? mid.status : end.status})`);
await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
