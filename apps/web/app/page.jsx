import { currentUser } from '../lib/auth.js';
import { PLANS } from '@bs/core/billing.js';

export const dynamic = 'force-dynamic';

const PACK = [
  { kind: 'Clips', text: 'Four to eight vertical clips, captions burnt on, the verse on screen when it was spoken.' },
  { kind: 'Highlight points', text: 'The arguments the sermon actually made, each with a verbatim quote.' },
  { kind: 'Carousels', text: 'One per point, photographed and set in your colours.' },
  { kind: 'Write-ups', text: 'A short post built on each point, in the preacher’s register.' },
  { kind: 'Summary', text: 'A hundred and fifty words for whoever missed Sunday.' },
  { kind: 'Five-day devotional', text: 'Monday to Friday, each day a different part of the message.' },
];

export default async function Landing() {
  const user = await currentUser();
  const trial = PLANS.trial;

  return (
    <div className="landing">
      <section className="hero">
        <p className="eyebrow">For the person who got handed the church Instagram</p>
        <h1>One sermon in.<br />A week of content out.</h1>
        <p className="lede">
          Upload Sunday’s recording. Get clips, points, carousels, write-ups, a summary and a five-day
          devotional — each one waiting for someone to approve it before it goes anywhere.
        </p>
        <div className="row" style={{ gap: 10, marginTop: 24 }}>
          <a className="btn primary" href={user ? '/sundays' : '/signup'}>
            {user ? 'Go to your sermons' : `Start free — ${trial.sermons} sermons`}
          </a>
          <a className="btn" href="/pricing">See pricing</a>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>No card. {trial.days} days.</p>
      </section>

      <section>
        <h2 className="center">What one recording turns into</h2>
        <div className="grid">
          {PACK.map(p => (
            <div className="card" key={p.kind}>
              <h3>{p.kind}</h3>
              <p className="small muted" style={{ margin: 0 }}>{p.text}</p>
            </div>
          ))}
        </div>
        <p className="center small muted">
          Clips come first, because that is what you are waiting for. The rest are made when you ask,
          so you never pay for a devotional nobody wanted.
        </p>
      </section>

      <section className="band">
        <h2>Nothing publishes on its own</h2>
        <p className="lede">
          Every item is a card you approve, reject with a reason, or schedule. A clip that ends
          mid-argument is flagged before you see it, and a scripture reference nobody actually said is
          marked unverified rather than put on screen.
        </p>
        <p className="small muted">
          The model is wrong sometimes. A clip that reverses what the preacher meant is worse than no
          clip, so the approval step is the feature, not the friction.
        </p>
      </section>

      <section>
        <h2 className="center">Built for how a church actually works</h2>
        <div className="grid">
          <div className="card">
            <h3>Full service? Say where the preaching is</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Type the times, or leave them blank and the teaching block is found for you. No clips of
              the announcements.
            </p>
          </div>
          <div className="card">
            <h3>Your colours, your logo</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Carousels and clips come out looking like your church, not like a tool.
            </p>
          </div>
          <div className="card">
            <h3>Every size you need</h3>
            <p className="small muted" style={{ margin: 0 }}>
              9:16 for reels, 4:5 for the feed, 1:1 and 16:9 — re-cut from the same sermon.
            </p>
          </div>
          <div className="card">
            <h3>Post it, or download it</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Connect your accounts and schedule, or take the files and post them yourself.
            </p>
          </div>
          <div className="card">
            <h3>Counted in sermons</h3>
            <p className="small muted" style={{ margin: 0 }}>
              Not minutes, not credits. A church counts Sundays, so that is the unit.
            </p>
          </div>
          <div className="card">
            <h3>Worship music gets flagged</h3>
            <p className="small muted" style={{ margin: 0 }}>
              A clip laid over a licensed song gets muted or claimed. You are told before you post it.
            </p>
          </div>
        </div>
      </section>

      <section className="center" style={{ paddingBottom: 60 }}>
        <h2>Try it on last Sunday</h2>
        <p className="lede" style={{ margin: '0 auto 22px' }}>
          {trial.sermons} sermons, everything switched on. If it is not useful you have lost an upload.
        </p>
        <a className="btn primary" href={user ? '/sundays' : '/signup'}>
          {user ? 'Go to your sermons' : 'Start free'}
        </a>
      </section>
    </div>
  );
}
