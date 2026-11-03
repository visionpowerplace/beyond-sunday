import assert from 'node:assert/strict';
import { fixDashes, dropPreacher, cleanDeep } from '../packages/core/src/clean.js';

// Dashes become the punctuation that actually belongs there.
assert.equal(fixDashes('You are asking for a bigger house — God is building a bigger you.'),
  'You are asking for a bigger house. God is building a bigger you.');
assert.equal(fixDashes('The delay was not the denial — it was the preparation.'),
  'The delay was not the denial. It was the preparation.');
assert.equal(fixDashes('Waiting on God is active — the posture of a servant.'),
  'Waiting on God is active, the posture of a servant.');
assert.equal(fixDashes('Roots go down – quietly.'), 'Roots go down, quietly.');
assert.equal(fixDashes('— A thought that trails'), 'A thought that trails');
assert.equal(fixDashes('Two things happen here -- both of them slowly.'),
  'Two things happen here, both of them slowly.');

// Genuine hyphens are correct and must survive.
assert.equal(fixDashes('A five-day devotional on self-control.'),
  'A five-day devotional on self-control.');
assert.equal(fixDashes('Plain text with no dashes at all.'), 'Plain text with no dashes at all.');

// The preacher disappears; the claim remains.
assert.equal(dropPreacher('Pastor Beckley reminds us that waiting changes you.', 'Benjamin Beckley'),
  'Waiting changes you.');
assert.equal(dropPreacher('The pastor explains that delay is preparation.', 'Benjamin Beckley'),
  'Delay is preparation.');
assert.equal(dropPreacher('In this message, Benjamin Beckley argues for patience.', 'Benjamin Beckley'),
  'In this message, argues for patience.');
assert.ok(!dropPreacher('Beckley says the roots matter most.', 'Benjamin Beckley').includes('Beckley'));

// An honorific with no name attached still goes.
assert.ok(!/pastor/i.test(dropPreacher('Pastor Benjamin walks through Micah 6.', 'Benjamin Beckley')));

// Writing that was already about the message is left alone.
const clean = 'Waiting changes your capacity, not your circumstances.';
assert.equal(dropPreacher(clean, 'Benjamin Beckley'), clean);

// The deep pass reaches every string in a carousel payload.
const payload = {
  title: 'Pastor Beckley says wait well',
  slides: [{ heading: 'Two Kinds — One Right', body: 'The pastor explains that waiting is active.' }],
  caption: 'Five-day series — start today.',
  highlight_index: 2,
  score: 88,
};
const out = cleanDeep(payload, 'Benjamin Beckley');
assert.ok(!/—|–/.test(JSON.stringify(out)), 'no dash survives anywhere');
assert.ok(!/Beckley|pastor/i.test(JSON.stringify(out)), 'no preacher survives anywhere');
assert.equal(out.highlight_index, 2, 'numbers pass through untouched');
assert.equal(out.score, 88);
assert.ok(out.slides[0].heading.includes('Two Kinds'), 'real content kept');
assert.ok(out.caption.includes('Five-day'), 'hyphenated words kept');

console.log('clean: ok —', JSON.stringify(out.slides[0]));
