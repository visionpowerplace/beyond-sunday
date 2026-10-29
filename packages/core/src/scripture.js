/**
 * Scripture reference detection.
 *
 * Deliberately conservative: it finds references the preacher actually spoke
 * ("John chapter three verse sixteen", "First Corinthians 13:4") and returns
 * them with the timecode where they were said, so the renderer can put a lower
 * third on screen at the right moment.
 *
 * It does NOT fetch verse text. Pulling a translation means a licence
 * (NIV, ESV and NLT are all restricted); ship with public-domain KJV/WEB or
 * get written permission before you put verse text on a clip.
 */

const BOOKS = [
  'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
  'Samuel','Kings','Chronicles','Ezra','Nehemiah','Esther','Job','Psalm','Psalms',
  'Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations',
  'Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum',
  'Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke',
  'John','Acts','Romans','Corinthians','Galatians','Ephesians','Philippians',
  'Colossians','Thessalonians','Timothy','Titus','Philemon','Hebrews','James',
  'Peter','Jude','Revelation',
];

const ORDINALS = { first: '1', second: '2', third: '3', '1st': '1', '2nd': '2', '3rd': '3' };

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const bookAlt = BOOKS.map(b => b.replace(/ /g, '\\s+')).join('|');
const ordAlt = Object.keys(ORDINALS).join('|');

// "1 Corinthians 13:4", "First Corinthians thirteen four", "John 3 16"
const RE = new RegExp(
  String.raw`\b(?:(${ordAlt})\s+)?(${bookAlt})\s+` +
  String.raw`(?:chapter\s+)?(\d{1,3}|${Object.keys(WORD_NUMBERS).join('|')})` +
  String.raw`(?:\s*[:.]\s*|\s+verses?\s+|\s+)` +
  String.raw`(\d{1,3}|${Object.keys(WORD_NUMBERS).join('|')})` +
  String.raw`(?:\s*(?:-|through|to)\s*(\d{1,3}))?`,
  'gi'
);

const num = v => (/^\d+$/.test(v) ? Number(v) : WORD_NUMBERS[String(v).toLowerCase()] ?? null);

export function findScripture(text, words = []) {
  const found = [];
  for (const m of text.matchAll(RE)) {
    const chapter = num(m[3]);
    const verse = num(m[4]);
    if (!chapter || !verse) continue;
    const prefix = m[1] ? (ORDINALS[m[1].toLowerCase()] + ' ') : '';
    const book = m[2].replace(/\s+/g, ' ');
    const ref = `${prefix}${book} ${chapter}:${verse}${m[5] ? '-' + m[5] : ''}`;
    found.push({ ref, charIndex: m.index, start_s: charIndexToTime(m.index, text, words) });
  }
  // One entry per reference, earliest mention wins.
  const seen = new Set();
  return found.filter(f => (seen.has(f.ref) ? false : seen.add(f.ref)));
}

function charIndexToTime(charIndex, text, words) {
  if (!words?.length) return null;
  // Count words before this point and use that word's start time. Crude, but it
  // lands within a word or two, which is all a lower third needs.
  const wordsBefore = text.slice(0, charIndex).trim().split(/\s+/).length - 1;
  const w = words[Math.min(wordsBefore, words.length - 1)];
  return w ? w.start : null;
}
