/** The feed shapes church media platforms actually publish. */
import { parseFeed } from '../packages/core/src/feed.js';

const checks = [];
const c = (n, p, d = '') => checks.push([n, p, d]);

// A podcast feed: enclosure, CDATA titles, itunes duration.
const rss = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title><![CDATA[The Empowerment Center Sermons]]></title>
  <item>
    <title><![CDATA[Growing In Prayer &amp; Communion]]></title>
    <pubDate>Sun, 26 Oct 2026 14:00:00 GMT</pubDate>
    <itunes:author>Benjamin Beckley</itunes:author>
    <itunes:duration>00:42:10</itunes:duration>
    <enclosure url="https://media.example.org/sermons/2026-10-26.mp4" type="video/mp4" length="1200000"/>
  </item>
  <item>
    <title>A Power In Silence</title>
    <pubDate>Sun, 19 Oct 2026 14:00:00 GMT</pubDate>
    <itunes:duration>2530</itunes:duration>
    <enclosure url="https://media.example.org/sermons/2026-10-19.mp3" type="audio/mpeg"/>
  </item>
  <item>
    <title>Just a blog post</title>
    <link>https://example.org/blog/post</link>
  </item>
</channel></rss>`;

const a = parseFeed(rss);
c('reads the feed title', a.title === 'The Empowerment Center Sermons', a.title);
c('keeps only items with media', a.episodes.length === 2, String(a.episodes.length));
c('decodes entities in titles', a.episodes[0].title === 'Growing In Prayer & Communion', a.episodes[0].title);
c('finds the video enclosure', a.episodes[0].url.endsWith('2026-10-26.mp4') && a.episodes[0].kind === 'video');
c('knows audio from video', a.episodes[1].kind === 'audio');
c('parses hh:mm:ss duration', a.episodes[0].durationS === 2530, String(a.episodes[0].durationS));
c('parses plain-seconds duration', a.episodes[1].durationS === 2530);
c('reads the date', a.episodes[0].published?.startsWith('2026-10-26'), a.episodes[0].published ?? '');
c('reads the author', a.episodes[0].author === 'Benjamin Beckley');

// Atom with media:content, which several church platforms use.
const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Sunday Services</title>
  <entry>
    <title>When Accusations Come</title>
    <published>2026-10-26T14:00:00Z</published>
    <media:content url="https://cdn.example.org/s/0926.mp4" type="video/mp4" />
  </entry>
  <entry>
    <title>Trust The Plan</title>
    <link rel="enclosure" href="https://cdn.example.org/s/0919.m4v" type="video/x-m4v"/>
  </entry>
</feed>`;
const b = parseFeed(atom);
c('reads atom entries', b.episodes.length === 2, String(b.episodes.length));
c('finds media:content', b.episodes[0].url.endsWith('0926.mp4'));
c('finds an atom enclosure link', b.episodes[1].url.endsWith('0919.m4v'));

// Things that should fail clearly.
for (const [name, xml, pattern] of [
  ['a text-only feed is refused', '<rss><channel><title>Blog</title><item><title>Hi</title></item></channel></rss>', /no audio or video/i],
]) {
  let msg = '';
  try { parseFeed(xml); } catch (err) { msg = err.message; }
  c(name, pattern.test(msg), msg);
}

for (const [n, p, d] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`);
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
process.exit(failed ? 1 : 0);
