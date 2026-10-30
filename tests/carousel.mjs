// A carousel renders to real images in the church's colours.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { sql, closeDb } from '../packages/core/src/db.js';
import { config } from '../packages/core/src/config.js';
import { runRenderCarousel } from '../packages/core/src/pipeline/carousel.js';

const [church] = await sql`
  insert into churches (name, brand_primary, brand_accent)
  values ('Grace Chapel', '#1b2a4a', '#d98c3f') returning *`;
const [sermon] = await sql`insert into sermons (church_id, title, status) values (${church.id}, 'Test', 'ready') returning *`;
const slides = [
  { heading: 'Not Just For Needs', body: 'Prayer is more for communion than for answers.', motif: 'light' },
  { heading: 'Pray Or Faint', body: 'What keeps us from fainting is praying.', motif: 'path' },
  { heading: 'Growth In Secret', body: 'Set specifics. Have a calendar for prayer.', motif: 'seed' },
  { heading: 'A Shield In Trouble', body: 'Faith holds when the pressure comes.', motif: 'nonsense-motif' },
];
const [item] = await sql`
  insert into items (sermon_id, kind, ordinal, title, body)
  values (${sermon.id}, 'carousel', 0, 'Growing In Prayer', ${sql.json({ slides })}) returning *`;

const out = await runRenderCarousel({ item_id: item.id });
const [after] = await sql`select body from items where id = ${item.id}`;
const images = after.body.images ?? [];

const checks = [['renders one image per slide', out.slides === slides.length && images.length === slides.length]];
for (const [i, rel] of images.entries()) {
  const full = path.join(config.storageDir, rel);
  const meta = await sharp(full).metadata();
  checks.push([`slide ${i + 1} is 1080x1350 png`, meta.width === 1080 && meta.height === 1350 && meta.format === 'png']);
}
// The unknown motif on slide 4 must fall back rather than throw.
checks.push(['an unknown motif still renders', fs.existsSync(path.join(config.storageDir, images[3] ?? 'nope'))]);

for (const [n, p] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}`);
// contact sheet to look at
await sharp({ create: { width: 4 * 300, height: 380, channels: 3, background: '#faf8f3' } })
  .composite(await Promise.all(images.map(async (rel, i) => ({
    input: await sharp(path.join(config.storageDir, rel)).resize(284, 355).toBuffer(), left: i * 300 + 8, top: 12 }))))
  .png().toFile('/tmp/claude-0/-home-claude/e72e9a44-0eba-5222-a84e-51923fbc19ad/scratchpad/carousel/branded.png');

await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
