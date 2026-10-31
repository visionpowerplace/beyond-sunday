/**
 * Sermon feeds.
 *
 * Most church media platforms — Subsplash, Church Online Platform, Castr,
 * Dacast, Buzzsprout, Libsyn, PodBean and the rest — publish an RSS feed
 * whose items carry a direct link to the recording. So instead of writing one
 * integration per vendor and guessing which a church uses, we read the feed
 * they all already publish.
 *
 * It also means the church pastes one URL once, and every Sunday after that
 * is a single click.
 */

const MEDIA = /^(audio|video)\//i;

/**
 * YouTube publishes a real, public channel feed. It carries the video id,
 * title, date and thumbnail for recent uploads — but its media:content is a
 * player URL, not a file, so it lists a church's sermons without handing over
 * any of them. That still turns "paste a link every week" into "pick last
 * Sunday", and with the channel connected the captions follow from the id.
 */
const YT_FEED = 'https://www.youtube.com/feeds/videos.xml';

/** Accepts a feed URL, a channel URL, or a bare channel id. */
export function youtubeFeedUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  if (raw.startsWith(YT_FEED)) return raw;
  if (/^UC[\w-]{20,}$/.test(raw)) return `${YT_FEED}?channel_id=${raw}`;
  if (/^PL[\w-]{10,}$/.test(raw)) return `${YT_FEED}?playlist_id=${raw}`;

  try {
    const u = new URL(raw);
    if (!/(^|\.)youtube\.com$/.test(u.hostname.replace(/^www\./, ''))) return null;
    if (u.pathname === '/feeds/videos.xml') return raw;

    const channel = u.pathname.match(/^\/channel\/(UC[\w-]{20,})/)?.[1];
    if (channel) return `${YT_FEED}?channel_id=${channel}`;

    // A playlist feed is usually the better one for a church: the Sermons
    // playlist is the preaching, where all-uploads mixes in announcements,
    // worship sets and kids' content.
    const list = u.searchParams.get('list');
    if (list && /^PL[\w-]{10,}$/.test(list)) return `${YT_FEED}?playlist_id=${list}`;

    // The legacy ?user= feed is retired — YouTube answers 404 — so a
    // /user/ or /@handle address carries nothing we can turn into a feed.
    // The channel id is the only key that still works.
    if (/^\/(@|user\/|c\/)/.test(u.pathname)) return { needsChannelId: true };
  } catch { /* not a url */ }
  return null;
}

export function parseYouTubeFeed(xml, limit) {
  const title = text(xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || 'YouTube channel';
  const entries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]);

  const episodes = entries.map(entry => {
    const videoId = text(entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/i)?.[1]);
    if (!videoId) return null;
    return {
      title: text(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || 'Untitled',
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      kind: 'youtube',
      thumbnail: attr(entry.match(/<media:thumbnail\b[^>]*>/i)?.[0] ?? '', 'url'),
      published: date(entry),
      durationS: null,
      author: text(entry.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/i)?.[1]) || null,
    };
  }).filter(Boolean);

  if (!episodes.length) throw new Error('That channel feed has no videos in it yet.');
  return { title, episodes: episodes.slice(0, limit), youtube: true };
}

/** Picks the right parser by what the document actually contains. */
export function parseAnyFeed(xml, limit = 20) {
  return /<yt:videoId>/i.test(xml) ? parseYouTubeFeed(xml, limit) : parseFeed(xml, limit);
}

export async function fetchFeed(input, { limit = 20 } = {}) {
  const yt = youtubeFeedUrl(input);
  if (yt?.needsChannelId) {
    throw new Error('A @handle does not carry the channel id. Open your channel, copy the address that starts with youtube.com/channel/UC…, and paste that.');
  }
  const url = typeof yt === 'string' ? yt : input;

  const res = await fetch(url, {
    headers: { 'user-agent': 'BeyondSunday/1.0 (+sermon media)', accept: 'application/rss+xml, application/xml, text/xml, */*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`That feed returned ${res.status}. Check the address.`);

  const body = await res.text();
  if (!/<(rss|feed|channel)\b/i.test(body)) {
    throw new Error('That address is not a feed. Look for an RSS or podcast link on your media platform.');
  }
  return parseAnyFeed(body, limit);
}

export function parseFeed(xml, limit = 20) {
  const title = text(xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || 'Sermon feed';
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);

  const episodes = blocks.map(block => {
    const media = findMedia(block);
    if (!media) return null;
    return {
      title: text(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || 'Untitled',
      url: media.url,
      kind: media.kind,
      published: date(block),
      durationS: duration(block),
      author: text(block.match(/<itunes:author[^>]*>([\s\S]*?)<\/itunes:author>/i)?.[1]) || null,
    };
  }).filter(Boolean);

  if (!episodes.length) {
    throw new Error('That feed has no audio or video in it — it may be a text-only blog feed.');
  }
  return { title, episodes: episodes.slice(0, limit) };
}

/** The recording itself: an enclosure, a media:content, or a direct link. */
function findMedia(block) {
  const enclosure = block.match(/<enclosure\b[^>]*>/i)?.[0];
  if (enclosure) {
    const url = attr(enclosure, 'url');
    const type = attr(enclosure, 'type') ?? '';
    if (url && (MEDIA.test(type) || looksLikeMedia(url))) {
      return { url, kind: /^video\//i.test(type) || /\.(mp4|mov|m4v|webm)/i.test(url) ? 'video' : 'audio' };
    }
  }

  for (const tag of block.match(/<media:content\b[^>]*>/gi) ?? []) {
    const url = attr(tag, 'url');
    const type = attr(tag, 'type') ?? '';
    if (url && (MEDIA.test(type) || looksLikeMedia(url))) {
      return { url, kind: /video/i.test(type) || /\.(mp4|mov|m4v|webm)/i.test(url) ? 'video' : 'audio' };
    }
  }

  // Atom: <link rel="enclosure" href="..." type="video/mp4"/>
  for (const tag of block.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel=["']?enclosure/i.test(tag)) continue;
    const url = attr(tag, 'href');
    if (url && looksLikeMedia(url)) {
      return { url, kind: /\.(mp4|mov|m4v|webm)/i.test(url) ? 'video' : 'audio' };
    }
  }
  return null;
}

const looksLikeMedia = url => /\.(mp4|mov|m4v|webm|mp3|m4a|aac|wav|ogg)(\?|$)/i.test(url);

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? decode(m[1]) : null;
}

function date(block) {
  const raw = block.match(/<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i)?.[1];
  const d = raw ? new Date(text(raw)) : null;
  return d && !Number.isNaN(+d) ? d.toISOString() : null;
}

/** itunes:duration is "3600", "60:00" or "01:00:00" depending on the host. */
function duration(block) {
  const raw = text(block.match(/<itunes:duration[^>]*>([\s\S]*?)<\/itunes:duration>/i)?.[1]);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const parts = raw.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

function text(s) {
  if (!s) return '';
  return decode(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '')).trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };
const decode = s => String(s).replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (/^#\d+$/.test(e) ? String.fromCharCode(e.slice(1)) : m));
