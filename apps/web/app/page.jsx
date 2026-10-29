import { listSermons } from '../lib/data.js';
import { newSermonAction } from './actions.js';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let sermons = [];
  let dbError = null;
  try { sermons = await listSermons(); }
  catch (err) { dbError = err.message; }

  return (
    <>
      <h1>Sundays</h1>
      <p className="sub">Paste a sermon link. You get clips, points, carousels, write-ups, a summary and a five-day devotional — all waiting for your approval.</p>

      {dbError && (
        <div className="flag">
          Cannot reach the database: {dbError}. Set DATABASE_URL and run <code>npm run db:init</code>.
        </div>
      )}

      <form action={newSermonAction} className="card">
        <label htmlFor="sourceUrl">YouTube link to the sermon</label>
        <input id="sourceUrl" name="sourceUrl" required placeholder="https://www.youtube.com/watch?v=..." />
        <label htmlFor="title">Sermon title</label>
        <input id="title" name="title" required placeholder="A Power In Silence" />
        <div className="row">
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="preacher">Preacher</label>
            <input id="preacher" name="preacher" placeholder="Pastor's name" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label htmlFor="churchName">Church</label>
            <input id="churchName" name="churchName" placeholder="The Empowerment Center" />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="primary" type="submit">Make this week&rsquo;s content</button>
        </div>
      </form>

      <h2>Recent</h2>
      {!sermons.length && !dbError && <p className="muted small">Nothing yet.</p>}
      {sermons.map(s => (
        <a key={s.id} href={`/sermon/${s.id}`} className="card" style={{ display: 'block', textDecoration: 'none' }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>{s.title}</h3>
            <span className="spacer" />
            <StatusPill status={s.status} />
          </div>
          <div className="small muted">
            {s.church_name}
            {s.preacher ? ` · ${s.preacher}` : ''}
            {Number(s.item_count) > 0 ? ` · ${s.approved_count}/${s.item_count} approved` : ''}
          </div>
          {s.status === 'failed' && s.error && <span className="flag">{s.error}</span>}
        </a>
      ))}
    </>
  );
}

function StatusPill({ status }) {
  const cls = status === 'ready' ? 'pill good' : status === 'failed' ? 'pill bad' : 'pill';
  const label = status === 'ready' ? 'ready to review' : status;
  return <span className={cls}>{label}</span>;
}
