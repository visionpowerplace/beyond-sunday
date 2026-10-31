import { fetchFeed } from '@bs/core/feed.js';
import { myChannel, configured as googleConfigured } from '@bs/core/providers/youtube.js';
import { requireUser, currentChurch } from '../../../lib/auth.js';
import { sql } from '@bs/core/db.js';

/** Reads a sermon feed and, if it works, remembers it for next Sunday. */
export async function GET(request) {
  const user = await requireUser();
  const church = await currentChurch(user);
  const params = new URL(request.url).searchParams;
  let url = (params.get('url') || church?.feed_url || '').trim();
  let channel = null;

  // Nothing given and a YouTube account connected: read their own channel
  // rather than asking the church to go hunting for a channel id.
  if (!url && church?.google_refresh_token && googleConfigured()) {
    try {
      channel = await myChannel(church.google_refresh_token);
      url = channel.feedUrl;
    } catch (err) {
      return Response.json({ ok: false, reason: err.message, needsReconnect: Boolean(err.needsReconnect) });
    }
  }

  if (!url) {
    return Response.json({
      ok: false,
      reason: church?.google_refresh_token
        ? 'No feed address given.'
        : 'Give a feed address, or connect your YouTube channel in Settings and we will read it for you.',
    });
  }

  try {
    const feed = await fetchFeed(url);
    if (params.get('remember') !== '0' && church && church.feed_url !== url) {
      await sql`update churches set feed_url = ${url} where id = ${church.id}`;
    }
    return Response.json({ ok: true, url, channel, ...feed });
  } catch (err) {
    return Response.json({ ok: false, reason: err.message });
  }
}
