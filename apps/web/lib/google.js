import { randomBytes } from 'node:crypto';
import { sql } from '@bs/core/db.js';
import * as yt from '@bs/core/providers/youtube.js';
import { youtubeId } from '@bs/core/youtube-meta.js';

export const googleConfigured = () => yt.configured();
export const redirectUri = () =>
  `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/google/callback`;

/** State carries the church, so the callback knows who connected. */
export function startUrl(churchId) {
  const state = `${churchId}.${randomBytes(8).toString('hex')}`;
  return yt.consentUrl({ redirectUri: redirectUri(), state });
}

export async function finishConnect(code, state) {
  const churchId = String(state).split('.')[0];
  if (!/^[0-9a-f-]{36}$/i.test(churchId)) throw new Error('That connection link was malformed.');
  const { refreshToken, email } = await yt.exchangeCode(code, redirectUri());
  await sql`
    update churches set google_refresh_token = ${refreshToken}, google_email = ${email},
      google_connected_at = now()
    where id = ${churchId}`;
  return { churchId, email };
}

export async function disconnectGoogle(churchId) {
  await sql`
    update churches set google_refresh_token = null, google_email = null, google_connected_at = null
    where id = ${churchId}`;
}

/**
 * Pull the caption track off one of the church's own videos.
 *
 * Returns the SRT, or an explanation of why YouTube would not hand it over.
 * Never throws at the caller: every failure here has a sensible next step,
 * and all of them end with "paste it instead".
 */
export async function pullCaptions(church, url) {
  const videoId = youtubeId(url);
  if (!videoId) return { ok: false, reason: 'That is not a YouTube link.' };
  if (!church?.google_refresh_token) {
    return { ok: false, needsConnect: true, reason: 'Connect your YouTube account first.' };
  }

  let tracks;
  try {
    tracks = await yt.listCaptions(videoId, church.google_refresh_token);
  } catch (err) {
    if (err.needsReconnect) {
      await disconnectGoogle(church.id);
      return { ok: false, needsConnect: true, reason: 'Your YouTube connection expired. Connect it again.' };
    }
    return { ok: false, reason: err.message };
  }

  if (!tracks.length) {
    return { ok: false, reason: 'That video has no caption track yet. YouTube usually adds one within an hour of upload.' };
  }

  // Try each track best-first: a human-written one before the machine's.
  const problems = [];
  for (const track of tracks) {
    try {
      const srt = await yt.downloadCaption(track.id, church.google_refresh_token, { asr: track.asr });
      return { ok: true, srt, track: { language: track.language, asr: track.asr, name: track.name } };
    } catch (err) {
      problems.push(err.message);
      if (!err.asrBlocked) break;   // a real refusal, not the known ASR limit
    }
  }
  return { ok: false, reason: problems[0], tried: tracks.length };
}
