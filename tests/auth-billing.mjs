/** Passwords, reset tokens and the sermon balance. */
import { sql, closeDb } from '../packages/core/src/db.js';
import { hashPassword, verifyPassword } from '../packages/core/src/password.js';
import { balance, canStartSermon, PLANS } from '../packages/core/src/billing.js';

const checks = [];
const check = (n, p, d = '') => checks.push([n, p, d]);

// Passwords
const hash = await hashPassword('correct horse battery');
check('right password verifies', await verifyPassword('correct horse battery', hash));
check('wrong password does not', !(await verifyPassword('correct horse batteries', hash)));
check('a second hash of the same password differs', hash !== (await hashPassword('correct horse battery')));
check('rubbish in the hash column is rejected', !(await verifyPassword('x', 'nonsense')));

// Balance
const trial = { plan: 'trial', trial_ends_at: new Date(Date.now() + 864e5), sermons_used: 0, extra_credits: 0 };
check('a fresh trial has its sermons', balance(trial).total === PLANS.trial.sermons);

const spent = { ...trial, sermons_used: PLANS.trial.sermons };
check('a spent trial has none', balance(spent).total === 0 && !canStartSermon(spent).ok);

const expired = { plan: 'trial', trial_ends_at: new Date(Date.now() - 864e5), sermons_used: 0, extra_credits: 0 };
check('an expired trial is refused', !canStartSermon(expired).ok, canStartSermon(expired).reason);
check('and says the trial ended', /trial has ended/i.test(canStartSermon(expired).reason));

const topped = { ...spent, extra_credits: 4 };
check('bought credits keep it going', canStartSermon(topped).ok && balance(topped).total === 4);

const church = { plan: 'church', sermons_used: 3, extra_credits: 2, period_started_at: new Date() };
const b = balance(church);
check('a plan counts allowance then credits', b.remainingIncluded === PLANS.church.sermons - 3 && b.total === PLANS.church.sermons - 3 + 2);
check('a full plan still reports a renewal date', b.renewsAt > new Date());

for (const [n, p, d] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`);
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
