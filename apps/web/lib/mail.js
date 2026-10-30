/**
 * Sending email.
 *
 * Resend when there is a key. Without one the message is logged rather than
 * swallowed, so a reset link is still recoverable in development instead of
 * the page claiming it sent something it did not.
 */
const KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.EMAIL_FROM || 'Beyond Sunday <onboarding@resend.dev>';

export const canSend = () => Boolean(KEY);

export async function send({ to, subject, text, html }) {
  if (!KEY) {
    console.log(`[mail] no RESEND_API_KEY; would have sent to ${to}: ${subject}\n${text}`);
    return { sent: false, reason: 'no_key' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, text, html: html ?? undefined }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    console.error(`[mail] resend ${res.status}: ${detail}`);
    return { sent: false, reason: detail };
  }
  return { sent: true };
}

export function resetEmail({ link, churchName }) {
  return {
    subject: 'Reset your Beyond Sunday password',
    text: `Someone asked to reset the password for ${churchName || 'your church'} on Beyond Sunday.\n\n`
      + `Open this link within the hour to choose a new one:\n${link}\n\n`
      + `If it was not you, nothing has changed and you can ignore this.`,
  };
}
