import { signupAction } from '../auth-actions.js';
import { currentUser } from '../../lib/auth.js';
import { PLANS } from '@bs/core/billing.js';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function Signup({ searchParams }) {
  if (await currentUser()) redirect('/sundays');
  const params = await searchParams;
  const trial = PLANS.trial;

  return (
    <div className="narrow">
      <h1>Start your free trial</h1>
      <p className="sub">
        {trial.sermons} sermons, everything switched on, {trial.days} days. No card.
      </p>
      {params?.problem && <div className="flag">{String(params.problem)}</div>}

      <form action={signupAction} className="card">
        <label htmlFor="churchName">Church name</label>
        <input id="churchName" name="churchName" placeholder="The Empowerment Center" required autoFocus />
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        <p className="small muted" style={{ margin: '4px 0 0' }}>At least 8 characters.</p>
        <div style={{ marginTop: 16 }}><button className="primary">Create the account</button></div>
      </form>

      <p className="small"><a href="/login">Already have an account?</a></p>
    </div>
  );
}
