import { listSermons, storageStatus } from '../lib/data.js';
import { newSermonAction, deleteSermonAction, deleteFailedAction } from './actions.js';
import { SUPPORTED_SOURCES } from '@bs/core/source-url.js';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }) {
  const params = await searchParams;
  let sermons = [];
  let dbError = null;
  try { sermons = await listSermons(); }
  catch (err) { dbError = err.message; }
  const storage = await storageStatus();
  const failedCount = sermons.filter(s => s.status === 'failed').length;

  return (
    <>
      <h1>Sundays</h1>
      <p className="sub">Paste a sermon link. You get clips, points, carousels, write-ups, a summary and a five-day devotional — all waiting for your approval.</p>

      {params?.problem && <div className="flag">{String(params.problem)}</div>}

      {dbError && (
        <div className="flag">
          Cannot reach the database: {dbError}. Set DATABASE_URL and run <code>npm run db:init</code>.
        </div>
      )}

      <form action={newSermonAction} className="card">
        <div className="row" style={{ gap: 16 }}>
          <label className="small" style={{ margin: 0 }}><input type="radio" name="mode" value="upload" defaultChecked style={{ width: 'auto', minHeight: 0, marginRight: 6 }} /> Upload the recording</label>
          <label className="small" style={{ margin: 0 }}><input type="radio" name="mode" value="link" style={{ width: 'auto', minHeight: 0, marginRight: 6 }} /> Use a link</label>
        </div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Uploading always works. Links work for {SUPPORTED_SOURCES.join(', ')} — share-page links are
          turned into the file behind them and checked before anything is queued. YouTube does not allow
          server downloads, so a YouTube link is refused.
        </p>

        <label htmlFor="sourceUrl">Link to the video file (only if using a link)</label>
        <input id="sourceUrl" name="sourceUrl" placeholder="https://..." />
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
        <div className="row">
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="startAt">Sermon starts at</label>
            <input id="startAt" name="startAt" placeholder="e.g. 42:10 — leave blank to find it" />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label htmlFor="endAt">Sermon ends at</label>
            <input id="endAt" name="endAt" placeholder="e.g. 1:18:30" />
          </div>
        </div>
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Full service recording? Give the times and only the preaching is used. Leave them blank and
          the preaching block is found for you — you can correct it afterwards.
        </p>

        <div style={{ marginTop: 14 }}>
          <button className="primary" type="submit">Make this week&rsquo;s content</button>
        </div>
      </form>

      <div className="row">
        <h2 style={{ marginBottom: 0 }}>Recent</h2>
        <span className="spacer" />
        {failedCount > 0 && (
          <form action={deleteFailedAction}>
            <button className="reject" style={{ minHeight: 32, padding: '4px 10px' }}>
              Delete {failedCount} failed
            </button>
          </form>
        )}
      </div>
      {storage && (
        <p className="small muted" style={{ margin: 0 }}>
          Storage: {storage.free} free of {storage.total}. Recordings are cleared automatically a few days
          after their clips are made; delete a sermon to free its space now.
        </p>
      )}
      {!sermons.length && !dbError && <p className="muted small">Nothing yet.</p>}
      {sermons.map(s => (
        <div key={s.id} className="card">
          <div className="row">
            <h3 style={{ margin: 0 }}>
              <a href={`/sermon/${s.id}`} style={{ textDecoration: 'none' }}>{s.title}</a>
            </h3>
            <span className="spacer" />
            <StatusPill status={s.status} />
            <form action={deleteSermonAction}>
              <input type="hidden" name="sermonId" value={s.id} />
              <input type="hidden" name="stay" value="1" />
              <button className="reject" style={{ minHeight: 32, padding: '4px 10px' }}
                      aria-label={`Delete ${s.title}`}>Delete</button>
            </form>
          </div>
          <div className="small muted">
            {s.church_name}
            {s.preacher ? ` · ${s.preacher}` : ''}
            {Number(s.item_count) > 0 ? ` · ${s.approved_count}/${s.item_count} approved` : ''}
          </div>
          {s.status === 'failed' && s.error && <span className="flag">{s.error}</span>}
        </div>
      ))}
    </>
  );
}

// Database words are not status words. Nobody should read "awaiting_upload".
const STATUS_LABELS = {
  ready: 'ready to review',
  failed: 'failed',
  awaiting_upload: 'waiting for the file',
  queued: 'queued',
  ingesting: 'fetching the video',
  transcribing: 'transcribing',
  generating: 'writing',
  rendering: 'rendering clips',
  deleting: 'deleting',
};

function StatusPill({ status }) {
  const cls = status === 'ready' ? 'pill good' : status === 'failed' ? 'pill bad' : 'pill';
  return <span className={cls}>{STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}</span>;
}
