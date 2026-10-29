import { sql } from '@bs/core/db.js';
import { enqueue } from '@bs/core/queue.js';
import { config } from '@bs/core/config.js';
import { randomUUID } from 'node:crypto';

export const KINDS = [
  { key: 'clip',       label: 'Clips',               blurb: 'Vertical, captioned, ready to post' },
  { key: 'highlight',  label: 'Highlight points',    blurb: 'The arguments the sermon actually made' },
  { key: 'carousel',   label: 'Carousels',           blurb: 'One per point, slide by slide' },
  { key: 'writeup',    label: 'Write-ups',           blurb: 'Short posts built on each point' },
  { key: 'summary',    label: 'Summary',             blurb: 'For whoever missed Sunday' },
  { key: 'devotional', label: 'Five-day devotional', blurb: 'Monday to Friday, one point a day' },
];

export async function listSermons() {
  return sql`
    select s.*, c.name as church_name,
           (select count(*) from items i where i.sermon_id = s.id) as item_count,
           (select count(*) from items i where i.sermon_id = s.id and i.status = 'approved') as approved_count
    from sermons s join churches c on c.id = s.church_id
    order by s.created_at desc limit 50`;
}

export async function getSermon(id) {
  const [s] = await sql`
    select s.*, c.name as church_name, c.timezone
    from sermons s join churches c on c.id = s.church_id where s.id = ${id}`;
  return s ?? null;
}

export async function getItems(sermonId) {
  return sql`select * from items where sermon_id = ${sermonId} order by kind, ordinal`;
}

export async function getOrCreateChurch(name) {
  const [found] = await sql`select * from churches where name = ${name} limit 1`;
  if (found) return found;
  const [made] = await sql`insert into churches (name) values (${name}) returning *`;
  return made;
}

export async function createSermon({ churchName, title, preacher, sourceUrl, startS, endS, upload }) {
  const church = await getOrCreateChurch(churchName || 'My church');
  const token = upload ? randomUUID() : null;

  const [sermon] = await sql`
    insert into sermons (church_id, title, preacher, source_url, sermon_start_s, sermon_end_s, window_source, upload_token, status)
    values (${church.id}, ${title}, ${preacher || null}, ${sourceUrl || null},
            ${startS ?? null}, ${endS ?? null}, ${startS != null || endS != null ? 'manual' : null},
            ${token}, ${upload ? 'awaiting_upload' : 'queued'})
    returning *`;

  // An upload enqueues itself once the file actually lands on the volume.
  if (!upload) await enqueue({ type: 'ingest', sermonId: sermon.id });
  return sermon;
}

export async function setWindow(sermonId, startS, endS) {
  await sql`
    update sermons set sermon_start_s = ${startS ?? null}, sermon_end_s = ${endS ?? null},
      window_source = 'manual', updated_at = now()
    where id = ${sermonId}`;
}

/**
 * Generate one or more deliverable types. The transcript is kept — it is the
 * expensive part and the audio has not changed — so each of these costs a
 * single call.
 */
export async function generateKinds(sermonId, kinds) {
  await sql`update sermons set status = 'generating', error = null, updated_at = now() where id = ${sermonId}`;
  await enqueue({ type: 'generate', sermonId, payload: { kinds } });
}

/** Which deliverables this sermon already has, so the page knows what to offer. */
export async function presentKinds(sermonId) {
  const rows = await sql`select distinct kind from items where sermon_id = ${sermonId}`;
  return new Set(rows.map(r => r.kind));
}

export async function retryIngest(sermonId) {
  await sql`update sermons set status = 'queued', error = null, updated_at = now() where id = ${sermonId}`;
  await enqueue({ type: 'ingest', sermonId });
}

export function uploadUrl(sermon) {
  if (!sermon.upload_token) return null;
  return `${config.workerPublicUrl}/upload/${sermon.id}?token=${sermon.upload_token}`;
}

export async function setItemStatus(id, status, reason) {
  await sql`
    update items set status = ${status},
      reject_reason = ${status === 'rejected' ? (reason || null) : null},
      updated_at = now()
    where id = ${id}`;
}

export async function scheduleItem(id, when, networks) {
  await sql`
    update items set scheduled_for = ${when || null}, networks = ${networks ?? []},
      status = case when ${when ? true : false} then 'scheduled' else status end,
      updated_at = now()
    where id = ${id}`;
}

export const assetUrl = p => (p ? `${config.workerPublicUrl}/files/${p.split('/').map(encodeURIComponent).join('/')}` : null);
