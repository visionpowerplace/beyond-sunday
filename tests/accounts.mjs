import { sql, closeDb } from '../packages/core/src/db.js';
import { createAccount, createResetToken, useResetToken } from '../packages/core/src/accounts.js';
import { verifyPassword } from '../packages/core/src/password.js';
import { balance } from '../packages/core/src/billing.js';

const checks = [];
const c = (n, p, d='') => checks.push([n, p, d]);

const user = await createAccount({ email: 'Pastor@Example.org ', password: 'sunday-morning-1', churchName: 'Grace Chapel', name: 'Ben' });
c('signup lowercases the email', user.email === 'pastor@example.org');
const [church] = await sql`select * from churches where id = ${user.church_id}`;
c('it creates the church', church.name === 'Grace Chapel');
c('on a trial', church.plan === 'trial' && new Date(church.trial_ends_at) > new Date());
c('with sermons to spend', balance(church).total > 0);
const [led] = await sql`select * from credit_ledger where church_id = ${church.id}`;
c('and a ledger entry', led?.reason === 'free trial');

try { await createAccount({ email: 'pastor@example.org', password: 'another-one-here', churchName: 'X' }); c('duplicate email refused', false); }
catch (e) { c('duplicate email refused', /already an account/i.test(e.message)); }

try { await createAccount({ email: 'short@example.org', password: 'abc', churchName: 'X' }); c('short password refused', false); }
catch (e) { c('short password refused', /8 characters/.test(e.message)); }

// Reset
const token = await createResetToken('pastor@example.org');
c('reset token issued', Boolean(token));
c('unknown address gets no token', (await createResetToken('nobody@example.org')) === null);
await sql`insert into sessions (token, user_id, expires_at) values ('live-session', ${user.id}, now() + interval '1 day')`;
await useResetToken(token, 'a-brand-new-password');
const [after] = await sql`select password_hash from users where id = ${user.id}`;
c('password actually changed', await verifyPassword('a-brand-new-password', after.password_hash));
c('old password no longer works', !(await verifyPassword('sunday-morning-1', after.password_hash)));
const live = await sql`select 1 from sessions where user_id = ${user.id}`;
c('reset signs out everywhere', live.length === 0);
try { await useResetToken(token, 'yet-another-password'); c('a used token is dead', false); }
catch (e) { c('a used token is dead', /expired or has already been used/i.test(e.message)); }

for (const [n,p,d] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}${d ? '  — '+d : ''}`);
const failed = checks.filter(([,p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
