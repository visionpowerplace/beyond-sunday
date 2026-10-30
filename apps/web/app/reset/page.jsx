import { resetAction } from '../auth-actions.js';

export const dynamic = 'force-dynamic';

export default async function Reset({ searchParams }) {
  const params = await searchParams;
  const token = String(params?.token || '');

  if (!token) {
    return (
      <div className="narrow">
        <h1>Reset your password</h1>
        <div className="flag">That link is incomplete. Ask for a new one.</div>
        <p className="small"><a href="/forgot">Send another link</a></p>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>Choose a new password</h1>
      {params?.problem && <div className="flag">{String(params.problem)}</div>}
      <form action={resetAction} className="card">
        <input type="hidden" name="token" value={token} />
        <label htmlFor="password">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
        <p className="small muted" style={{ margin: '4px 0 0' }}>
          At least 8 characters. Setting it signs you out everywhere else.
        </p>
        <div style={{ marginTop: 16 }}><button className="primary">Set the password</button></div>
      </form>
    </div>
  );
}
