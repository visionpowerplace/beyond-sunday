import { sql } from './db.js';

/**
 * What each sermon actually cost at the provider.
 *
 * None of this was recorded before, so the first anyone knew about the bill
 * was the provider refusing a request. OpenRouter returns usage.cost on every
 * response: the real amount charged, not an estimate. It is worth storing.
 *
 * A church should be able to see what a Sunday cost before the money runs
 * out, and whoever runs the deployment should be able to see which part of
 * the pipeline is expensive. The answer here was images, by a wide margin:
 * one sermon makes four or five carousels of five slides each, and every
 * slide is a paid photograph.
 *
 * Recording is best effort. A sermon must never fail because its receipt
 * could not be written.
 */
export async function recordSpend({ sermonId, churchId, stage, model, costUsd, units = 1, detail = null }) {
  const cost = Number(costUsd);
  if (!Number.isFinite(cost) || cost < 0) return;
  try {
    await sql`
      insert into spend (sermon_id, church_id, stage, model, cost_usd, units, detail)
      values (${sermonId ?? null}, ${churchId ?? null}, ${stage}, ${model ?? null},
              ${cost}, ${units}, ${detail})`;
  } catch (err) {
    console.error(`[spend] could not record ${stage}: ${err.message}`);
  }
}

/** What one sermon has cost so far, split by stage. */
export async function spendForSermon(sermonId) {
  const rows = await sql`
    select stage, sum(cost_usd)::float as cost, sum(units)::int as units
      from spend where sermon_id = ${sermonId}
     group by stage order by cost desc`;
  return { total: rows.reduce((n, r) => n + r.cost, 0), byStage: rows };
}

/** What a church has spent, and on what, over a window of days. */
export async function spendForChurch(churchId, days = 30) {
  const rows = await sql`
    select stage, model, sum(cost_usd)::float as cost, sum(units)::int as units
      from spend
     where church_id = ${churchId}
       and created_at > now() - ${`${days} days`}::interval
     group by stage, model order by cost desc`;
  return { total: rows.reduce((n, r) => n + r.cost, 0), rows };
}

/** Money is easier to judge than a float with eight decimal places. */
export function money(usd) {
  const n = Number(usd) || 0;
  if (n === 0) return '$0.00';
  if (n < 0.01) return 'under 1c';
  return `$${n.toFixed(2)}`;
}
