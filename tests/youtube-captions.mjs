/**
 * Pulling captions: every refusal must come back as something a church can act
 * on, never as a stack trace.
 */
import { sql, closeDb } from '../packages/core/src/db.js';
import { pullCaptions } from '../apps/web/lib/google.js';
import { youtubeId } from '../packages/core/src/youtube-meta.js';
import { SCOPES } from '../packages/core/src/providers/youtube.js';

await sql`delete from churches where name = 'YT test'`;
const [church] = await sql`insert into churches (name) values ('YT test') returning *`;

const checks = [];
const c = (n, p, d = '') => checks.push([n, p, d]);

c('asks only for caption access', SCOPES.includes('https://www.googleapis.com/auth/youtube.force-ssl'));
c('does not ask to upload or manage videos',
  !SCOPES.some(s => /youtube\.upload|youtubepartner|youtube$/.test(s)), SCOPES.join(' '));

const notYouTube = await pullCaptions(church, 'https://vimeo.com/12345');
c('a non-YouTube link is refused clearly', !notYouTube.ok && /not a YouTube link/i.test(notYouTube.reason));

const notConnected = await pullCaptions(church, 'https://youtu.be/qEje_VAed1Y');
c('an unconnected church is told to connect', !notConnected.ok && notConnected.needsConnect === true);
c('and told what to do', /Connect your YouTube/i.test(notConnected.reason), notConnected.reason);

// A token that Google rejects, or a network that is simply down, must come
// back as a message rather than a crash. Crucially a transient failure must
// NOT disconnect the church: only Google actually revoking it should.
await sql`update churches set google_refresh_token = 'definitely-not-valid' where id = ${church.id}`;
const [withToken] = await sql`select * from churches where id = ${church.id}`;
const bad = await pullCaptions(withToken, 'https://youtu.be/qEje_VAed1Y');
c('a failing token does not throw', bad && bad.ok === false, bad?.reason ?? '');

const [after] = await sql`select google_refresh_token from churches where id = ${church.id}`;
const revoked = bad.needsConnect === true;
c(revoked ? 'a revoked token is cleared' : 'a transient failure keeps the connection',
  revoked ? after.google_refresh_token === null : after.google_refresh_token !== null);

c('ids parse from every YouTube shape',
  youtubeId('https://www.youtube.com/watch?v=abc12345678') === 'abc12345678'
  && youtubeId('https://youtu.be/abc12345678') === 'abc12345678'
  && youtubeId('https://www.youtube.com/live/abc12345678') === 'abc12345678');

for (const [n, p, d] of checks) console.log(`  ${p ? 'ok  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`);
await sql`delete from churches where id = ${church.id}`;
const failed = checks.filter(([, p]) => !p).length;
console.log(failed ? `\n${failed} FAILED` : '\nPASS');
await closeDb();
process.exit(failed ? 1 : 0);
