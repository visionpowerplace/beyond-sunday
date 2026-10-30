import { forgotAction } from '../auth-actions.js';

export const dynamic = 'force-dynamic';

export default async function Forgot({ searchParams }) {
  const params = await searchParams;

  return (
    <div className="narrow">
      <h1>Reset your password</h1>
      {params?.sent ? (
        <>
          <div className="card">
            <p style={{ marginTop: 0 }}>If there is an account with that address, a reset link is on its way.</p>
            <p className="small muted" style={{ marginBottom: 0 }}>
              It works for one hour. Check the spam folder if it does not appear.
            </p>
          </div>
          <p className="small"><a href="/login">Back to sign in</a></p>
        </>
      ) : (
        <>
          <p className="sub">We will email you a link to choose a new one.</p>
          <form action={forgotAction} className="card">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            <div style={{ marginTop: 16 }}><button className="primary">Send the link</button></div>
          </form>
          <p className="small"><a href="/login">Back to sign in</a></p>
        </>
      )}
    </div>
  );
}
