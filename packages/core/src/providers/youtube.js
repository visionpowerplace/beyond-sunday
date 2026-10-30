import { config } from '../config.js';

/**
 * Reading a church's own captions from YouTube.
 *
 * captions.download is a documented endpoint for anyone with edit permission
 * on the video, so a church can pull the caption track off its own sermons.
 * It is the only part of a YouTube video this product can fetch: there is no
 * download method for the video file itself, for anyone, including the owner.
 *
 * Everything here acts as the church, through its own consent, on its own
 * videos. Nothing is scraped and no access control is worked around.
 */

const OAUTH = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';

// Editing captions needs the full-control scope; Google calls it sensitive,
// which means an app serving more than a hundred churches needs verifying.
export const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl', 'openid', 'email'];

export const configured = () => Boolean(config.google.clientId && config.google.clientSecret);

export function consentUrl({ redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',       // we need a refresh token, not one hour
    prompt: 'consent',            // without it a re-connect returns no refresh token
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function exchangeCode(code, redirectUri) {
  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || `google ${res.status}`);
  if (!data.refresh_token) {
    throw new Error('Google did not return a refresh token. Disconnect the app at myaccount.google.com and connect again.');
  }
  return { refreshToken: data.refresh_token, email: emailFromIdToken(data.id_token) };
}

async function accessToken(refreshToken) {
  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `google ${res.status}`);
    err.needsReconnect = data.error === 'invalid_grant';
    throw err;
  }
  return data.access_token;
}

/** Caption tracks on a video, best first. */
export async function listCaptions(videoId, refreshToken) {
  const token = await accessToken(refreshToken);
  const res = await fetch(`${API}/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();

  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    if (res.status === 403) {
      const err = new Error(
        reason === 'forbidden'
          ? 'That video belongs to a different YouTube account. Connect the account that owns the channel, or paste the captions instead.'
          : `YouTube refused the request (${reason ?? '403'}).`);
      err.notOwner = true;
      throw err;
    }
    throw new Error(data?.error?.message || `youtube ${res.status}`);
  }

  // A caption someone wrote or corrected beats the machine's attempt, and a
  // track in the video's own language beats a translation.
  return (data.items ?? [])
    .map(i => ({
      id: i.id,
      language: i.snippet?.language,
      name: i.snippet?.name,
      asr: i.snippet?.trackKind === 'ASR',
      draft: i.snippet?.isDraft === true,
      status: i.snippet?.status,
    }))
    .filter(t => !t.draft && t.status !== 'failed')
    .sort((a, b) => Number(a.asr) - Number(b.asr));
}

/**
 * The track itself, as SRT.
 *
 * YouTube has historically refused to release auto-generated tracks through
 * the API even to the owner, so a 403 on an ASR track is reported as the
 * known limitation it is rather than as a mystery.
 */
export async function downloadCaption(trackId, refreshToken, { asr = false } = {}) {
  const token = await accessToken(refreshToken);
  const res = await fetch(`${API}/captions/${encodeURIComponent(trackId)}?tfmt=srt`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403) {
      const err = new Error(asr
        ? 'YouTube will not release auto-generated captions through its API, even to the channel that owns the video. Download them from YouTube Studio and paste them, or upload the recording.'
        : 'YouTube refused that caption track. Check the video is on the connected account and that caption downloads are not switched off for it.');
      err.asrBlocked = asr;
      throw err;
    }
    throw new Error(`youtube ${res.status}: ${body.slice(0, 200)}`);
  }

  const srt = await res.text();
  if (!srt.trim()) throw new Error('That caption track came back empty.');
  return srt;
}

function emailFromIdToken(idToken) {
  try {
    const payload = String(idToken).split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).email ?? null;
  } catch {
    return null;
  }
}
