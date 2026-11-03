/**
 * A last pass over anything a model wrote, before it reaches a church.
 *
 * The prompt asks for no dashes and no mention of who preached. A prompt is
 * not a guarantee: models reach for an em dash under pressure, and a name in
 * the transcript can surface in a caption even when the name was never given.
 * This is the backstop, so the rule holds whatever the model does.
 */

/** Words that almost always start a new independent clause. */
const CLAUSE_OPENERS = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'god', 'jesus', 'christ',
  'this', 'that', 'there', 'here', 'these', 'those', 'your', 'his', 'her',
  'their', 'our', 'my', 'the', 'and', 'but', 'so', 'yet', 'now',
]);

/**
 * Turn a dash into the punctuation that belongs there.
 *
 * A dash standing between two independent clauses becomes a full stop; one
 * introducing an aside or an elaboration becomes a comma. Ordinary hyphens
 * inside words such as "five-day" are left alone, because they are correct.
 */
export function fixDashes(text) {
  let s = String(text ?? '');
  if (!s) return s;

  // A dash opening a line is a bullet or an afterthought; drop it.
  s = s.replace(/^[\s]*[—–]\s*/gm, '');

  s = s.replace(/\s*[—–]\s*/g, (_m, offset, whole) => {
    const before = whole.slice(0, offset).trimEnd();
    const after = whole.slice(offset).replace(/^\s*[—–]\s*/, '');
    const nextWord = (after.match(/^[A-Za-z']+/) ?? [''])[0].toLowerCase();

    // Nothing meaningful on one side: just close the gap.
    if (!before) return '';
    if (!after) return '.';

    const independent = CLAUSE_OPENERS.has(nextWord) && before.length > 24;
    return independent ? '. ' : ', ';
  });

  // Capitalise whatever now follows a full stop we introduced.
  s = s.replace(/\.\s+([a-z])/g, (m, c) => m.slice(0, -1) + c.toUpperCase());

  // A doubled hyphen is the same reach for a dash.
  s = s.replace(/\s*--+\s*/g, ', ');

  return s.replace(/\s+([,.;:])/g, '$1').replace(/,\s*,/g, ',');
}

/**
 * Remove the preacher from writing that should be about the message.
 *
 * The name is never put in the prompt, so this catches the case where a model
 * lifted it out of the transcript, plus the generic stand-ins it reaches for
 * when it has no name to use.
 */
export function dropPreacher(text, preacher) {
  let s = String(text ?? '');
  if (!s) return s;

  const names = [];
  const full = String(preacher ?? '').trim();
  if (full) {
    names.push(full);
    // "Pastor Benjamin Beckley" is also "Beckley" and "Benjamin".
    for (const part of full.split(/\s+/)) {
      if (part.length > 2 && !/^(pastor|rev|reverend|dr|bishop|minister|elder|apostle|prophet)\.?$/i.test(part)) {
        names.push(part);
      }
    }
  }

  const titled = '(?:pastor|the pastor|the preacher|the speaker|the teacher|the minister|rev\\.?|reverend|dr\\.?|bishop|apostle|prophet|elder)';
  const patterns = [
    // "Pastor Beckley reminds us that X" -> "X"
    new RegExp(`\\b${titled}\\s+[A-Z][\\w'’-]*(?:\\s+[A-Z][\\w'’-]*)?\\s+(?:says|said|tells|told|reminds|reminded|explains|explained|teaches|taught|argues|argued|notes|noted|points out|pointed out|urges|urged|shows|showed|asks|asked)\\s+(?:us\\s+)?(?:that\\s+)?`, 'gi'),
    new RegExp(`\\b(?:${titled}|the message|this message|the sermon|this sermon)\\s+(?:says|said|tells|told|reminds|reminded|explains|explained|teaches|taught|argues|argued|notes|noted|points out|pointed out|urges|urged|shows|showed)\\s+(?:us\\s+)?(?:that\\s+)?`, 'gi'),
  ];

  for (const re of patterns) s = s.replace(re, '');

  // A bare honorific with a name after it, in any casing. The honorific is
  // matched case-insensitively, so the name is checked in the replacer
  // instead: an uppercase word after "Pastor" is a name and goes with it,
  // while "pastor and the elders" keeps its "and".
  s = s.replace(
    new RegExp(`\\b${titled}((?:\\s+[\\w'’-]+){0,2})`, 'gi'),
    (_m, trailing) => {
      const words = String(trailing).trim().split(/\s+/).filter(Boolean);
      const taken = [];
      for (const w of words) {
        if (/^[A-Z][\w'’-]*$/.test(w)) taken.push(w); else break;
      }
      return words.slice(taken.length).length
        ? ' ' + words.slice(taken.length).join(' ')
        : '';
    });
  for (const name of names) {
    s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:'s|’s)?\\b`, 'gi'), '');
  }

  return s
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[\s,;:]+/, '')
    .replace(/^([a-z])/, (m, c) => c.toUpperCase())
    .trim();
}

/** Both passes, over every string in a structure, however deep. */
export function cleanDeep(value, preacher) {
  if (typeof value === 'string') return fixDashes(dropPreacher(value, preacher));
  if (Array.isArray(value)) return value.map(v => cleanDeep(v, preacher));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanDeep(v, preacher)]));
  }
  return value;
}
