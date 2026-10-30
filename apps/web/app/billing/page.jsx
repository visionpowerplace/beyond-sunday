import { requireUser, currentChurch } from '../../lib/auth.js';
import { PLANS, CREDIT_PACKS, balance } from '@bs/core/billing.js';
import { sql } from '@bs/core/db.js';
import { choosePlanAction, addCreditsAction } from '../actions.js';

export const dynamic = 'force-dynamic';

const SHOWN = [PLANS.free, PLANS.church, PLANS.ministry];

export default async function Billing({ searchParams }) {
  const params = await searchParams;
  const user = await requireUser();
  const church = await currentChurch(user);
  const credit = balance(church);
  const ledger = await sql`
    select * from credit_ledger where church_id = ${church.id} order by created_at desc limit 12`;

  return (
    <>
      <h1>Plan and credits</h1>
      <p className="sub">Counted in sermons. One sermon covers everything that comes out of it.</p>

      {params?.problem && <div className="flag">{String(params.problem)}</div>}
      {params?.done && <div className="card" style={{ borderColor: 'var(--good)' }}>{String(params.done)}</div>}

      <div className="card">
        <div className="row">
          <div>
            <h3 style={{ margin: 0 }}>{credit.plan.name}</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {credit.trialOver
                ? 'Your trial has ended.'
                : `${credit.remainingIncluded} of ${credit.included} left this period · renews ${credit.renewsAt.toLocaleDateString()}`}
              {credit.extra > 0 && ` · ${credit.extra} bought credit${credit.extra === 1 ? '' : 's'}`}
            </p>
          </div>
          <span className="spacer" />
          <span className="pill" style={{ fontSize: '1rem', padding: '8px 16px' }}>
            {credit.total} sermon{credit.total === 1 ? '' : 's'} left
          </span>
        </div>
      </div>

      <h2>Plans</h2>
      <div className="grid">
        {SHOWN.map(plan => (
          <div className="card plan" key={plan.key}>
            <h3>{plan.name}</h3>
            <p className="price">{plan.price ? `$${plan.price}` : 'Free'}<span className="small muted">{plan.price ? '/month' : ''}</span></p>
            <p className="small muted">{plan.blurb}</p>
            <ul className="ticks">{plan.features.map(f => <li key={f}>{f}</li>)}</ul>
            {church.plan === plan.key ? (
              <span className="pill good">Your plan</span>
            ) : (
              <form action={choosePlanAction}>
                <input type="hidden" name="plan" value={plan.key} />
                <button className={plan.key === 'church' ? 'primary' : ''}>Choose {plan.name}</button>
              </form>
            )}
          </div>
        ))}
      </div>

      <h2>Extra sermons</h2>
      <p className="small muted" style={{ marginTop: 0 }}>Bought outright. They do not expire at the end of the month.</p>
      <div className="grid">
        {CREDIT_PACKS.map(pack => (
          <div className="card plan" key={pack.key}>
            <h3>{pack.sermons} sermons</h3>
            <p className="price">${pack.price}</p>
            <p className="small muted">{pack.blurb} · ${(pack.price / pack.sermons).toFixed(2)} each</p>
            <form action={addCreditsAction}>
              <input type="hidden" name="pack" value={pack.key} />
              <button>Add {pack.sermons}</button>
            </form>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>About paying</h3>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Checkout is not connected yet, so choosing a plan or adding credits applies immediately and
          charges nothing. The billing itself sits behind one interface: connecting Stripe, or Paystack
          for naira pricing, changes how these buttons settle without changing anything else here.
        </p>
      </div>

      <h2>Recent activity</h2>
      <div className="card">
        {!ledger.length && <p className="small muted" style={{ margin: 0 }}>Nothing yet.</p>}
        {ledger.map(row => (
          <div className="row small" key={row.id} style={{ borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
            <span style={{ color: row.delta >= 0 ? 'var(--good)' : 'var(--muted)', fontWeight: 700, minWidth: 40 }}>
              {row.delta >= 0 ? `+${row.delta}` : row.delta}
            </span>
            <span>{row.reason}</span>
            <span className="spacer" />
            <span className="muted">{new Date(row.created_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </>
  );
}
