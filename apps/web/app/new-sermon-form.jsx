'use client';

import { useState, useRef } from 'react';

/**
 * Paste a YouTube link and the form fills itself in.
 *
 * YouTube has no download method on any of its APIs — not for anyone, not
 * even for the channel that owns the video — so the file still has to come
 * from the person. What the link can legitimately give us is the title and
 * the channel, which is most of the typing, plus a direct link into YouTube
 * Studio where the owner can download their own original.
 */
export default function NewSermonForm({ sources, youtubeConnected, children }) {
  const [mode, setMode] = useState('upload');
  const [yt, setYt] = useState(null);
  const [looking, setLooking] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pulled, setPulled] = useState(null);
  const [pullError, setPullError] = useState(null);
  const captionsRef = useRef(null);
  const titleRef = useRef(null);
  const preacherRef = useRef(null);

  async function inspect(value) {
    const url = value.trim();
    setYt(null);
    if (!/youtu\.?be/.test(url)) return;

    setLooking(true);
    try {
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(url)}`);
      const meta = await res.json();
      if (!meta?.id) return;
      setYt(meta);
      // Only fill what the person has not typed themselves.
      if (meta.title && titleRef.current && !titleRef.current.value) titleRef.current.value = meta.title;
      if (meta.channel && preacherRef.current && !preacherRef.current.value) preacherRef.current.value = meta.channel;
    } catch { /* the form still works without it */ }
    finally { setLooking(false); }
  }

  /** Ask YouTube for the caption track on a video this church owns. */
  async function pullCaptions(url) {
    setPulling(true);
    setPullError(null);
    setPulled(null);
    try {
      const res = await fetch(`/api/captions?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!data.ok) { setPullError(data); return; }
      setMode('captions');
      setPulled(data.track ?? {});
      // The textarea is the form field, so the pulled track goes straight in.
      requestAnimationFrame(() => { if (captionsRef.current) captionsRef.current.value = data.srt; });
    } catch {
      setPullError({ reason: 'Could not reach YouTube just then. Try again.' });
    } finally {
      setPulling(false);
    }
  }

  return (
    <>
      <div className="row" style={{ gap: 16 }}>
        <label className="small" style={{ margin: 0 }}>
          <input type="radio" name="mode" value="upload" checked={mode === 'upload'}
                 onChange={() => setMode('upload')}
                 style={{ width: 'auto', minHeight: 0, marginRight: 6 }} />
          Upload the recording
        </label>
        <label className="small" style={{ margin: 0 }}>
          <input type="radio" name="mode" value="link" checked={mode === 'link'}
                 onChange={() => setMode('link')}
                 style={{ width: 'auto', minHeight: 0, marginRight: 6 }} />
          Use a link
        </label>
        <label className="small" style={{ margin: 0 }}>
          <input type="radio" name="mode" value="captions" checked={mode === 'captions'}
                 onChange={() => setMode('captions')}
                 style={{ width: 'auto', minHeight: 0, marginRight: 6 }} />
          Paste the captions
        </label>
      </div>

      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {mode === 'upload'
          ? 'Any video or audio file, any length. It goes straight to the processing server.'
          : mode === 'captions'
            ? 'No video needed. Everything except the clips, in under a minute, and it costs nothing to transcribe.'
            : `Links work for ${sources.join(', ')}.`}
      </p>

      <label htmlFor="sourceUrl">
        {mode === 'upload' ? 'YouTube link (optional — fills in the details below)' : 'Link to the video file'}
      </label>
      <input id="sourceUrl" name="sourceUrl" placeholder="https://..."
             onBlur={e => inspect(e.target.value)}
             onPaste={e => setTimeout(() => inspect(e.target.value), 0)} />

      {looking && <p className="small muted" style={{ margin: '6px 0 0' }}><span className="spinner" /> Reading that link…</p>}

      {yt?.id && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="primary" disabled={pulling}
                  onClick={() => pullCaptions(document.getElementById('sourceUrl').value)}>
            {pulling ? <><span className="spinner" /> Asking YouTube…</> : 'Pull the captions from this video'}
          </button>
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            {youtubeConnected
              ? 'Works on videos on your connected channel. No upload, and nothing to transcribe.'
              : 'Needs your YouTube account connected once, in Settings.'}
          </p>
        </div>
      )}

      {pulled && (
        <p className="small" style={{ color: 'var(--good)', margin: '8px 0 0' }}>
          Captions pulled{pulled.language ? ` (${pulled.language})` : ''}
          {pulled.asr ? ' — auto-generated, so check the names and verse references' : ''}. Ready below.
        </p>
      )}

      {pullError && (
        <div className="flag">
          {pullError.reason}
          {pullError.needsConnect && <> <a href="/settings">Connect YouTube in Settings</a>.</>}
        </div>
      )}

      {mode === 'captions' && (
        <>
          <label htmlFor="captions">Captions or transcript</label>
          <textarea id="captions" name="captions" rows={8} ref={captionsRef}
                    placeholder={'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nprayer is not just for needs\n\n…or an .srt, or just the plain text.'} />
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            {yt?.studioUrl ? (
              <>
                From <a href={yt.studioUrl} target="_blank" rel="noreferrer">this video in YouTube Studio</a>:
                {' '}Subtitles → the language → the three dots → <b>Download</b> → .srt or .vtt. Open it and paste it here.
              </>
            ) : (
              <>
                In YouTube Studio: Subtitles → the language → the three dots → <b>Download</b>. SRT, VTT
                or plain text all work. With timings you also get clip selections, ready to render as soon
                as you add the video.
              </>
            )}
          </p>
        </>
      )}

      {yt?.id && mode !== 'captions' && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {yt.thumbnail && (
              <img src={yt.thumbnail} alt="" width={120}
                   style={{ borderRadius: 8, flex: '0 0 auto' }} />
            )}
            <div>
              <b className="small">{yt.title || 'That video'}</b>
              {yt.channel && <div className="small muted">{yt.channel}</div>}
            </div>
          </div>
          <p className="small" style={{ marginBottom: 6 }}>
            Details filled in. YouTube will not hand a video file to any server — there is no download
            method in its API, even for the channel that owns the video. Two ways on from here:
          </p>
          <p className="small" style={{ margin: '0 0 6px' }}>
            <b>Fastest:</b> choose <b>Paste the captions</b> above. You get the points, carousels,
            write-ups, summary and devotional in under a minute, with no upload at all.
          </p>
          <p className="small" style={{ margin: '0 0 4px' }}><b>For clips, you need the file:</b></p>
          <ol className="small muted" style={{ margin: '0 0 8px', paddingLeft: 20 }}>
            <li>
              Open <a href={yt.studioUrl} target="_blank" rel="noreferrer">this video in YouTube Studio</a>
              {' '}(you need to own the channel).
            </li>
            <li>Three dots next to the video → <b>Download</b>.</li>
            <li>Choose <b>Upload the recording</b> above and pick that file.</li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>
            Streaming through Resi, BoxCast or OBS? The recording on your own machine is better quality
            than YouTube&rsquo;s copy anyway.
          </p>
        </div>
      )}

      {children}
    </>
  );
}
