/**
 * Every carousel slide is a paid photograph, so the number of sets is the
 * single biggest lever on what a sermon costs. The prompt asks for three.
 * This asserts the code holds to three even when the model does not.
 */
import assert from 'node:assert/strict';
import { CAROUSEL_CAP, capCarousels } from '../packages/core/src/pipeline/generate.js';

assert.equal(CAROUSEL_CAP, 3, 'three sets, not five');

const five = { carousels: [0, 1, 2, 3, 4].map(i => ({ highlight_index: i, title: `Set ${i}`, slides: [] })) };
assert.equal(capCarousels(five.carousels).length, 3, 'a model returning five is cut to three');
assert.deepEqual(capCarousels(five.carousels).map(c => c.title), ['Set 0', 'Set 1', 'Set 2'],
  'and keeps the first three, which the prompt asks to be the strongest');

assert.equal(capCarousels([{ title: 'only one' }]).length, 1, 'fewer than three is left alone');
assert.equal(capCarousels([]).length, 0);
assert.equal(capCarousels(undefined).length, 0, 'nothing at all does not throw');

// What this is actually worth, at five slides and four cents a photograph.
const before = 5 * 5 * 0.04;
const after = CAROUSEL_CAP * 5 * 0.04;
assert.ok(after < before);
console.log(`carousel-cap: ok — a sermon of carousels goes from about $${before.toFixed(2)} to $${after.toFixed(2)}`);
