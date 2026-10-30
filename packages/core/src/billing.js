/**
 * Billing, counted in sermons.
 *
 * Every competitor meters minutes or credits, and every review of them
 * complains about it: a church cannot tell what a 90-minute service with a
 * 35-minute sermon will cost. A church counts Sundays, so that is the unit.
 *
 * One sermon covers everything that comes out of it — transcript, clips, and
 * each deliverable it asks for — so nobody has to ration the devotional.
 */

export const PLANS = {
  trial: {
    key: 'trial',
    name: 'Free trial',
    price: 0,
    sermons: 2,
    days: 14,
    blurb: 'Two sermons, everything switched on, no card.',
    features: ['Clips, points, carousels, write-ups, summary, devotional', 'Your colours and logo', 'Download everything'],
  },
  free: {
    key: 'free',
    name: 'Free',
    price: 0,
    sermons: 1,
    blurb: 'One sermon a month, so a small church can keep going.',
    features: ['One sermon a month', 'Clips and one other deliverable', 'Download everything'],
  },
  church: {
    key: 'church',
    name: 'Church',
    price: 29,
    sermons: 8,
    blurb: 'A sermon a week, with room for a midweek service.',
    features: ['8 sermons a month', 'Every deliverable', 'Schedule and post to your accounts', '3 seats'],
  },
  ministry: {
    key: 'ministry',
    name: 'Ministry',
    price: 69,
    sermons: 20,
    blurb: 'Several services, several sites, several people reviewing.',
    features: ['20 sermons a month', 'Every deliverable', 'Schedule and post to your accounts', '10 seats', 'Priority rendering'],
  },
};

/** Extra sermons, bought outright. They do not expire with the month. */
export const CREDIT_PACKS = [
  { key: 'pack4',  sermons: 4,  price: 16, blurb: 'A catch-up month' },
  { key: 'pack10', sermons: 10, price: 35, blurb: 'A conference or a series' },
  { key: 'pack25', sermons: 25, price: 75, blurb: 'A year of midweek services' },
];

export const planOf = church => PLANS[church?.plan] ?? PLANS.free;

/** Monthly allowance resets on the day of the month the church started. */
export function periodEnd(church) {
  const start = new Date(church?.period_started_at ?? Date.now());
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return end;
}

export function trialOver(church) {
  if (church?.plan !== 'trial') return false;
  return church.trial_ends_at ? new Date(church.trial_ends_at) < new Date() : false;
}

/**
 * What a church has left: this period's allowance, plus bought credits.
 */
export function balance(church) {
  const plan = planOf(church);
  const expired = trialOver(church);
  const included = expired ? 0 : plan.sermons;
  const used = church?.sermons_used ?? 0;
  const extra = church?.extra_credits ?? 0;

  return {
    plan,
    included,
    used,
    remainingIncluded: Math.max(0, included - used),
    extra,
    total: Math.max(0, included - used) + extra,
    trialOver: expired,
    renewsAt: periodEnd(church),
  };
}

export function canStartSermon(church) {
  const b = balance(church);
  if (b.total > 0) return { ok: true, ...b };
  return {
    ok: false,
    ...b,
    reason: b.trialOver
      ? 'Your free trial has ended. Choose a plan to carry on.'
      : b.extra === 0 && b.remainingIncluded === 0
        ? `You have used all ${b.included} sermons on the ${b.plan.name} plan this period. It renews ${b.renewsAt.toLocaleDateString()}, or you can add credits.`
        : 'No sermons left on this plan.',
  };
}
