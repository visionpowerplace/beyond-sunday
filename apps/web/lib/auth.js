import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from '@bs/core/db.js';
import { hashPassword, verifyPassword } from '@bs/core/password.js';
import { createAccount, createResetToken, useResetToken } from '@bs/core/accounts.js';

export { hashPassword, verifyPassword, createAccount, createResetToken, useResetToken };

const COOKIE = 'bs_session';
const SESSION_DAYS = 30;

/* ---- sessions ---- */

export async function startSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await sql`insert into sessions (token, user_id, expires_at) values (${token}, ${userId}, ${expires})`;

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql`delete from sessions where token = ${token}`;
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Safe to call on a public page. */
export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const [row] = await sql`
    select u.*, s.expires_at from users u
    join sessions s on s.user_id = u.id
    where s.token = ${token} and s.expires_at > now()`;
  if (!row) return null;

  // Cheap liveness, at most once an hour, so the sessions list is useful.
  if (!row.last_seen_at || Date.now() - new Date(row.last_seen_at) > 36e5) {
    await sql`update users set last_seen_at = now() where id = ${row.id}`;
  }
  return row;
}

/** For a page that makes no sense without an account. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

/** The church this user works for, with its billing state. */
export async function currentChurch(user) {
  if (!user?.church_id) return null;
  const [church] = await sql`select * from churches where id = ${user.church_id}`;
  return church ?? null;
}
