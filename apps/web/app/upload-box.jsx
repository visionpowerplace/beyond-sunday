'use client';

import { useState } from 'react';

/**
 * Uploads straight to the worker, not through this app.
 *
 * XMLHttpRequest rather than fetch for one reason: it reports progress, and a
 * 1.5GB service recording on church wifi takes long enough that a progress bar
 * is the difference between waiting and reloading the page.
 */
export default function UploadBox({ url }) {
  const [pct, setPct] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  function send(file) {
    if (!file) return;
    setError(null);
    setPct(0);

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = e => e.lengthComputable && setPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { setDone(true); setTimeout(() => location.reload(), 800); }
      else { setError(safeError(xhr.responseText) ?? `Upload failed (${xhr.status})`); setPct(null); }
    };
    xhr.onerror = () => { setError('The upload could not reach the server. Check the connection and try again.'); setPct(null); };
    xhr.send(file);
  }

  if (done) return <p className="small" style={{ color: 'var(--good)' }}>Uploaded. Starting the pipeline…</p>;

  return (
    <div>
      <label htmlFor="file">Choose the recording</label>
      <input id="file" type="file" accept="video/*,audio/*" disabled={pct !== null}
             onChange={e => send(e.target.files?.[0])} />
      {pct !== null && (
        <>
          <div style={{ height: 8, background: 'var(--line)', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--gold)', transition: 'width .2s' }} />
          </div>
          <p className="small muted">{pct}% — keep this tab open.</p>
        </>
      )}
      {error && <span className="flag">{error}</span>}
    </div>
  );
}

function safeError(text) {
  try { return JSON.parse(text).error; } catch { return null; }
}
