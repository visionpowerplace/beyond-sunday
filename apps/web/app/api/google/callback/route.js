import { redirect } from 'next/navigation';
import { finishConnect } from '../../../../lib/google.js';
import { currentUser } from '../../../../lib/auth.js';

export async function GET(request) {
  if (!(await currentUser())) redirect('/login');
  const params = new URL(request.url).searchParams;

  const error = params.get('error');
  if (error) {
    redirect(`/settings?problem=${encodeURIComponent(
      error === 'access_denied'
        ? 'You cancelled the YouTube connection. Nothing has changed.'
        : `Google refused the connection (${error}).`)}`);
  }

  try {
    const { email } = await finishConnect(params.get('code'), params.get('state'));
    redirect(`/settings?connected=${encodeURIComponent(`YouTube${email ? ` (${email})` : ''}`)}`);
  } catch (err) {
    // redirect() throws by design; let it through.
    if (err?.digest?.startsWith?.('NEXT_REDIRECT')) throw err;
    redirect(`/settings?problem=${encodeURIComponent(err.message)}`);
  }
}
