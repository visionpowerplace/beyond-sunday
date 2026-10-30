import { getSermon, getItems, assetUrl, uploadUrl, KINDS, pendingGenerations, pendingClipCount } from '../../../lib/data.js';
import { approveAction, rejectAction, scheduleAction, setWindowAction, generateKindAction, retryAction, deleteSermonAction } from '../../actions.js';
import { notFound } from 'next/navigation';
import UploadBox from '../../upload-box.jsx';
import AddButton from '../../add-button.jsx';

export const dynamic = 'force-dynamic';

export default async function SermonPage({ params }) {
  const { id } = await params;
  const sermon = await getSermon(id);
  if (!sermon) notFound();
  const items = await getItems(id);

  const working = ['queued', 'ingesting', 'transcribing', 'generating', 'rendering'].includes(sermon.status);
  const upload = uploadUrl(sermon);
  const pending = await pendingGenerations(id);
  const clipsLeft = await pendingClipCount(id);
  const present = [...new Set(items.map(i => i.kind))];
  const missing = KINDS.filter(k => !present.includes(k.key) && !pending.includes(k.key));
  // Keep the page refreshing while anything at all is still being made.
  const busy = working || pending.length > 0 || clipsLeft > 0;

  return (
    <>
      {busy && <meta httpEquiv="refresh" content="5" />}
      <h1>{sermon.title}</h1>
      <p className="sub">
        {sermon.church_name}{sermon.preacher ? ` · ${sermon.preacher}` : ''}
        {sermon.duration_s ? ` · ${Math.round(sermon.duration_s / 60)} min` : ''}
      </p>

      {working && (
        <div className="card">
          <b>{labelFor(sermon.status)}</b>
          <div className="small muted">
            This page refreshes itself. Text items appear before the clips finish rendering, so you can start reviewing now.
          </div>
        </div>
      )}
      {upload && (
        <div className="card">
          <h3>Upload the recording</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            It goes straight to the processing server, not through this page. Video or audio, any length.
          </p>
          <UploadBox url={upload} />
        </div>
      )}

      {sermon.status === 'failed' && (
        <div className="card">
          <span className="flag">{sermon.error}</span>
          <form action={retryAction}>
            <input type="hidden" name="sermonId" value={sermon.id} />
            <button>Try again</button>
          </form>
        </div>
      )}

      {sermon.transcript && (
        <div className="card">
          <h3>Where the preaching is</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            {sermon.window_source === 'manual'
              ? 'Set by you.'
              : sermon.window_source === 'auto'
                ? 'Found automatically. Correct it if it caught the worship or missed the start.'
                : 'Using the whole recording.'}
          </p>
          <form action={setWindowAction} className="row">
            <input type="hidden" name="sermonId" value={sermon.id} />
            {present.map(k => <input key={k} type="hidden" name="existing" value={k} />)}
            <div style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="startAt" className="small">Starts at</label>
              <input id="startAt" name="startAt" defaultValue={clock(sermon.sermon_start_s)} placeholder="0:00" />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label htmlFor="endAt" className="small">Ends at</label>
              <input id="endAt" name="endAt" defaultValue={clock(sermon.sermon_end_s)} placeholder="1:18:30" />
            </div>
            <button style={{ alignSelf: 'flex-end' }}>Use these times and redo</button>
          </form>
          <p className="small muted">Redoing keeps the transcript, so it is quick and only redoes what you already have.</p>
        </div>
      )}

      {KINDS.filter(k => present.includes(k.key) || pending.includes(k.key)).map(kind => {
        const group = items.filter(i => i.kind === kind.key);
        const making = pending.includes(kind.key);
        return (
          <section key={kind.key}>
            <div className="row">
              <h2 style={{ marginBottom: 0 }}>{kind.label}</h2>
              <span className="spacer" />
              {making
                ? <span className="pill sched">making these now…</span>
                : (
                  <form action={generateKindAction}>
                    <input type="hidden" name="sermonId" value={sermon.id} />
                    <input type="hidden" name="kind" value={kind.key} />
                    <button className="small" style={{ minHeight: 32, padding: '4px 10px' }}>Redo</button>
                  </form>
                )}
            </div>
            <p className="small muted" style={{ margin: 0 }}>{kind.blurb}</p>
            {making && !group.length && (
              <div className="card"><Working label={kind.label} /></div>
            )}
            {group.map(item => <ItemCard key={item.id} item={item} sermonId={sermon.id} />)}
          </section>
        );
      })}

      {sermon.transcript && missing.length > 0 && (
        <section>
          <h2>Add to this sermon</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Made only when you ask. Each takes about a minute and uses the transcript you already have.
          </p>
          <div className="card">
            <div className="row">
              {missing.map(kind => (
                <form action={generateKindAction} key={kind.key}>
                  <input type="hidden" name="sermonId" value={sermon.id} />
                  <input type="hidden" name="kind" value={kind.key} />
                  <AddButton label={kind.label} />
                </form>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Working({ label }) {
  return (
    <div className="row" style={{ gap: 10 }}>
      <span className="spinner" aria-hidden="true" />
      <span>Making your {label.toLowerCase()}… about a minute.</span>
    </div>
  );
}

function labelFor(status) {
  return {
    queued: 'Queued',
    awaiting_upload: 'Waiting for the file',
    ingesting: 'Fetching the video',
    transcribing: 'Transcribing',
    generating: 'Writing',
    rendering: 'Rendering clips',
    deleting: 'Deleting',
  }[status] ?? status.replace(/_/g, ' ');
}

function ItemCard({ item, sermonId }) {
  const body = item.body ?? {};
  const flags = item.flags ?? [];
  const scripture = item.scripture ?? [];

  return (
    <div className="card">
      <div className="row">
        <h3 style={{ margin: 0 }}>{item.title}</h3>
        <span className="spacer" />
        {item.score != null && <span className="pill" title="How well this stands alone out of context">{Math.round(item.score)}</span>}
        <StatusPill item={item} />
      </div>

      {item.kind === 'clip' && (
        <div className="small muted">{fmt(item.start_s)} – {fmt(item.end_s)} · {Math.round(item.end_s - item.start_s)}s</div>
      )}

      {flags.map(f => <span key={f} className="flag">{flagText(f)}</span>)}

      {item.kind === 'clip' && (item.asset_path
        ? <>
            <video controls preload="metadata" playsInline src={assetUrl(item.asset_path)} style={{ marginTop: 10, maxHeight: 520 }} />
            <a className="small" href={assetUrl(item.asset_path)} download>Download this clip</a>
          </>
        : <p className="small muted">Still rendering…</p>)}

      {body.hook && <blockquote>{body.hook}</blockquote>}
      {body.quote && <blockquote>{body.quote}</blockquote>}
      {body.explain && <p>{body.explain}</p>}
      {body.text && <p style={{ whiteSpace: 'pre-wrap' }}>{body.text}</p>}
      {body.question && <p className="small"><b>Reflect:</b> {body.question}</p>}
      {body.prayer && <p className="small muted">{body.prayer}</p>}

      {Array.isArray(body.slides) && body.slides.length > 0 && (
        <div className="slides">
          {body.slides.map((s, i) => (
            <div className="slide" key={i}><b>{s.heading}</b><span>{s.body}</span></div>
          ))}
        </div>
      )}

      {body.caption && (
        <>
          <label className="small">Caption</label>
          <textarea defaultValue={body.caption} rows={3} readOnly />
        </>
      )}

      {scripture.length > 0 && (
        <p className="small muted">
          {scripture.map(s => s.ref + (s.unverified ? ' (unverified — not heard in the audio)' : '')).join(' · ')}
        </p>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <form action={approveAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="sermonId" value={sermonId} />
          <button className="approve" disabled={item.status === 'approved'}>Approve</button>
        </form>
        <form action={rejectAction} className="row" style={{ flex: 1 }}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="sermonId" value={sermonId} />
          <input name="reason" placeholder="Why not?" style={{ flex: 1, minWidth: 140 }} />
          <button className="reject">Reject</button>
        </form>
      </div>

      {item.status === 'approved' && (
        <form action={scheduleAction} className="row" style={{ marginTop: 10 }}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="sermonId" value={sermonId} />
          <input type="datetime-local" name="when" style={{ flex: 1, minWidth: 190 }} />
          <select name="networks" multiple size={1} style={{ flex: 1, minWidth: 150 }}>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
          </select>
          <button>Schedule</button>
        </form>
      )}

      {item.reject_reason && <p className="small" style={{ color: 'var(--bad)' }}>Rejected: {item.reject_reason}</p>}
      {item.scheduled_for && <p className="small muted">Scheduled for {new Date(item.scheduled_for).toLocaleString()} · {(item.networks ?? []).join(', ') || 'no network chosen'}</p>}
    </div>
  );
}

function StatusPill({ item }) {
  if (item.status === 'approved') return <span className="pill good">approved</span>;
  if (item.status === 'rejected') return <span className="pill bad">rejected</span>;
  if (item.status === 'scheduled') return <span className="pill sched">scheduled</span>;
  return <span className="pill">needs review</span>;
}

function flagText(f) {
  return {
    cut_off_argument: 'This clip may end mid-argument. Watch it before approving.',
    needs_context: 'This may not make sense without what came before it.',
    sensitive: 'Pastoral or sensitive content — check before this goes public.',
    music_under_speech: 'There is worship music in this service. Clips over music get muted or claimed on YouTube and Instagram.',
  }[f] ?? f;
}

// Seconds to h:mm:ss for an input someone will edit by hand.
function clock(s) {
  if (s == null) return '';
  const t = Math.round(Number(s));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

const fmt = s => {
  const t = Math.round(Number(s) || 0);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
