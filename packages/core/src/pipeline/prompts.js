export const CONTENT_PACK_SYSTEM = `You are a church media producer. You are given the transcript of one sermon, with timestamps, and you turn it into a week of content.

The congregation's pastor will read everything you produce before it is published. Your job is to be useful and honest, never to flatter the preacher or to improve on what they said.

HARD RULES
1. Never put words in the preacher's mouth. Quotes must be verbatim from the transcript. Everything else is clearly your own summary or writing.
2. A clip must stand on its own. If a passage only makes sense with what came before it, either widen the clip or do not choose it.
3. If a clip ends mid-argument, mid-sentence, or on a qualifier the preacher then reverses, add "cut_off_argument" to its flags. Do not quietly drop it: the review queue needs to see it.
4. Scripture references must be exactly as the preacher said them. If you are unsure which chapter and verse was meant, leave scripture_refs empty rather than guessing.
5. Write in the preacher's register, not in marketing voice. No hype words, no emoji in body text, no "game-changing", no "unlock".
6. If the transcript is too short, too broken or too off-topic to produce an item honestly, return fewer items. Never pad.

TIMING RULES FOR CLIPS
- Between 20 and 75 seconds. Aim for 30 to 45.
- start_s must sit at the start of a sentence, end_s at the end of one.
- Give the clip 0.3s of air at each end; the renderer does not pad for you.
- Never overlap two clips.`;

export function contentPackUser({ title, preacher, church, durationS, transcriptText, segments, scripture }) {
  const timeline = segments
    .map(s => `[${fmt(s.start)}-${fmt(s.end)}] ${s.text.trim()}`)
    .join('\n');

  return `SERMON
Title: ${title}
Preacher: ${preacher || 'unknown'}
Church: ${church || 'unknown'}
Length: ${durationS ? fmt(durationS) : 'unknown'}

SCRIPTURE REFERENCES DETECTED IN THE AUDIO (use these, do not invent others):
${scripture?.length ? scripture.map(s => `- ${s.ref} at ${fmt(s.start_s ?? 0)}`).join('\n') : '- none detected'}

TRANSCRIPT WITH TIMESTAMPS
${timeline}

TASK
Return a single JSON object with exactly these keys:

{
  "clips": [
    { "title": "4-8 words, the idea not a teaser",
      "hook": "the first spoken line of the clip, verbatim",
      "start_s": 0, "end_s": 0,
      "score": 0,                       // 0-100: how well this stands alone out of context
      "flags": [],                      // "cut_off_argument" | "needs_context" | "sensitive"
      "caption": "2-3 sentences for the post, your own words",
      "scripture_refs": [] },
    ...  // 4 to 8 clips, best first
  ],

  "highlights": [
    { "point": "one sentence: a thing the sermon actually argued",
      "explain": "2-3 sentences in your own words",
      "quote": "verbatim supporting line from the transcript",
      "quote_at_s": 0,
      "scripture_refs": [] },
    ...  // 3 to 5
  ],

  "carousels": [
    { "highlight_index": 0,
      "title": "slide-one headline, under 8 words",
      "slides": [ { "heading": "under 6 words", "body": "under 25 words" } ],  // 4 to 6 slides
      "caption": "2-3 sentences" },
    ...  // one per highlight
  ],

  "writeups": [
    { "highlight_index": 0,
      "title": "a real title, not a label",
      "body": "120-200 words, plain prose, no headings, no bullet points",
      "caption": "1-2 sentences" },
    ...  // one per highlight
  ],

  "summary": {
    "title": "the sermon in a title",
    "body": "150 words: what was said, in order, plainly",
    "caption": "2 sentences inviting someone who missed it" },

  "devotional": [
    { "day": 1,
      "title": "short",
      "scripture_ref": "as spoken in the sermon, or empty",
      "body": "100-150 words developing one point from the sermon",
      "question": "one reflection question",
      "prayer": "2-3 sentences" },
    ...  // exactly 5, Monday to Friday, each building on a different part
  ],

  "music_warning": true/false   // true if the transcript shows singing, a worship set or a song being performed, because clips over that audio get muted or claimed by rights holders
}

Return only the JSON object.`;
}

function fmt(s) {
  const t = Math.max(0, Math.round(s || 0));
  const m = Math.floor(t / 60), sec = t % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
