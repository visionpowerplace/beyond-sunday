import { pullCaptions } from '../../../lib/google.js';
import { requireUser, currentChurch } from '../../../lib/auth.js';

/** Fetches the caption track for one of the church's own YouTube videos. */
export async function GET(request) {
  const user = await requireUser();
  const church = await currentChurch(user);
  const url = new URL(request.url).searchParams.get('url') ?? '';

  const result = await pullCaptions(church, url);
  return Response.json(result, { status: result.ok ? 200 : 200 });
}
