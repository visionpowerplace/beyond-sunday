import assert from 'node:assert/strict';
import { oneAtATime, isCongestion, withRetry } from '../packages/core/src/providers/image.js';

// The gate must stop concurrent image requests overlapping: OpenRouter
// reserves credit per in-flight request and refuses the ones that collide.
let live = 0, peak = 0;
const job = async () => {
  live++; peak = Math.max(peak, live);
  await new Promise(r => setTimeout(r, 30));
  live--;
  return 'ok';
};
const results = await Promise.all([1, 2, 3, 4, 5].map(() => oneAtATime(job)));
assert.equal(peak, 1, `only one request in flight at a time (saw ${peak})`);
assert.deepEqual(results, ['ok', 'ok', 'ok', 'ok', 'ok'], 'every caller still gets its result');

// A rejection must not wedge the gate for everyone behind it.
await assert.rejects(oneAtATime(async () => { throw new Error('boom'); }));
assert.equal(await oneAtATime(async () => 'after'), 'after', 'gate survives a failure');

// Telling "not right now" apart from "no money".
assert.equal(isCongestion('402: {"error":{"message":"This request would exceed your available credits given your current in-flight requests."}}'), true);
assert.equal(isCongestion('402: {"error":{"message":"Insufficient credits. Add more to continue."}}'), false);

// Congestion is retried; a real refusal is not.
let tries = 0;
const eventually = await withRetry(async () => {
  if (++tries < 3) throw new Error('402 in-flight requests outstanding');
  return 'photo';
}, 3);
assert.equal(eventually, 'photo');
assert.equal(tries, 3, 'retried until it settled');

let hardTries = 0;
await assert.rejects(withRetry(async () => { hardTries++; throw new Error('402 Insufficient credits'); }, 3));
assert.equal(hardTries, 1, 'a genuine out-of-credit is not retried');

console.log('image-gate: ok — peak concurrency', peak, '| congestion retried, hard 402 not');
