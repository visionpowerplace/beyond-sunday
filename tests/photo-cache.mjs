/**
 * Redo used to buy the whole deck again at four cents a slide, even when
 * nothing about the slides had changed, and editing one line re-bought the
 * other four photographs with it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { cachedPhoto } from '../packages/core/src/pipeline/carousel.js';
import { config } from '../packages/core/src/config.js';
import { closeDb } from '../packages/core/src/db.js';

await fs.rm(`${config.storageDir}/cache/photos`, { recursive: true, force: true });

const fake = Buffer.alloc(4096, 7);
let paidFor = 0;
const make = async () => { paidFor++; return fake; };

const first = await cachedPhoto('a stone path at sunrise', make);
assert.equal(first.cached, false, 'the first one has to be made');
assert.equal(paidFor, 1);

// The same slide again, which is what Redo does.
const second = await cachedPhoto('a stone path at sunrise', make);
assert.equal(second.cached, true, 'the second one comes from the cache');
assert.equal(paidFor, 1, 'and costs nothing');
assert.ok(second.bytes.equals(fake), 'the same photograph comes back');

// A genuinely different slide still gets its own photograph.
const other = await cachedPhoto('hands catching water from a spring', make);
assert.equal(other.cached, false);
assert.equal(paidFor, 2, 'different prompt, new photograph');

// A whole deck re-rendered unchanged: five slides, nothing more to pay.
const before = paidFor;
for (const scene of ['a stone path at sunrise', 'hands catching water from a spring']) {
  await cachedPhoto(scene, make);
}
assert.equal(paidFor, before, 'a repeat Redo of the same deck is free');

// A refusal must not be cached as if it were a photograph.
const failed = await cachedPhoto('something the provider refused', async () => null);
assert.equal(failed.bytes, null);
let retried = 0;
const retry = await cachedPhoto('something the provider refused', async () => { retried++; return fake; });
assert.equal(retried, 1, 'a failure is tried again rather than remembered');
assert.equal(retry.cached, false);

console.log('photo-cache: ok — paid for', paidFor + 1, 'photographs across 7 requests');
await closeDb();
