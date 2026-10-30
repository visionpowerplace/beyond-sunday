import { randomBytes } from 'node:crypto';
import { sql } from './db.js';
import { hashPassword } from './password.js';
import { PLANS } from './billing.js';

/**
 * Accounts, with no web framework in sight, so the rules can be tested
 * without booting a server.
 */

export async function createAccount({ email, password, churchName, name }) {
  const clean = String(email).trim().toLowerCase();
  if (!clean.includes('@')) throw new Error('That does not look like an email address.');
  if (String(password).length < 8) throw new Error('Use at least 8 characters for the password.');

  const [existing] = await sql`select id from users where email = ${clean}`;
  if (existing) throw new Error('There is already an account with that email. Try signing in.');

  const trialEnds = new Date(Date.now() + PLANS.trial.days * 864e5);
  const passwordHash = await hashPassword(password);

  return sql.begin(async tx => {
    const [church] = await tx`
      insert into churches (name, plan, trial_ends_at, period_started_at)
      values (${churchName?.trim() || 'My church'}, 'trial', ${trialEnds}, now())
      returning *`;
    const [user] = await tx`
      insert into users (email, password_hash, name, church_id)
      values (${clean}, ${passwordHash}, ${name?.trim() || null}, ${church.id})
      returning *`;
    await tx`
      insert into credit_ledger (church_id, delta, reason)
      values (${church.id}, ${PLANS.trial.sermons}, 'free trial')`;
    return user;
  });
}

/** Null when there is no such address: the caller must not reveal which. */
export async function createResetToken(email) {
  const [user] = await sql`select id from users where email = ${String(email).trim().toLowerCase()}`;
  if (!user) return null;
  const token = randomBytes(32).toString('base64url');
  await sql`
    insert into password_resets (token, user_id, expires_at)
    values (${token}, ${user.id}, ${new Date(Date.now() + 3600_000)})`;
  return token;
}

export async function useResetToken(token, newPassword) {
  const [row] = await sql`
    select * from password_resets
    where token = ${token} and used_at is null and expires_at > now()`;
  if (!row) throw new Error('That reset link has expired or has already been used. Ask for a new one.');
  if (String(newPassword).length < 8) throw new Error('Use at least 8 characters for the password.');

  const passwordHash = await hashPassword(newPassword);
  await sql.begin(async tx => {
    await tx`update users set password_hash = ${passwordHash} where id = ${row.user_id}`;
    await tx`update password_resets set used_at = now() where token = ${token}`;
    // Signing out everywhere is the point of a reset.
    await tx`delete from sessions where user_id = ${row.user_id}`;
  });
}
