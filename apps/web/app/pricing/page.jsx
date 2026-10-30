import { PLANS, CREDIT_PACKS } from '@bs/core/billing.js';
import { currentUser } from '../../lib/auth.js';

export const dynamic = 'force-dynamic';

const SHOWN = [PLANS.free, PLANS.church, PLANS.ministry];

export default async function Pricing() {
  const user = await currentUser();
  const cta = user ? '/billing' : '/signup';

  return (
    <div className="landing">
      <section className="hero" style={{ paddingBottom: 10 }}>
        <h1>Priced by the sermon</h1>
        <p className="lede">
          Every other tool meters minutes or credits, and nobody can tell what a 90-minute service with
          a 35-minute sermon will cost. A church counts Sundays, so that is what we count. One sermon
          covers everything that comes out of it.
        </p>
      </section>

      <section>
        <div className="grid">
          {SHOWN.map(plan => (
            <div className="card plan" key={plan.key}>
              <h3>{plan.name}</h3>
              <p className="price">{plan.price ? `$${plan.price}` : 'Free'}<span className="small muted">{plan.price ? '/month' : ''}</span></p>
              <p className="small muted">{plan.blurb}</p>
              <ul className="ticks">
                {plan.features.map(f => <li key={f}>{f}</li>)}
              </ul>
              <a className={`btn ${plan.key === 'church' ? 'primary' : ''}`} href={cta}>
                {user ? 'Choose this plan' : 'Start free'}
              </a>
            </div>
          ))}
        </div>
        <p className="center small muted">
          Every plan includes the free trial first: {PLANS.trial.sermons} sermons over {PLANS.trial.days} days, no card.
        </p>
      </section>

      <section>
        <h2 className="center">Need more than the plan?</h2>
        <p className="center small muted" style={{ marginTop: 0 }}>
          Extra sermons, bought outright. They do not expire at the end of the month.
        </p>
        <div className="grid">
          {CREDIT_PACKS.map(pack => (
            <div className="card plan" key={pack.key}>
              <h3>{pack.sermons} sermons</h3>
              <p className="price">${pack.price}</p>
              <p className="small muted">{pack.blurb}</p>
              <p className="small muted">${(pack.price / pack.sermons).toFixed(2)} a sermon</p>
              <a className="btn" href={cta}>{user ? 'Add credits' : 'Start free'}</a>
            </div>
          ))}
        </div>
      </section>

      <section className="band">
        <h2>What counts as a sermon</h2>
        <p className="lede">
          One recording. Transcribing it, finding the preaching inside a full service, the clips, and
          every deliverable you ask for afterwards — all of it is that one sermon.
        </p>
        <p className="small muted">
          Redoing a set because the first attempt missed the point costs nothing extra. Correcting the
          sermon window and re-rendering costs nothing extra. You are charged when a recording starts
          processing, not per button.
        </p>
      </section>
    </div>
  );
}
