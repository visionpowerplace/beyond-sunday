import { randomUUID } from 'node:crypto';
import { sql } from '@bs/core/db.js';
import { config } from '@bs/core/config.js';
import { ASPECTS, NETWORKS } from '@bs/core/brand.js';

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

export async function saveBrand(id, { name, primary, accent, aspect, handles }) {
  const hex = v => (/^#[0-9a-f]{6}$/i.test(v) ? v : null);
  await sql`
    update churches set
      name           = coalesce(${name || null}, name),
      brand_primary  = coalesce(${hex(primary)}, brand_primary),
      brand_accent   = coalesce(${hex(accent)}, brand_accent),
      default_aspect = coalesce(${ASPECTS[aspect] ? aspect : null}, default_aspect),
      handles        = ${sql.json(handles ?? {})}
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
