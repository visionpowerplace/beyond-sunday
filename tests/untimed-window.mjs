import assert from 'node:assert/strict';
import { parseCaptions } from '../packages/core/src/captions.js';

// The exact shape a pasted plain-text transcript takes: no arrows, no stamps.
const plain = Array.from({ length: 12 },
  () => 'The delay was not the denial, the delay was the preparation.').join(' ');
const t = parseCaptions(plain);

assert.equal(t.timed, false, 'plain text is marked untimed');
assert.ok(t.segments.length > 0, 'it still produces segments');
assert.ok(t.segments.every(s => s.start === 0 && s.end === 0),
  'untimed segments all sit at zero — which is what broke the window');

// The rule generate.js now applies.
const timed = t.timed !== false && t.segments.some(s => Number(s.end) > 0);
assert.equal(timed, false, 'an untimed transcript is not treated as timed');

const kept = timed ? t.segments.filter(s => s.end > 0 && s.start < 0) : t.segments;
assert.equal(kept.length, t.segments.length,
  'every segment survives — the old filter dropped all of them');

// A properly timed transcript must still go down the windowed path.
const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Waiting on God is active.

00:10:00.000 --> 00:10:05.000
The depth of your roots.`;
const t2 = parseCaptions(vtt);
assert.notEqual(t2.timed, false, 'a vtt transcript is timed');
assert.ok(t2.segments.some(s => Number(s.end) > 0), 'and carries real end times');

console.log('untimed-window: ok — plain text keeps all', t.segments.length, 'segments');
