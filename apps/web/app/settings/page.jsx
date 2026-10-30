import { listChurches, getChurch, logoUploadUrl, logoUrl, ASPECTS, NETWORKS } from '../../lib/church.js';
import { saveBrandAction } from '../actions.js';
import UploadBox from '../upload-box.jsx';

export const dynamic = 'force-dynamic';

export default async function Settings({ searchParams }) {
  const params = await searchParams;
  const churches = await listChurches();
  const church = await getChurch(params?.church);

  if (!church) {
    return (
      <>
        <h1>Settings</h1>
        <p className="sub">Nothing to set up yet — make a sermon first and your church is created with it.</p>
        <a className="btn" href="/">Back</a>
      </>
    );
  }

  const upload = await logoUploadUrl(church.id);
  const logo = logoUrl(church);
  const handles = church.handles ?? {};

  return (
    <>
      <h1>Settings</h1>
      <p className="sub">
        Your colours, logo and handles go onto every clip and carousel, so what you post looks like
        your church rather than like this tool.
      </p>

      {churches.length > 1 && (
        <div className="row" style={{ marginBottom: 14 }}>
          {churches.map(c => (
            <a key={c.id} href={`/settings?church=${c.id}`}
               className="pill" style={{ textDecoration: 'none', padding: '8px 14px',
               borderColor: c.id === church.id ? 'var(--ink)' : 'var(--line)',
               color: c.id === church.id ? 'var(--ink)' : 'var(--muted)' }}>{c.name}</a>
          ))}
        </div>
      )}

      <form action={saveBrandAction} className="card">
        <input type="hidden" name="churchId" value={church.id} />

        <label htmlFor="name">Church name</label>
        <input id="name" name="name" defaultValue={church.name} />
        <p className="small muted" style={{ margin: '4px 0 0' }}>Printed along the bottom of every carousel slide.</p>

        <div className="row" style={{ marginTop: 6 }}>
          <div style={{ flex: 1, minWidth: 190 }}>
            <label htmlFor="primary">Main colour</label>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <input type="color" id="primary" name="primary" defaultValue={church.brand_primary ?? '#16140f'}
                     style={{ width: 54, padding: 4, flex: '0 0 auto' }} />
              <input name="primaryHex" defaultValue={church.brand_primary ?? '#16140f'} aria-label="Main colour hex" />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 190 }}>
            <label htmlFor="accent">Accent colour</label>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <input type="color" id="accent" name="accent" defaultValue={church.brand_accent ?? '#a9802f'}
                     style={{ width: 54, padding: 4, flex: '0 0 auto' }} />
              <input name="accentHex" defaultValue={church.brand_accent ?? '#a9802f'} aria-label="Accent colour hex" />
            </div>
          </div>
        </div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          The main colour is the background of a carousel slide; the accent is the headline rule, the
          scripture lower third on a clip, and the active dot.
        </p>

        <label htmlFor="aspect">Default clip size</label>
        <select id="aspect" name="aspect" defaultValue={church.default_aspect ?? '9:16'}>
          {Object.entries(ASPECTS).map(([key, a]) => (
            <option key={key} value={key}>{key} — {a.label}</option>
          ))}
        </select>

        <h3 style={{ margin: '22px 0 0' }}>Your accounts</h3>
        <p className="small muted" style={{ margin: '2px 0 0' }}>
          Used in captions and on exports. Connecting them for automatic posting is a separate step —
          see the note below.
        </p>
        {NETWORKS.map(n => (
          <div key={n}>
            <label htmlFor={`h-${n}`} style={{ textTransform: 'capitalize' }}>{n}</label>
            <input id={`h-${n}`} name={`handle_${n}`} defaultValue={handles[n] ?? ''} placeholder="@yourchurch" />
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <button className="primary">Save</button>
        </div>
      </form>

      <h2>Logo</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Square works best. It is placed in the top corner of every carousel slide.
      </p>
      <div className="card">
        {logo && (
          <img src={logo} alt={`${church.name} logo`} width={96} height={96}
               style={{ borderRadius: 10, background: 'var(--paper)', objectFit: 'contain', marginBottom: 10 }} />
        )}
        <UploadBox url={upload} accept="image/*" label="Choose a logo" />
      </div>

      <h2>Posting to your accounts</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Nothing here posts on its own yet, and that is a deliberate gap rather than an oversight.
        </p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Instagram and Facebook need Meta app review plus business verification; TikTok has a separate
          content-posting audit that forces every post private until it passes; YouTube caps uploads to
          roughly six a day across the whole app until a compliance audit lifts it. That is six to twelve
          weeks of review before one church can publish automatically. Until then, approve an item and use
          its download button.
        </p>
      </div>

      <p style={{ marginTop: 24 }}><a href="/">← Back to Sundays</a></p>
    </>
  );
}
