'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSermon, setItemStatus, scheduleItem, setWindow, generateKinds, retryIngest, deleteSermon, deleteFailedSermons, renderAspect, publishNow, createSermonFromCaptions } from '../lib/data.js';
import { normalizeSourceUrl, checkSourceUrl } from '@bs/core/source-url.js';
import { saveBrand, NETWORKS, getChurch, startConnect, disconnectAccount } from '../lib/church.js';
import { requireUser, currentChurch } from '../lib/auth.js';
import { PLANS, CREDIT_PACKS, canStartSermon } from '@bs/core/billing.js';
import { sql } from '@bs/core/db.js';

// "12:30" or "750" or blank -> seconds or null. Churches think in mm:ss.
function toSeconds(raw) {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const parts = v.split(':').map(Number);
  if (parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

export async function newSermonAction(formData) {
  const title = String(formData.get('title') || '').trim();
  const rawUrl = String(formData.get('sourceUrl') || '').trim();
  const mode = String(formData.get('mode') || 'link');
  if (!title) return;
  if (mode === 'link' && !rawUrl) return;

  // Resolve and test the link here, so a bad one fails in two seconds instead
  // of five minutes into the pipeline.
  let sourceUrl = null;
  if (mode === 'link') {
    const resolved = normalizeSourceUrl(rawUrl);
    if (!resolved.ok) redirect(`/sundays?problem=${encodeURIComponent(resolved.reason)}`);
    const reachable = await checkSourceUrl(resolved.url);
    if (!reachable.ok) redirect(`/sundays?problem=${encodeURIComponent(reachable.reason)}`);
    sourceUrl = resolved.url;
  }

  const user = await requireUser();
  const church = await currentChurch(user);
  const allowed = canStartSermon(church);
  if (!allowed.ok) redirect(`/sundays?problem=${encodeURIComponent(allowed.reason)}`);

  // A caption file means no download and no transcription at all.
  if (mode === 'captions') {
    const captions = String(formData.get('captions') || '').trim();
    if (!captions) redirect('/sundays?problem=Paste+the+captions+first.');
    let made;
    try {
      made = await createSermonFromCaptions({
        churchName: String(formData.get('churchName') || '').trim(),
        title, preacher: String(formData.get('preacher') || '').trim(),
        captions, sourceUrl: rawUrl || null,
      });
    } catch (err) {
      redirect(`/sundays?problem=${encodeURIComponent(err.message)}`);
    }
    await spendSermon(church, made.id);
    redirect(`/sundays/sermon/${made.id}`);
  }

  const sermon = await createSermon({
    churchName: String(formData.get('churchName') || '').trim(),
    title,
    preacher: String(formData.get('preacher') || '').trim(),
    sourceUrl,
    startS: toSeconds(formData.get('startAt')),
    endS: toSeconds(formData.get('endAt')),
    upload: mode === 'upload',
  });
  await spendSermon(church, sermon.id);
  redirect(`/sundays/sermon/${sermon.id}`);
}

export async function setWindowAction(formData) {
  const id = String(formData.get('sermonId'));
  await setWindow(id, toSeconds(formData.get('startAt')), toSeconds(formData.get('endAt')));
  // Only redo what already exists: changing the window should not quietly
  // bill for deliverables this church never asked for.
  const existing = formData.getAll('existing').map(String);
  await generateKinds(id, existing.length ? existing : ['clip']);
  revalidatePath(`/sundays/sermon/${id}`);
}

export async function generateKindAction(formData) {
  const id = String(formData.get('sermonId'));
  const kind = String(formData.get('kind'));
  await generateKinds(id, [kind]);
  revalidatePath(`/sundays/sermon/${id}`);
}

export async function retryAction(formData) {
  const id = String(formData.get('sermonId'));
  await retryIngest(id);
  revalidatePath(`/sundays/sermon/${id}`);
}

export async function saveBrandAction(formData) {
  const id = String(formData.get('churchId'));
  const handles = {};
  for (const n of NETWORKS) {
    const v = String(formData.get(`handle_${n}`) || '').trim();
    if (v) handles[n] = v;
  }
  await saveBrand(id, {
    name: String(formData.get('name') || '').trim(),
    // The text box wins over the swatch: someone pasting a brand hex means it.
    primary: String(formData.get('primaryHex') || formData.get('primary') || '').trim(),
    accent: String(formData.get('accentHex') || formData.get('accent') || '').trim(),
    aspect: String(formData.get('aspect') || ''),
    imageProvider: String(formData.get('imageProvider') || ''),
    handles,
  });
  revalidatePath('/settings');
}

export async function choosePlanAction(formData) {
  const user = await requireUser();
  const church = await currentChurch(user);
  const plan = PLANS[String(formData.get('plan'))];
  if (!plan || plan.key === 'trial') redirect('/billing?problem=That+plan+cannot+be+chosen.');

  // Changing plan starts a fresh period, so nobody loses an allowance they
  // just paid for or keeps one they moved off.
  await sql`
    update churches set plan = ${plan.key}, period_started_at = now(), sermons_used = 0,
      trial_ends_at = null
    where id = ${church.id}`;
  await sql`
    insert into credit_ledger (church_id, delta, reason)
    values (${church.id}, 0, ${`moved to the ${plan.name} plan`})`;
  redirect(`/billing?done=${encodeURIComponent(`You are on the ${plan.name} plan.`)}`);
}

export async function addCreditsAction(formData) {
  const user = await requireUser();
  const church = await currentChurch(user);
  const pack = CREDIT_PACKS.find(p => p.key === String(formData.get('pack')));
  if (!pack) redirect('/billing?problem=Unknown+pack.');

  // Checkout is not wired, so this grants the credits and records that it was
  // not paid for. When a provider is connected this is the line that changes.
  await sql`update churches set extra_credits = extra_credits + ${pack.sermons} where id = ${church.id}`;
  await sql`
    insert into credit_ledger (church_id, delta, reason)
    values (${church.id}, ${pack.sermons}, ${`added ${pack.sermons} sermons (no charge — checkout not connected)`})`;
  redirect(`/billing?done=${encodeURIComponent(`${pack.sermons} sermons added.`)}`);
}

export async function connectAccountAction(formData) {
  const church = await getChurch(String(formData.get('churchId')));
  const platform = String(formData.get('platform'));
  let url;
  try {
    url = await startConnect(church, platform, `${appUrl()}/settings?church=${church.id}`);
  } catch (err) {
    redirect(`/settings?church=${church.id}&error=connect&error_message=${encodeURIComponent(err.message)}`);
  }
  // The network's own sign-in page; nothing of ours sees the password.
  redirect(url);
}

export async function disconnectAccountAction(formData) {
  try {
    await disconnectAccount(String(formData.get('accountId')));
  } catch { /* already gone is fine */ }
  revalidatePath('/settings');
}

/**
 * Take one sermon off the balance: the month's allowance first, then bought
 * credits, so nobody burns a purchase while an included one sits unused.
 */
async function spendSermon(church, sermonId) {
  const used = church.sermons_used ?? 0;
  const included = PLANS[church.plan]?.sermons ?? 0;

  if (used < included) {
    await sql`update churches set sermons_used = sermons_used + 1 where id = ${church.id}`;
  } else {
    await sql`update churches set extra_credits = greatest(0, extra_credits - 1) where id = ${church.id}`;
  }
  await sql`
    insert into credit_ledger (church_id, delta, reason, sermon_id)
    values (${church.id}, -1, 'sermon processed', ${sermonId})`;
  await sql`update sermons set charged = true where id = ${sermonId}`;
}

/** Where the network should send the volunteer back to. */
function appUrl() {
  return (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '')
    || 'http://localhost:3000';
}

export async function deleteSermonAction(formData) {
  // A delete that cannot be queued is not worth an error page: the sermon is
  // on its way out either way, and the list will show the truth.
  try {
    await deleteSermon(String(formData.get('sermonId')));
  } catch (err) {
    console.error('[delete]', err.message);
  }
  // From a sermon page there is nowhere to stay; from the list, stay put.
  if (String(formData.get('stay') || '') === '1') return revalidatePath('/sundays');
  redirect('/sundays');
}

export async function deleteFailedAction() {
  try {
    await deleteFailedSermons();
  } catch (err) {
    console.error('[delete failed sermons]', err.message);
  }
  revalidatePath('/sundays');
}

export async function makeAspectAction(formData) {
  await renderAspect(String(formData.get('itemId')), String(formData.get('aspect')));
  revalidatePath(`/sundays/sermon/${formData.get('sermonId')}`);
}

export async function approveAction(formData) {
  await setItemStatus(String(formData.get('id')), 'approved');
  revalidatePath(`/sundays/sermon/${formData.get('sermonId')}`);
}

export async function rejectAction(formData) {
  await setItemStatus(String(formData.get('id')), 'rejected', String(formData.get('reason') || ''));
  revalidatePath(`/sundays/sermon/${formData.get('sermonId')}`);
}

export async function scheduleAction(formData) {
  const when = String(formData.get('when') || '');
  const networks = formData.getAll('networks').map(String);
  await scheduleItem(String(formData.get('id')), when ? new Date(when) : null, networks);
  revalidatePath(`/sundays/sermon/${formData.get('sermonId')}`);
}

export async function publishNowAction(formData) {
  await publishNow(String(formData.get('id')));
  revalidatePath(`/sundays/sermon/${formData.get('sermonId')}`);
}
