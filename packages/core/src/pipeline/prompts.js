/**
 * Prompts, one per deliverable.
 *
 * Deliberately not one big call any more. A single prompt that produced
 * everything meant waiting three minutes for a devotional nobody asked for,
 * and a truncated JSON document took the whole pack down with it. Each kind is
 * now its own call: faster to first result, cheaper for someone who wants one
 * thing, and a failure costs only that one item type.
 */

export const BASE_SYSTEM = `You are a church media producer. You are given the transcript of one sermon, with timestamps, and you turn part of it into content.

The church's pastor reads everything you produce before it is published. Your job is to be useful and honest, never to flatter the preacher or improve on what they said.

HARD RULES
1. Never put words in the preacher's mouth. Quotes must be verbatim from the transcript. Everything else is clearly your own summary or writing.
2. Scripture references must be exactly as the preacher said them. If you are unsure which chapter and verse was meant, leave them out rather than guessing.
3. Write in the preacher's register, not in marketing voice. No hype words, no emoji in body text, no "game-changing", no "unlock".
4. If the transcript is too short, too broken or too off-topic to do this honestly, return fewer items. Never pad.
5. Return only the JSON object asked for.`;

const CLIP_TASK = `Choose the moments that work as standalone short videos.

A clip must stand on its own. If a passage only makes sense with what came before it, either widen the clip or do not choose it.
If a clip ends mid-argument, mid-sentence, or on a qualifier the preacher then reverses, add "cut_off_argument" to its flags. Do not quietly drop it: the review queue needs to see it.

Timing: between 20 and 75 seconds, aim for 30 to 45. start_s at the start of a sentence, end_s at the end of one. Never overlap two clips.

{
  "clips": [
    { "title": "4-8 words, the idea not a teaser",
      "hook": "the first spoken line of the clip, verbatim",
      "start_s": 0, "end_s": 0,
      "score": 0,
      "flags": [],
      "caption": "2-3 sentences for the post, your own words",
      "scripture_refs": [] }
  ],
  "music_warning": true/false
}

4 to 8 clips, best first. music_warning is true if the transcript shows singing or a worship set, because clips over music get muted or claimed by rights holders.`;

const HIGHLIGHT_TASK = `Find the things this sermon actually argued. Not topics — claims.

{
  "highlights": [
    { "point": "one sentence: a thing the sermon argued",
      "explain": "2-3 sentences in your own words",
      "quote": "verbatim supporting line from the transcript",
      "quote_at_s": 0,
      "scripture_refs": [] }
  ]
}

3 to 5 highlights.`;

const CAROUSEL_TASK = `Turn each point below into a slide carousel.

{
  "carousels": [
    { "highlight_index": 0,
      "title": "slide-one headline, under 8 words",
      "slides": [ { "heading": "under 6 words", "body": "under 25 words" } ],
      "caption": "2-3 sentences" }
  ]
}

One carousel per point, 4 to 6 slides each.`;

const WRITEUP_TASK = `Write a short post developing each point below.

{
  "writeups": [
    { "highlight_index": 0,
      "title": "a real title, not a label",
      "body": "120-200 words, plain prose, no headings, no bullet points",
      "caption": "1-2 sentences" }
  ]
}`;

const SUMMARY_TASK = `Summarise the sermon for someone who missed it.

{
  "summary": {
    "title": "the sermon in a title",
    "body": "150 words: what was said, in order, plainly",
    "caption": "2 sentences inviting someone who missed it" }
}`;

const DEVOTIONAL_TASK = `Write a five-day devotional from this sermon, Monday to Friday, each day developing a different part of it.

{
  "devotional": [
    { "day": 1,
      "title": "short",
      "scripture_ref": "as spoken in the sermon, or empty",
      "body": "100-150 words",
      "question": "one reflection question",
      "prayer": "2-3 sentences" }
  ]
}

Exactly five days.`;

export const KINDS = {
  clip:       { label: 'Clips',                task: CLIP_TASK,       needsHighlights: false, maxTokens: 6000 },
  highlight:  { label: 'Highlight points',     task: HIGHLIGHT_TASK,  needsHighlights: false, maxTokens: 3000 },
  carousel:   { label: 'Carousels',            task: CAROUSEL_TASK,   needsHighlights: true,  maxTokens: 4000 },
  writeup:    { label: 'Write-ups',            task: WRITEUP_TASK,    needsHighlights: true,  maxTokens: 4000 },
  summary:    { label: 'Summary',              task: SUMMARY_TASK,    needsHighlights: false, maxTokens: 1500 },
  devotional: { label: 'Five-day devotional',  task: DEVOTIONAL_TASK, needsHighlights: false, maxTokens: 4000 },
};

export function buildUser({ kind, title, preacher, church, durationS, segments, scripture, highlights }) {
  const spec = KINDS[kind];
  const timeline = segments.map(s => `[${fmt(s.start)}-${fmt(s.end)}] ${s.text.trim()}`).join('\n');

  const points = spec.needsHighlights && highlights?.length
    ? `\nTHE POINTS, in order (highlight_index is their position here, starting at 0):\n`
      + highlights.map((h, i) => `${i}. ${h.point}${h.explain ? ' — ' + h.explain : ''}`).join('\n') + '\n'
    : '';

  return `SERMON
Title: ${title}
Preacher: ${preacher || 'unknown'}
Church: ${church || 'unknown'}
Length of this section: ${durationS ? fmt(durationS) : 'unknown'}

SCRIPTURE REFERENCES DETECTED IN THE AUDIO (use these, do not invent others):
${scripture?.length ? scripture.map(s => `- ${s.ref} at ${fmt(s.start_s ?? 0)}`).join('\n') : '- none detected'}
${points}
TRANSCRIPT WITH TIMESTAMPS
${timeline}

TASK
${spec.task}`;
}

export const LOCATE_SYSTEM = `You are given the timestamped transcript of a church service. Find where the preaching is.

A full service recording usually runs: welcome, worship songs, announcements, offering, the sermon, an altar call, a closing. You are looking for the teaching block only — one person speaking continuously, developing an argument, usually the longest unbroken stretch of speech in the recording.

Do NOT include: sung worship, the song lyrics between verses, announcements, the offering appeal, the welcome, the benediction. A short prayer immediately before or after the sermon may be included if it runs straight into the teaching.

If the recording is only the sermon with nothing else around it, return the whole thing.
If you genuinely cannot tell where the teaching starts, say so rather than guessing.`;

export function locateUser({ segments }) {
  const timeline = segments.map(s => `[${fmt(s.start)}-${fmt(s.end)}] ${s.text.trim()}`).join('\n');
  return `TRANSCRIPT\n${timeline}\n\nReturn JSON:\n{\n  "start_s": 0,\n  "end_s": 0,\n  "confident": true,\n  "reason": "one sentence on what marked the boundaries",\n  "contains_singing": true/false\n}\n\nReturn only the JSON object.`;
}

function fmt(s) {
  const t = Math.max(0, Math.round(s || 0));
  const m = Math.floor(t / 60), sec = t % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
