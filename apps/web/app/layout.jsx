import './globals.css';
import { currentUser, currentChurch } from '../lib/auth.js';
import { logoutAction } from './auth-actions.js';

export const metadata = {
  title: 'Beyond Sunday',
  description: 'One sermon in, a week of content out — reviewed before anything goes public.',
};

export default async function RootLayout({ children }) {
  const user = await currentUser();
  const church = user ? await currentChurch(user) : null;

  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap bar">
            <a href={user ? '/sundays' : '/'} className="brand">Beyond <span>Sunday</span></a>

            <nav className="bar-nav">
              {user ? (
                <>
                  <a href="/sundays">Sundays</a>
                  <a href="/billing">Plan</a>
                  <a href="/settings">Settings</a>
                  <form action={logoutAction}>
                    <button className="linkish">Sign out</button>
                  </form>
                </>
              ) : (
                <>
                  <a href="/pricing">Pricing</a>
                  <a href="/login">Sign in</a>
                  <a className="btn primary small-btn" href="/signup">Start free</a>
                </>
              )}
            </nav>
          </div>
          {church?.plan === 'trial' && (
            <div className="trialbar">
              <div className="wrap small">
                Free trial{church.trial_ends_at ? ` — ends ${new Date(church.trial_ends_at).toLocaleDateString()}` : ''}.
                {' '}<a href="/billing">See plans</a>
              </div>
            </div>
          )}
        </header>
        <main className="wrap">{children}</main>
        <footer className="foot">
          <div className="wrap small muted">
            Beyond Sunday · the editing desk for church media
          </div>
        </footer>
      </body>
    </html>
  );
}
