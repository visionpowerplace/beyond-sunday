/**
 * What we can legitimately get from a YouTube link: its public metadata.
 *
 * oEmbed is a documented public endpoint meant exactly for this — no key, no
 * scraping, no sign-in. It gives the title, the channel and the thumbnail,
 * which is everything needed to fill in the form. The video file itself has
 * no download method on any YouTube API, for anyone, including the channel
 * owner, so the person still supplies the file.
 */

const OEMBED = 'https://www.youtube.com/oembed';

export function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1) || null;
    if (host.endsWith('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/(?:embed|live|shorts|v)\/([\w-]{6,})/);
      if (m) return m[1];
    }
  } catch { /* not a url */ }
  return null;
}

/** Null when it cannot be read — a private video, or YouTube being slow. */
export async function youtubeMeta(url) {
  const id = youtubeId(url);
  if (!id) return null;

  try {
    const res = await fetch(
      `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return { id, private: res.status === 401 || res.status === 403 || res.status === 404 };
    const data = await res.json();
    return {
      id,
      title: cleanTitle(data.title ?? ''),
      channel: data.author_name ?? '',
      thumbnail: data.thumbnail_url ?? null,
      studioUrl: `https://studio.youtube.com/video/${id}/edit`,
    };
  } catch {
    return { id, studioUrl: `https://studio.youtube.com/video/${id}/edit` };
  }
}

/** Church uploads carry a lot of furniture in the title. */
function cleanTitle(title) {
  return String(title)
    .replace(/\s*[|–—-]\s*(sunday service|live stream|livestream|full service|worship service|\d{1,2}[./]\d{1,2}[./]\d{2,4}).*$/i, '')
    .replace(/^\s*(sunday service|live|livestream)\s*[|–—:-]\s*/i, '')
    .trim()
    .slice(0, 160);
}
