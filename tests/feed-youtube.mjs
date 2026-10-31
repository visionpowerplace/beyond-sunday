import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAnyFeed, youtubeFeedUrl } from '../packages/core/src/feed.js';

const xml = readFileSync(new URL('./fixtures/yt-channel.xml', import.meta.url), 'utf8');
const got = parseAnyFeed(xml, 20);

assert.equal(got.youtube, true, 'flagged as a YouTube channel feed');
assert.equal(got.title, 'Grace Chapel');
assert.equal(got.episodes.length, 2);

const [first, second] = got.episodes;
assert.equal(first.videoId, 'dQw4w9WgXcQ');
assert.equal(first.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
assert.equal(first.kind, 'youtube');
assert.equal(first.title, 'Sunday Service — The Weight of Mercy');
assert.equal(first.author, 'Grace Chapel');
assert.match(first.thumbnail, /^https:\/\/i4\.ytimg\.com\/vi\/dQw4w9WgXcQ\//);
assert.ok(first.published instanceof Date || typeof first.published === 'string', 'has a date');
assert.equal(first.durationS, null, 'channel feeds carry no duration');

// Entities decoded, and a thumbnail-only entry still parses.
assert.equal(second.title, 'Midweek Prayer & Communion');
assert.equal(second.videoId, 'abc12345678');

// The media:content in a channel feed is a PLAYER url, never a file. The
// parser must not present it as something we could download and cut.
assert.ok(!('mediaUrl' in first) || !first.mediaUrl, 'no media file is claimed');
assert.ok(!JSON.stringify(got).includes('x-shockwave-flash'), 'player url not surfaced');

// Url shapes.
assert.equal(youtubeFeedUrl('UCchurchexamplechannel00'),
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCchurchexamplechannel00');
assert.equal(youtubeFeedUrl('https://www.youtube.com/channel/UCchurchexamplechannel00'),
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCchurchexamplechannel00');
assert.equal(youtubeFeedUrl('https://www.youtube.com/@gracechapel')?.needsChannelId, true,
  'a handle cannot be turned into a feed url');
assert.equal(youtubeFeedUrl('https://www.youtube.com/user/gracechapel')?.needsChannelId, true,
  'the retired ?user= form is not offered');
assert.equal(youtubeFeedUrl('https://media.example.org/sermons.xml'), null);

// A plain podcast feed must still go down the old path.
const pod = parseAnyFeed(`<rss><channel><title>Pod</title><item>
  <title>Week 1</title><enclosure url="https://ex.org/a.mp3" type="audio/mpeg"/>
  <pubDate>Sun, 26 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`, 20);
assert.ok(!pod.youtube, 'podcast feed not flagged as youtube');
assert.equal(pod.episodes[0].url, 'https://ex.org/a.mp3');

console.log('feed-youtube: ok —', got.episodes.length, 'videos, no media file claimed');

// A Sermons playlist, which is usually a better feed for a church than
// all-uploads: bare id, and the watch/playlist address people actually copy.
assert.equal(youtubeFeedUrl('PLabcdefghijkl'),
  'https://www.youtube.com/feeds/videos.xml?playlist_id=PLabcdefghijkl');
assert.equal(youtubeFeedUrl('https://www.youtube.com/playlist?list=PLabcdefghijkl'),
  'https://www.youtube.com/feeds/videos.xml?playlist_id=PLabcdefghijkl');
assert.equal(youtubeFeedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijkl'),
  'https://www.youtube.com/feeds/videos.xml?playlist_id=PLabcdefghijkl');
console.log('feed-youtube: playlist feeds ok');
