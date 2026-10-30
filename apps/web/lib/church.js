import { randomUUID } from 'node:crypto';
import { sql } from '@bs/core/db.js';
import { config } from '@bs/core/config.js';
import { ASPECTS, NETWORKS } from '@bs/core/brand.js';
import * as zernio from '@bs/core/providers/zernio.js';

export { ASPECTS, NETWORKS };

export async function listChurches() {
  return sql`select * from churches order by created_at asc`;
}

export async function getChurch(id) {
  const [c] = id
    ? await sql`select * from churches where id = ${id}`
    : await sql`select * from churches order by created_at asc limit 1`;
  return c ?? null;
}

export async function saveBrand(id, { name, primary, accent, aspect, handles, imageProvider }) {
  const hex = v => (/^#[0-9a-f]{6}$/i.test(v) ? v : null);
  await sql`
    update churches set
      name           = coalesce(${name || null}, name),
      brand_primary  = coalesce(${hex(primary)}, brand_primary),
      brand_accent   = coalesce(${hex(accent)}, brand_accent),
      default_aspect = coalesce(${ASPECTS[aspect] ? aspect : null}, default_aspect),
      handles        = ${sql.json(handles ?? {})},
      image_provider = ${['openrouter', 'none', 'pollinations'].includes(imageProvider) ? imageProvider : null}
    where id = ${id}`;
}

/** A one-shot link the browser uploads the logo to, straight to the worker. */
export async function logoUploadUrl(churchId) {
  const token = randomUUID();
  await sql`update churches set logo_token = ${token} where id = ${churchId}`;
  return `${config.workerPublicUrl}/logo/${churchId}?token=${token}`;
}

export const logoUrl = church =>
  church?.logo_path ? `${config.workerPublicUrl}/files/${church.logo_path}` : null;

/* ---- Connected accounts, via the posting provider ---- */

export const postingConfigured = () => zernio.configured();

/** The provider profile this church's accounts hang off. */
export async function ensureProfileId(church) {
  if (church.zernio_profile_id) return church.zernio_profile_id;
  const id = await zernio.ensureProfile(church.name || 'Church');
  if (id) await sql`update churches set zernio_profile_id = ${id} where id = ${church.id}`;
  return id;
}

export async function connectedAccounts(church) {
  if (!zernio.configured() || !church?.zernio_profile_id) return [];
  try {
    return await zernio.listAccounts(church.zernio_profile_id);
  } catch {
    return [];   // the settings page should still render if the provider is down
  }
}

export async function startConnect(church, platform, returnTo) {
  const profileId = await ensureProfileId(church);
  if (!profileId) throw new Error('could not create a profile with the posting provider');
  return zernio.connectUrl({
    platform,
    profileId,
    redirectUrl: returnTo,
    brandName: church.name,
    logoUrl: logoUrl(church) ?? undefined,
    primaryColor: church.brand_accent ?? undefined,
  });
}

export async function disconnectAccount(accountId) {
  await zernio.disconnect(accountId);
}

/** Platforms worth offering a church, in the order they matter to one. */
export const CONNECTABLE = [
  { key: 'facebook',  label: 'Facebook Page' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'youtube',   label: 'YouTube' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'threads',   label: 'Threads' },
  { key: 'twitter',   label: 'X' },
];
