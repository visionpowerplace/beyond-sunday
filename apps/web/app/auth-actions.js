'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { sql } from '@bs/core/db.js';
import { createAccount, startSession, endSession, createResetToken, useResetToken, requireUser } from '../lib/auth.js';
import { hashPassword, verifyPassword } from '@bs/core/password.js';
import { send, resetEmail, canSend } from '../lib/mail.js';

const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const back = (path, message) => redirect(`${path}?problem=${encodeURIComponent(message)}`);

export async function signupAction(formData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const churchName = String(formData.get('churchName') || '').trim();

  if (!email.includes('@')) back('/signup', 'That does not look like an email address.');

  let user;
  try {
    user = await createAccount({ email, password, churchName, name: String(formData.get('name') || '') });
  } catch (err) {
    back('/signup', err.message);
  }
  await startSession(user.id);
  redirect('/sundays');
}

export async function loginAction(formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  const [user] = await sql`select * from users where email = ${email}`;
  // The same message either way: a different one tells a stranger which
  // addresses have accounts.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    back('/login', 'That email and password do not match.');
  }
  await startSession(user.id);
  redirect('/sundays');
}

export async function logoutAction() {
  await endSession();
  redirect('/');
}

export async function forgotAction(formData) {
  const email = String(formData.get('email') || '').trim();
  const token = await createResetToken(email);

  if (token) {
    const link = `${appUrl()}/reset?token=${token}`;
    const [row] = await sql`
      select c.name from users u left join churches c on c.id = u.church_id
      where u.email = ${email.toLowerCase()}`;
    const mail = resetEmail({ link, churchName: row?.name });
    await send({ to: email, ...mail });
    if (!canSend()) console.log(`[auth] reset link for ${email}: ${link}`);
  }
  // Always the same answer, whether or not the address exists.
  redirect('/forgot?sent=1');
}

export async function resetAction(formData) {
  const token = String(formData.get('token') || '');
  try {
    await useResetToken(token, String(formData.get('password') || ''));
  } catch (err) {
    redirect(`/reset?token=${encodeURIComponent(token)}&problem=${encodeURIComponent(err.message)}`);
  }
  redirect('/login?reset=1');
}

export async function changePasswordAction(formData) {
  const user = await requireUser();
  const current = String(formData.get('current') || '');
  if (!(await verifyPassword(current, user.password_hash))) {
    back('/settings', 'Your current password is not right.');
  }
  await sql`update users set password_hash = ${await hashPassword(String(formData.get('password') || ''))} where id = ${user.id}`;
  revalidatePath('/settings');
}
