import { youtubeMeta } from '@bs/core/youtube-meta.js';
import { currentUser } from '../../../lib/auth.js';

/** Looks up a YouTube link's public details so the form can fill itself in. */
export async function GET(request) {
  if (!(await currentUser())) return Response.json({ error: 'sign in' }, { status: 401 });
  const url = new URL(request.url).searchParams.get('url') ?? '';
  const meta = await youtubeMeta(url);
  return Response.json(meta ?? {}, { headers: { 'cache-control': 'private, max-age=300' } });
}
