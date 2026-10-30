import { sql } from '../db.js';
import { config } from '../config.js';
import * as zernio from '../providers/zernio.js';

/**
 * Hand one approved item to the posting provider.
 *
 * The job's run_after is the scheduled time, so the queue is the scheduler —
 * no cron, and a post that was due while the worker was down still goes out
 * when it comes back rather than being silently skipped.
 */
export async function runPublish(job) {
  const [item] = await sql`select * from items where id = ${job.item_id}`;
  if (!item) throw new Error(`item ${job.item_id} not found`);

  // Someone may have rejected or unscheduled it between scheduling and now.
  if (!['approved', 'scheduled'].includes(item.status)) {
    return { skipped: `item is ${item.status}` };
  }
  if (item.posted_at) return { skipped: 'already posted' };

  const [church] = await sql`
    select c.* from churches c join sermons s on s.church_id = c.id where s.id = ${item.sermon_id}`;

  const networks = item.networks ?? [];
  if (!networks.length) throw new Error('no networks chosen for this item');

  const accounts = (await zernio.listAccounts(church.zernio_profile_id))
    .filter(a => a.active && networks.includes(a.platform));

  if (!accounts.length) {
    throw new Error(`none of the chosen networks (${networks.join(', ')}) are connected. Connect them in Settings.`);
  }

  try {
    const result = await zernio.createPost({
      content: captionFor(item),
      media: mediaFor(item),
      accounts,
      when: null,              // the queue already waited; publish now
      idempotencyKey: item.publish_key ?? item.id,
      timezone: church.timezone,
    });

    await sql`
      update items set
        status     = 'posted',
        post_id    = ${result.id},
        post_urls  = ${sql.json(result.urls)},
        post_error = ${result.failures.length ? result.failures.join('; ') : null},
        posted_at  = now(),
        updated_at = now()
      where id = ${item.id}`;

    return { posted: accounts.map(a => a.platform), urls: result.urls.length, failures: result.failures };
  } catch (err) {
    // Say what went wrong on the item itself: a post that silently never
    // happened is the loudest complaint about every tool in this market.
    await sql`
      update items set post_error = ${String(err.message).slice(0, 1000)}, updated_at = now()
      where id = ${item.id}`;
    throw err;
  }
}

function captionFor(item) {
  const body = item.body ?? {};
  const parts = [];

  if (item.kind === 'devotional') {
    parts.push(item.title, body.text, body.question ? `\n${body.question}` : '', body.prayer);
  } else if (item.kind === 'highlight') {
    parts.push(item.title, body.explain);
  } else if (item.kind === 'writeup' || item.kind === 'summary') {
    parts.push(body.caption || item.title, body.text);
  } else {
    parts.push(body.caption || item.title);
  }

  const scripture = (item.scripture ?? []).filter(s => !s.unverified).map(s => s.ref);
  if (scripture.length) parts.push(`\n${scripture.join(' · ')}`);

  return parts.filter(Boolean).join('\n\n').trim().slice(0, 4000);
}

function mediaFor(item) {
  const url = p => `${config.workerPublicUrl}/files/${String(p).split('/').map(encodeURIComponent).join('/')}`;

  if (item.kind === 'clip' && item.asset_path) {
    return [{ type: 'video', url: url(item.asset_path) }];
  }
  if (item.kind === 'carousel') {
    return (item.body?.images ?? []).map(p => ({ type: 'image', url: url(p) }));
  }
  return [];
}
