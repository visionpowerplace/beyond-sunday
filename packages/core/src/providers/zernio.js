import { config } from '../config.js';

/**
 * Zernio — one API in front of the social networks.
 *
 * We use a provider rather than going direct because direct means Meta app
 * review plus business verification, TikTok's content-posting audit, and a
 * YouTube compliance audit to lift a quota of roughly six uploads a day. That
 * is six to twelve weeks before one church can publish. Zernio has already
 * passed all of it.
 *
 * Everything here is behind one interface, so swapping providers later is a
 * day's work rather than a rewrite.
 */

const BASE = 'https://zernio.com/api/v1';

export const configured = () => Boolean(config.zernio.apiKey);

async function call(path, { method = 'GET', body, headers = {}, timeoutMs = 60_000 } = {}) {
  if (!configured()) throw new Error('ZERNIO_API_KEY is not set');

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.zernio.apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep the raw text */ }

  if (!res.ok) {
    const err = new Error(data?.error || data?.message || `zernio ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.code = data?.code;
    err.data = data;
    throw err;
  }
  return data;
}

export async function listProfiles() {
  const data = await call('/profiles');
  return data?.profiles ?? data ?? [];
}

export async function createProfile(name) {
  const data = await call('/profiles', { method: 'POST', body: { name } });
  return data?.profile ?? data;
}

/** The profile a church's accounts hang off, created once and remembered. */
export async function ensureProfile(name) {
  const existing = await listProfiles();
  const match = existing.find(p => p.name === name);
  if (match) return match._id ?? match.id;

  try {
    const made = await createProfile(name);
    return made?._id ?? made?.id;
  } catch {
    // Plans cap the number of profiles; falling back to the default one is
    // better than refusing to connect anything at all.
    return existing[0]?._id ?? existing[0]?.id ?? null;
  }
}

export async function listAccounts(profileId) {
  const data = await call(`/accounts${profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''}`);
  return (data?.accounts ?? []).map(a => ({
    id: a._id,
    platform: a.platform,
    username: a.username,
    displayName: a.displayName,
    profileUrl: a.profileUrl,
    active: a.isActive !== false,
  }));
}

export async function connectUrl({ platform, profileId, redirectUrl, brandName, logoUrl, primaryColor }) {
  const q = new URLSearchParams({ profileId });
  if (redirectUrl) q.set('redirect_url', redirectUrl);
  // The welcome screen names the church rather than us, which is who the
  // volunteer is actually connecting for.
  if (brandName) { q.set('welcome', 'true'); q.set('brandName', brandName.slice(0, 60)); }
  if (logoUrl) q.set('logoUrl', logoUrl);
  if (primaryColor && /^#[0-9a-f]{6}$/i.test(primaryColor)) q.set('primaryColor', primaryColor);

  const data = await call(`/connect/${encodeURIComponent(platform)}?${q}`);
  return data?.authUrl ?? null;
}

export async function disconnect(accountId) {
  return call(`/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
}

/**
 * Create a post.
 *
 * `when` null publishes inside this request; otherwise it is scheduled.
 * `idempotencyKey` makes a retry safe: the same key within 24 hours returns
 * the original post instead of publishing twice.
 */
export async function createPost({ content, media = [], accounts, when = null, idempotencyKey, timezone }) {
  if (!accounts?.length) throw new Error('no accounts chosen for this post');

  const body = {
    content: content || undefined,
    mediaItems: media.length ? media.map(m => ({ type: m.type, url: m.url })) : undefined,
    platforms: accounts.map(a => ({ platform: a.platform, accountId: a.id })),
    timezone: timezone || undefined,
    ...(when ? { scheduledFor: new Date(when).toISOString() } : { publishNow: true }),
  };

  const data = await call('/posts', {
    method: 'POST',
    body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    // publishNow uploads the video to each network inside the request.
    timeoutMs: when ? 60_000 : 300_000,
  });

  const post = data?.post ?? data;
  const urls = (post?.platforms ?? [])
    .map(p => p.platformPostUrl)
    .filter(Boolean);

  return {
    id: post?._id ?? null,
    status: post?.status ?? (when ? 'scheduled' : 'published'),
    urls,
    failures: (post?.platforms ?? [])
      .filter(p => p.status === 'failed')
      .map(p => `${p.platform}: ${p.error ?? 'failed'}`),
  };
}
