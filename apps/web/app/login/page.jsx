import { loginAction } from '../auth-actions.js';
import { currentUser } from '../../lib/auth.js';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }) {
  if (await currentUser()) redirect('/sundays');
  const params = await searchParams;

  return (
    <div className="narrow">
      <h1>Sign in</h1>
      {params?.reset && <div className="card" style={{ borderColor: 'var(--good)' }}>Your password is changed. Sign in with it.</div>}
      {params?.problem && <div className="flag">{String(params.problem)}</div>}

      <form action={loginAction} className="card">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <div style={{ marginTop: 16 }}><button className="primary">Sign in</button></div>
      </form>

      <p className="small">
        <a href="/forgot">Forgotten your password?</a>
        <span className="muted"> · </span>
        <a href="/signup">Create an account</a>
      </p>
    </div>
  );
}
