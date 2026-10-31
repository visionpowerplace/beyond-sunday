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

export async function fetchFeed(url, { limit = 20 } = {}) {
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
  return parseFeed(body, limit);
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
