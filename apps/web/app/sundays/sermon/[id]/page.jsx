import { getSermon, getItems, assetUrl, uploadUrl, KINDS, pendingGenerations, pendingClipCount } from '../../../../lib/data.js';
import { getChurch, connectedAccounts, postingConfigured } from '../../../../lib/church.js';
import { approveAction, rejectAction, scheduleAction, setWindowAction, generateKindAction, retryAction, deleteSermonAction, makeAspectAction, publishNowAction } from '../../../actions.js';
import { notFound } from 'next/navigation';
import UploadBox from '../../../upload-box.jsx';
import AddButton from '../../../add-button.jsx';

export const dynamic = 'force-dynamic';

export default async function SermonPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  const sermon = await getSermon(id);
  if (!sermon) notFound();
  const items = await getItems(id);

  const working = ['queued', 'ingesting', 'transcribing', 'generating', 'rendering'].includes(sermon.status);
  const upload = uploadUrl(sermon);
  const church = await getChurch(sermon.church_id);
  const accounts = postingConfigured() ? await connectedAccounts(church) : [];
  const networks = [...new Set(accounts.map(a => a.platform))];
  const pending = await pendingGenerations(id);
  const clipsLeft = await pendingClipCount(id);
  const present = [...new Set(items.map(i => i.kind))];
  const missing = KINDS.filter(k => !present.includes(k.key) && !pending.includes(k.key));
  // Keep the page refreshing while anything at all is still being made.
  const busy = working || pending.length > 0 || clipsLeft > 0;

  // One kind at a time. The page used to be every deliverable stacked into a
  // single column, which meant scrolling past forty cards to reach the
  // devotional.
  const available = KINDS.filter(k => present.includes(k.key) || pending.includes(k.key));
  const tab = available.find(k => k.key === query?.show)?.key ?? available[0]?.key ?? null;
  const shown = available.filter(k => k.key === tab);
  const counts = Object.fromEntries(available.map(k => [k.key, items.filter(i => i.kind === k.key).length]));

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

      {available.length > 1 && (
        <nav className="tabs" aria-label="Deliverables">
          {available.map(k => (
            <a key={k.key} href={`?show=${k.key}`} className={`tab${k.key === tab ? ' on' : ''}`}
               aria-current={k.key === tab ? 'page' : undefined}>
              {k.label}
              <span className="tab-count">{pending.includes(k.key) && !counts[k.key] ? '…' : counts[k.key]}</span>
            </a>
          ))}
        </nav>
      )}

      {shown.map(kind => {
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
            {group.map(item => <ItemCard key={item.id} item={item} sermonId={sermon.id} networks={networks} />)}
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

// 9:16 is always made; these are the extras a church can ask for per clip.
const OTHER_ASPECTS = ['4:5', '1:1', '16:9'];

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

function ItemCard({ item, sermonId, networks }) {
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
            <div className="row small" style={{ marginTop: 8 }}>
              <a href={assetUrl(item.asset_path)} download>Download 9:16</a>
              {Object.entries(item.variants ?? {}).map(([aspect, p]) => (
                <a key={aspect} href={assetUrl(p)} download>Download {aspect}</a>
              ))}
              <span className="spacer" />
              {OTHER_ASPECTS.filter(a => !(item.variants ?? {})[a]).map(aspect => (
                <form action={makeAspectAction} key={aspect}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="sermonId" value={sermonId} />
                  <input type="hidden" name="aspect" value={aspect} />
                  <button className="small" style={{ minHeight: 30, padding: '3px 9px' }}>Make {aspect}</button>
                </form>
              ))}
            </div>
          </>
        : <p className="small muted">Still rendering…</p>)}

      {body.hook && <blockquote>{body.hook}</blockquote>}
      {body.quote && <blockquote>{body.quote}</blockquote>}
      {body.explain && <p>{body.explain}</p>}
      {body.text && <p style={{ whiteSpace: 'pre-wrap' }}>{body.text}</p>}
      {body.question && <p className="small"><b>Reflect:</b> {body.question}</p>}
      {body.prayer && <p className="small muted">{body.prayer}</p>}

      {Array.isArray(body.images) && body.images.length > 0 ? (
        <>
          <div className="slide-strip">
            {body.images.map((src, i) => (
              <a key={i} href={assetUrl(src)} target="_blank" rel="noreferrer">
                <img src={assetUrl(src)} alt={`Slide ${i + 1}`} loading="lazy" />
              </a>
            ))}
          </div>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            Tap a slide to open it full size, then save it.
          </p>
        </>
      ) : Array.isArray(body.slides) && body.slides.length > 0 && (
        <>
          {item.kind === 'carousel' && <p className="small muted">Designing these slides…</p>}
          <div className="slides">
            {body.slides.map((s, i) => (
              <div className="slide" key={i}><b>{s.heading}</b><span>{s.body}</span></div>
            ))}
          </div>
        </>
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

      {['approved', 'scheduled'].includes(item.status) && (
        networks.length ? (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <form action={scheduleAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="sermonId" value={sermonId} />
              <div className="row">
                {networks.map(n => (
                  <label key={n} className="small" style={{ margin: 0, textTransform: 'capitalize', fontWeight: 500 }}>
                    <input type="checkbox" name="networks" value={n}
                           defaultChecked={(item.networks ?? []).includes(n)}
                           style={{ width: 'auto', minHeight: 0, marginRight: 6 }} />
                    {n}
                  </label>
                ))}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input type="datetime-local" name="when"
                       defaultValue={item.scheduled_for ? localValue(item.scheduled_for) : ''}
                       style={{ flex: 1, minWidth: 200 }} />
                <button>{item.scheduled_for ? 'Reschedule' : 'Schedule'}</button>
              </div>
            </form>
            {item.status === 'approved' && (
              <form action={publishNowAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="sermonId" value={sermonId} />
                <button className="small" style={{ minHeight: 32 }}>Post now</button>
              </form>
            )}
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              Tick the networks, then pick a time — or post it straight away.
            </p>
          </div>
        ) : (
          <p className="small muted" style={{ marginTop: 10 }}>
            <a href="/settings">Connect an account</a> to schedule this, or use the download button.
          </p>
        )
      )}

      {item.status === 'posted' && (
        <p className="small" style={{ color: 'var(--good)' }}>
          Posted{item.posted_at ? ` ${new Date(item.posted_at).toLocaleString()}` : ''}
          {(item.post_urls ?? []).length > 0 && ' · '}
          {(item.post_urls ?? []).map((u, i) => (
            <a key={u} href={u} target="_blank" rel="noreferrer">{i ? ' · view' : 'view'}</a>
          ))}
        </p>
      )}
      {item.post_error && <span className="flag">Posting problem: {item.post_error}</span>}

      {item.reject_reason && <p className="small" style={{ color: 'var(--bad)' }}>Rejected: {item.reject_reason}</p>}
      {item.scheduled_for && <p className="small muted">Scheduled for {new Date(item.scheduled_for).toLocaleString()} · {(item.networks ?? []).join(', ') || 'no network chosen'}</p>}
    </div>
  );
}

// datetime-local wants a local wall-clock string, not an ISO instant.
function localValue(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StatusPill({ item }) {
  if (item.status === 'posted') return <span className="pill good">posted</span>;
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
