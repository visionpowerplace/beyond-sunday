/**
 * Where the money goes, and not paying for the same photograph twice.
 *
 * Nothing recorded provider spend before, so the first sign of the bill was
 * OpenRouter refusing a request. And pressing Redo bought the whole deck
 * again at the per-image rate even when the slides had not changed.
 */
import assert from 'node:assert/strict';
import { sql, closeDb } from '../packages/core/src/db.js';
import { recordSpend, spendForSermon, spendForChurch, money } from '../packages/core/src/spend.js';

const [church] = await sql`insert into churches (name) values ('Spend test') returning *`;
const [sermon] = await sql`
  insert into sermons (church_id, title, status) values (${church.id}, 'S', 'ready') returning *`;

// One sermon's worth: a handful of model calls and a deck of photographs.
for (const kind of ['clip', 'highlight', 'carousel', 'writeup', 'summary', 'devotional']) {
  await recordSpend({ sermonId: sermon.id, churchId: church.id, stage: 'llm',
    model: 'anthropic/claude-sonnet-4.5', costUsd: 0.021, detail: kind });
}
for (let i = 0; i < 20; i++) {
  await recordSpend({ sermonId: sermon.id, churchId: church.id, stage: 'image',
    model: 'google/gemini-2.5-flash-image', costUsd: 0.04 });
}

const bill = await spendForSermon(sermon.id);
assert.ok(Math.abs(bill.total - (0.021 * 6 + 0.04 * 20)) < 0.0001, 'the total adds up');

const images = bill.byStage.find(r => r.stage === 'image');
const llm = bill.byStage.find(r => r.stage === 'llm');
assert.equal(images.units, 20);
assert.equal(llm.units, 6);
assert.ok(images.cost > llm.cost * 5,
  'images dominate, which is the thing this was built to show');
assert.equal(bill.byStage[0].stage, 'image', 'the biggest line comes first');

// Nonsense is ignored rather than poisoning the total.
await recordSpend({ sermonId: sermon.id, churchId: church.id, stage: 'image', costUsd: NaN });
await recordSpend({ sermonId: sermon.id, churchId: church.id, stage: 'image', costUsd: -5 });
const after = await spendForSermon(sermon.id);
assert.ok(Math.abs(after.total - bill.total) < 0.0001, 'a bad figure changes nothing');

const perChurch = await spendForChurch(church.id, 30);
assert.ok(Math.abs(perChurch.total - bill.total) < 0.0001, 'the church total matches');

assert.equal(money(0.926), '$0.93');
assert.equal(money(0), '$0.00');
assert.equal(money(0.004), 'under 1c');

await sql`delete from spend where church_id = ${church.id}`;
await sql`delete from sermons where id = ${sermon.id}`;
await sql`delete from churches where id = ${church.id}`;

console.log('spend: ok — one sermon of carousels costs', money(bill.total),
  `(${money(images.cost)} of it photographs)`);
await closeDb();
