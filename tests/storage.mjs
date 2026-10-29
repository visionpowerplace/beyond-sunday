/**
 * Retention: a finished sermon's source is cleared once it ages out; its
 * clips and transcript survive.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sql, closeDb } from '../packages/core/src/db.js';
import { config } from '../packages/core/src/config.js';
import { diskFree, reclaimSpace, human } from '../packages/core/src/pipeline/cleanup.js';

const [church] = await sql`insert into churches (name) values ('Storage test') returning *`;
const dir = path.join(config.storageDir, 'storage-test');
await fs.promises.mkdir(dir, { recursive: true });
const src = path.join(dir, 'source.mp4');
await fs.promises.writeFile(src, Buffer.alloc(8 * 1024 * 1024, 1));   // 8MB stand-in

const [old] = await sql`
  insert into sermons (church_id, title, source_path, audio_path, status, updated_at)
  values (${church.id}, 'Old sermon', ${src}, null, 'ready', now() - interval '10 days') returning *`;
const [fresh] = await sql`
  insert into sermons (church_id, title, source_path, status)
  values (${church.id}, 'Today', ${src}, 'ready') returning *`;
const [busy] = await sql`
  insert into sermons (church_id, title, source_path, status, updated_at)
  values (${church.id}, 'Still rendering', ${src}, 'rendering', now() - interval '10 days') returning *`;
await sql`insert into items (sermon_id, kind, ordinal, title) values (${busy.id}, 'clip', 0, 'unrendered')`;

const before = await diskFree();
const result = await reclaimSpace();

const rows = await sql`select id, source_path, source_cleaned_at from sermons where church_id = ${church.id}`;
const by = id => rows.find(r => r.id === id);

const checks = [
  ['aged-out sermon cleared', by(old.id).source_path === null && by(old.id).source_cleaned_at !== null],
  ["today's sermon kept", by(fresh.id).source_path !== null],
  ['sermon with a clip still rendering kept', by(busy.id).source_path !== null],
  ['file actually deleted', !fs.existsSync(src)],
];
for (const [name, pass] of checks) console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`);
console.log(`  disk ${human(before.free)} free of ${human(before.total)}, freed ${human(result.freedBytes)}`);

await sql`delete from churches where id = ${church.id}`;
await fs.promises.rm(dir, { recursive: true, force: true });
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
