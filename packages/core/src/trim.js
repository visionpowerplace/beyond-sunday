/**
 * Shorten a message for storage without losing either end.
 *
 * ffmpeg puts the reason it failed on the LAST line of stderr, after pages of
 * banner and stream mapping. run() already keeps the tail for that reason —
 * but the caller then kept the head of that, so the stored error was a middle
 * slice with the banner at the front and the reason cut off. Keep both ends.
 */
export function trimMiddle(text, max = 1000, headRoom = 140) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const head = s.slice(0, headRoom).trimEnd();
  const tail = s.slice(-(max - headRoom - 5)).trimStart();
  return `${head} … ${tail}`;
}
