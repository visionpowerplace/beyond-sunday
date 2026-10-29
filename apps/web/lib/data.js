import { sql } from '@bs/core/db.js';
import { enqueue } from '@bs/core/queue.js';
import { config } from '@bs/core/config.js';

export const KINDS = [
  { key: 'clip',       label: 'Clips',        blurb: 'Vertical, captioned, ready to post' },
  { key: 'highlight',  label: 'Highlight points', blurb: 'The arguments the sermon actually made' },
  { key: 'carousel',   label: 'Carousels',    blurb: 'One per point, slide by slide' },
  { key: 'writeup',    label: 'Write-ups',    blurb: 'Short posts built on each point' },
  { key: 'summary',    label: 'Summary',      blurb: 'For whoever missed Sunday' },
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

export async function createSermon({ churchName, title, preacher, sourceUrl }) {
  const church = await getOrCreateChurch(churchName || 'My church');
  const [sermon] = await sql`
    insert into sermons (church_id, title, preacher, source_url, status)
    values (${church.id}, ${title}, ${preacher || null}, ${sourceUrl}, 'queued')
    returning *`;
  await enqueue({ type: 'ingest', sermonId: sermon.id });
  return sermon;
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
