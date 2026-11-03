'use client';

import { useState } from 'react';

/**
 * Two ways in, and both of them work.
 *
 * There were four. Pasting a link asked a server to fetch the video, which
 * YouTube refuses and most church platforms gate behind a session, so it
 * failed far more often than it worked. A sermon feed only ever helped the
 * churches whose platform publishes one. Both are gone from the form rather
 * than left there to waste a Sunday morning. The code behind them is still in
 * the repo and can come back once it earns its place.
 *
 * What is left: upload the file, which always works and is the only route to
 * clips, or paste the transcript, which needs no video at all.
 */
export default function NewSermonForm({ children }) {
  const [mode, setMode] = useState('upload');

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
          <input type="radio" name="mode" value="captions" checked={mode === 'captions'}
                 onChange={() => setMode('captions')}
                 style={{ width: 'auto', minHeight: 0, marginRight: 6 }} />
          Paste the transcript
        </label>
      </div>

      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {mode === 'upload'
          ? 'Any video or audio file, any length. It goes straight to the processing server. This is the only route that gives you clips.'
          : 'No video needed, and nothing to transcribe, so this takes under a minute.'}
      </p>

      {mode === 'captions' && (
        <p className="note-warn">
          <b>This cannot make video clips.</b> A clip has to be cut out of the recording,
          and a transcript is only the words. You still get highlight points, carousels,
          write-ups, a summary and the five-day devotional. For clips, upload the
          recording instead.
        </p>
      )}

      {mode === 'upload' && (
        <details className="guide">
          <summary>Where do I get the video file?</summary>
          <p className="small">
            If the sermon streamed through Resi, BoxCast, OBS or a camera, the recording on
            your own machine is the best copy you have. Use that.
          </p>
          <p className="small"><b>If it only exists on YouTube,</b> and the channel is yours:</p>
          <ol className="small muted">
            <li>Open <a href="https://studio.youtube.com" target="_blank" rel="noreferrer">YouTube Studio</a> and sign in as the channel.</li>
            <li>Go to <b>Content</b> and find the service.</li>
            <li>Hover the row, open the three dots at the end of it, and choose <b>Download</b>.</li>
            <li>Come back here and pick that file.</li>
          </ol>
          <p className="small muted">
            A long service is a large file, so give it a few minutes. You can trim it to the
            preaching below, or leave the times blank and let it find the preaching for you.
          </p>
          <p className="small muted">
            Only the channel owner can download, and only through Studio. YouTube has no
            download in any of its APIs, for anyone, so nothing here can fetch it for you.
          </p>
        </details>
      )}

      {mode === 'captions' && (
        <>
          <label htmlFor="captions">Transcript</label>
          <textarea id="captions" name="captions" rows={8}
                    placeholder={'Paste the whole transcript here.\n\nPlain text is fine. So is an .srt or a .vtt file, and those also give you clip selections once you add the video.'} />

          <details className="guide" open>
            <summary>Where do I get the transcript?</summary>
            <p className="small"><b>From YouTube, without owning the channel:</b></p>
            <ol className="small muted">
              <li>Open the video on YouTube.</li>
              <li>Under the video, open <b>…more</b> in the description.</li>
              <li>Click <b>Show transcript</b>.</li>
              <li>Select the whole panel, copy it, and paste it here.</li>
            </ol>
            <p className="small"><b>From YouTube Studio, if the channel is yours:</b></p>
            <ol className="small muted">
              <li>Open the video in <a href="https://studio.youtube.com" target="_blank" rel="noreferrer">YouTube Studio</a>.</li>
              <li>Go to <b>Subtitles</b>, then the language.</li>
              <li>Open the three dots and choose <b>Download</b>.</li>
              <li>Open the file and paste what is in it.</li>
            </ol>
            <p className="small muted">
              A .srt or .vtt carries timings, so you also get clip selections, ready to render
              the moment you add the video. Plain text gives you everything except the clips.
            </p>
            <p className="small muted">
              Auto captions have no punctuation and spell names their own way. They still work,
              but read the result before you post it.
            </p>
          </details>
        </>
      )}

      {children}
    </>
  );
}
