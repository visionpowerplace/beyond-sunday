// node scripts/new-sermon.js "<youtube url>" "<title>" ["<preacher>"] ["<church>"]
import { sql, closeDb } from '@bs/core/db.js';
import { enqueue } from '@bs/core/queue.js';

const [url, title, preacher = null, churchName = 'My church'] = process.argv.slice(2);
if (!url || !title) {
  console.error('usage: node scripts/new-sermon.js "<youtube url>" "<title>" ["<preacher>"] ["<church>"]');
  process.exit(1);
}

let [church] = await sql`select * from churches where name = ${churchName}`;
if (!church) [church] = await sql`insert into churches (name) values (${churchName}) returning *`;

const [sermon] = await sql`
  insert into sermons (church_id, title, preacher, source_url, status)
  values (${church.id}, ${title}, ${preacher}, ${url}, 'queued') returning *`;

await enqueue({ type: 'ingest', sermonId: sermon.id });
console.log(`queued ${sermon.id} — open /sermon/${sermon.id}`);
await closeDb();
