/** A sermon from captions alone: no video, no transcription, real output. */
import { sql, closeDb } from '../packages/core/src/db.js';
import { createSermonFromCaptions } from '../apps/web/lib/data.js';
import { runGenerate } from '../packages/core/src/pipeline/generate.js';
import { claimNext, finishJob } from '../packages/core/src/queue.js';

await sql`delete from churches where name = 'Caption test'`;

// A plausible auto-caption file, rolling repeats and all.
const lines = [
  'prayer is not just for needs', 'prayer is not just for needs prayer is not just for answers',
  'it is more for communion with god', 'in luke chapter eighteen verse one jesus said',
  'men ought to pray and not to faint', 'so when we are not praying we will be fainting',
  'and when you faint you will fail', 'what keeps us from fainting is praying',
  'there will be times you do not feel like praying', 'keep praying and the feeling will join you',
  'second corinthians twelve nine says his grace is sufficient', 'sufficient does not mean abundant it means enough',
];
let t = 1;
const vtt = 'WEBVTT\n\n' + lines.map(l => {
  const s = t, e = t + 3.4; t = e;
  const fmt = n => `00:${String(Math.floor(n / 60)).padStart(2, '0')}:${(n % 60).toFixed(3).padStart(6, '0')}`;
  return `${fmt(s)} --> ${fmt(e)}\n${l}`;
}).join('\n\n');

const sermon = await createSermonFromCaptions({
  churchName: 'Caption test', title: 'Growing In Prayer', preacher: 'Pastor Ben',
  captions: vtt, sourceUrl: 'https://youtu.be/abc',
});

const [row] = await sql`select * from sermons where id = ${sermon.id}`;
const checks = [
  ['a sermon exists with no video', !row.source_path && Boolean(row.transcript)],
  ['the transcript came from captions', row.transcript.provider === 'captions'],
  ['the rolling repeat is gone', (row.transcript.text.match(/prayer is not just for needs/g) ?? []).length === 1],
  ['scripture was detected', (row.transcript.scripture ?? []).length >= 1,
    (row.transcript.scripture ?? []).map(s => s.ref).join(', ')],
  ['duration came from the captions', Number(row.duration_s) > 0],
];

// Run the queued work in mock mode.
let guard = 0;
while (guard++ < 8) {
  const job = await claimNext('test');
  if (!job) break;
  if (job.type === 'generate') { await runGenerate(job); await finishJob(job.id); }
  else { await finishJob(job.id); }
}

const kinds = await sql`select kind, count(*)::int as n from items where sermon_id = ${sermon.id} group by kind order by kind`;
const renders = await sql`select count(*)::int as n from jobs where sermon_id = ${sermon.id} and type = 'render_clip'`;
checks.push(['items were produced', kinds.length > 0, kinds.map(k => `${k.kind}:${k.n}`).join(' ')]);
checks.push(['no render was queued without a video', renders[0].n === 0]);

const [after] = await sql`select status from sermons where id = ${sermon.id}`;
checks.push(['it does not sit on "rendering" forever', after.status === 'ready', after.status]);

for (const [n, p, d] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`);
await sql`delete from churches where name = 'Caption test'`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
