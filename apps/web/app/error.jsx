'use client';

/**
 * Anything that throws on the server lands here.
 *
 * The default is "Application error: a server-side exception has occurred",
 * which tells a church volunteer nothing and reads like the product is
 * broken. This at least says what to do next and keeps the digest, which is
 * what the logs are searchable by.
 */
export default function Error({ error, reset }) {
  return (
    <div className="narrow" style={{ marginTop: 48 }}>
      <h1>That did not work</h1>
      <p className="sub">
        Something went wrong on our side. Nothing you were working on has been lost.
      </p>
      <div className="card">
        <div className="row">
          <button className="primary" onClick={() => reset()}>Try again</button>
          <a className="btn" href="/sundays">Back to Sundays</a>
        </div>
        {error?.digest && (
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            If it keeps happening, quote this: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
