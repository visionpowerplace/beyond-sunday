// Deleting a sermon removes its folder and its row.
import fs from 'node:fs';
import path from 'node:path';
import { sql, closeDb } from '../packages/core/src/db.js';
import { config } from '../packages/core/src/config.js';
import { runDeleteSermon } from '../packages/core/src/pipeline/cleanup.js';

const [church] = await sql`insert into churches (name) values ('Delete test') returning *`;
const [sermon] = await sql`insert into sermons (church_id, title, status) values (${church.id}, 'Doomed', 'ready') returning *`;
await sql`insert into items (sermon_id, kind, ordinal, title) values (${sermon.id}, 'clip', 0, 'a clip')`;

const dir = path.join(config.storageDir, sermon.id);
await fs.promises.mkdir(path.join(dir, 'clips'), { recursive: true });
await fs.promises.writeFile(path.join(dir, 'source.mp4'), Buffer.alloc(4 * 1024 * 1024));
await fs.promises.writeFile(path.join(dir, 'clips', 'a.mp4'), Buffer.alloc(512 * 1024));

const out = await runDeleteSermon({ sermon_id: sermon.id });
const [gone] = await sql`select 1 from sermons where id = ${sermon.id}`;
const [orphan] = await sql`select 1 from items where sermon_id = ${sermon.id}`;

const checks = [
  ['folder removed', !fs.existsSync(dir)],
  ['sermon row removed', !gone],
  ['items removed with it', !orphan],
  ['reports what it freed', /MB|GB/.test(out.freed)],
];
for (const [n, p] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}`);
console.log(`  freed ${out.freed}`);
await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
