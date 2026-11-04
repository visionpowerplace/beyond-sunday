/**
 * A person has one church, and every sermon belongs to it.
 *
 * Sermons used to pick a church by matching the name typed on the form.
 * Typing a different church, or fixing a typo, forked a second church: the
 * sermons went there while the connected accounts, branding and credits
 * stayed behind. An approved clip then offered "Connect an account" on a
 * church that had two connected.
 */
import assert from 'node:assert/strict';
import { sql, closeDb } from '../packages/core/src/db.js';
import { churchForUser } from '../apps/web/lib/data.js';

const email = `one-church-${Date.now()}@example.com`;
const [user] = await sql`
  insert into users (email, password_hash) values (${email}, 'x') returning *`;

// First sermon creates the church and ties the person to it.
const first = await churchForUser(user, 'Grace Chapel');
assert.equal(first.name, 'Grace Chapel');
assert.equal(first.owner_user_id, user.id, 'the church knows who owns it');

const [linked] = await sql`select church_id from users where id = ${user.id}`;
assert.equal(linked.church_id, first.id, 'and the person is tied to it');

// Pretend the accounts were connected on it.
await sql`update churches set zernio_profile_id = 'profile-123' where id = ${first.id}`;
const withUser = { ...user, church_id: first.id };

// A different name RENAMES. It must not make a second church.
const renamed = await churchForUser(withUser, 'The Empowerment Center');
assert.equal(renamed.id, first.id, 'same church, not a new one');
assert.equal(renamed.name, 'The Empowerment Center', 'renamed');
assert.equal(renamed.zernio_profile_id, 'profile-123', 'accounts survive the rename');

// The same name again changes nothing.
const again = await churchForUser(withUser, 'The Empowerment Center');
assert.equal(again.id, first.id);

// An empty name keeps the one they have rather than inventing "My church".
const blank = await churchForUser(withUser, '');
assert.equal(blank.id, first.id);
assert.equal(blank.name, 'The Empowerment Center');

const [{ n: howMany }] = await sql`
  select count(*)::int as n from churches where owner_user_id = ${user.id}`;
assert.equal(howMany, 1, 'exactly one church for this person, whatever was typed');

// Two people typing the same church name must not land on one another's
// church: the old lookup matched the name across the whole table.
const [other] = await sql`
  insert into users (email, password_hash) values (${`other-${Date.now()}@example.com`}, 'x') returning *`;
const theirs = await churchForUser(other, 'The Empowerment Center');
assert.notEqual(theirs.id, first.id, 'a shared name does not share a church');
assert.equal(theirs.zernio_profile_id, null, "and does not inherit anyone's accounts");

await sql`delete from churches where owner_user_id in (${user.id}, ${other.id})`;
await sql`delete from users where id in (${user.id}, ${other.id})`;

console.log('one-church: ok — renames instead of forking, and names are not shared');
await closeDb();
