import { fetchFeed } from '@bs/core/feed.js';
import { requireUser, currentChurch } from '../../../lib/auth.js';
import { sql } from '@bs/core/db.js';

/** Reads a sermon feed and, if it works, remembers it for next Sunday. */
export async function GET(request) {
  const user = await requireUser();
  const church = await currentChurch(user);
  const params = new URL(request.url).searchParams;
  const url = (params.get('url') || church?.feed_url || '').trim();

  if (!url) return Response.json({ ok: false, reason: 'No feed address given.' });

  try {
    const feed = await fetchFeed(url);
    if (params.get('remember') !== '0' && church && church.feed_url !== url) {
      await sql`update churches set feed_url = ${url} where id = ${church.id}`;
    }
    return Response.json({ ok: true, url, ...feed });
  } catch (err) {
    return Response.json({ ok: false, reason: err.message });
  }
}
