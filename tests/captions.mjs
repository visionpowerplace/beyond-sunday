import { parseCaptions } from '../packages/core/src/captions.js';

const checks = [];
const c = (n, p, d = '') => checks.push([n, p, d]);

// A YouTube auto-caption VTT, with the rolling repetition it always has.
const vtt = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:03.500
prayer is not just for needs

00:00:03.500 --> 00:00:06.000
prayer is not just for needs prayer is not just

00:00:06.000 --> 00:00:09.200
for answers it is more for communion.

00:00:09.200 --> 00:00:12.000
[MUSIC]

00:00:12.000 --> 00:00:16.400
<c.colorE5E5E5>So when you pray this morning</c> do not only ask him to change the room.`;

const a = parseCaptions(vtt);
c('reads vtt timings', a.timed && a.words.length > 0);
c('drops the rolling repeat', (a.text.match(/prayer is not just for needs/g) ?? []).length === 1, a.text.slice(0, 70));
c('drops [MUSIC]', !/music/i.test(a.text));
c('strips vtt styling tags', !a.text.includes('<c.'));
c('words carry increasing timings', a.words[0].start < a.words.at(-1).start);
c('duration comes from the last cue', Math.abs(a.duration - 16.4) < 0.01, String(a.duration));
c('groups cues into segments', a.segments.length >= 1 && a.segments[0].end > a.segments[0].start);

// SRT, with sequence numbers and comma decimals.
const srt = `1
00:00:02,000 --> 00:00:05,000
Men ought to pray and not to faint.

2
00:00:05,000 --> 00:00:08,000
That is what Jesus taught in Luke chapter eighteen.`;
const b = parseCaptions(srt);
c('reads srt', b.timed && /Men ought to pray/.test(b.text));
c('drops srt sequence numbers', !/^\s*1\s/.test(b.text));

// Plain text with no timings at all.
const plain = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ') + '. And another sentence here.';
const d = parseCaptions(plain);
c('accepts untimed text', !d.timed && d.words.length === 0 && d.segments.length >= 1);

for (const [n, p, extra] of [['rejects an empty file', (() => { try { parseCaptions(''); return false; } catch { return true; } })()],
                             ['rejects a few stray words', (() => { try { parseCaptions('hello there'); return false; } catch { return true; } })()]]) {
  c(n, p, extra ?? '');
}

for (const [n, p, d2] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}${d2 ? '  — ' + d2 : ''}`);
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
process.exit(failed ? 1 : 0);
