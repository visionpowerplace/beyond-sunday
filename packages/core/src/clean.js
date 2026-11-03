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

  // Deliberately short, and deliberately not "dr", "apostle", "prophet" or
  // "elder". "dr\.?" matches the first two letters of "dream". The others
  // belong to Paul, Isaiah and John far more often than to whoever preached
  // on Sunday, and stripping them vandalises the scripture in the writing.
  const TITLE = '(?:[Pp]astor|[Pp]reacher|[Rr]everend|[Bb]ishop)';

  // "Pastor Beckley reminds us that X" and "the pastor explains that X".
  const SAYS = '(?:says|said|tells|told|reminds|reminded|explains|explained|teaches|taught'
    + '|argues|argued|notes|noted|points out|pointed out|urges|urged|shows|showed|asks|asked)';

  s = s.replace(new RegExp(`\\b(?:[Tt]he\\s+)?${TITLE}\\b(?:\\s+[A-Z][\\w'’-]+){0,2}\\s+${SAYS}\\s+(?:us\\s+)?(?:that\\s+)?`, 'g'), '');
  s = s.replace(new RegExp(`\\b(?:[Tt]his|[Tt]he)\\s+(?:message|sermon)\\s+${SAYS}\\s+(?:us\\s+)?(?:that\\s+)?`, 'g'), '');

  // A bare honorific with a name after it: "Pastor Beckley" -> nothing.
  // The honorific needs its own word boundary so it cannot eat into a word.
  s = s.replace(new RegExp(`\\b(?:[Tt]he\\s+)?${TITLE}\\b(\\s+[A-Z][\\w'’-]+){1,2}\\s+${SAYS}\\s+(?:us\\s+)?(?:that\\s+)?`, 'g'), '');
  s = s.replace(new RegExp(`\\b(?:[Tt]he\\s+)?${TITLE}\\b(\\s+[A-Z][\\w'’-]+){1,2}`, 'g'), '');

  // Only the full name, and only the surname on its own. Never the first
  // name: a preacher called Benjamin, John or Paul shares it with half of
  // scripture, and the sermon is probably talking about them, not him.
  const parts = String(preacher ?? '').trim().split(/\s+/)
    .filter(w => w.length > 2 && !new RegExp(`^${TITLE}$`, 'i').test(w) && !/^(rev|dr|mr|mrs|ms)\.?$/i.test(w));
  const names = [];
  if (parts.length > 1) names.push(parts.join(' '), parts[parts.length - 1]);
  else if (parts.length === 1) names.push(parts[0]);

  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // "Beckley says that X" loses the whole clause, not just the name, or
    // the sentence is left starting on a dangling verb.
    s = s.replace(new RegExp(`\\b${esc}\\s+${SAYS}\\s+(?:us\\s+)?(?:that\\s+)?`, 'g'), '');
    s = s.replace(new RegExp(`\\b${esc}(?:'s|’s)?\\b`, 'g'), '');
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
