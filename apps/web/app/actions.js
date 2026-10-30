'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSermon, setItemStatus, scheduleItem, setWindow, generateKinds, retryIngest, deleteSermon, deleteFailedSermons, renderAspect, publishNow } from '../lib/data.js';
import { normalizeSourceUrl, checkSourceUrl } from '@bs/core/source-url.js';
import { saveBrand, NETWORKS, getChurch, startConnect, disconnectAccount } from '../lib/church.js';

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
    if (!resolved.ok) redirect(`/?problem=${encodeURIComponent(resolved.reason)}`);
    const reachable = await checkSourceUrl(resolved.url);
    if (!reachable.ok) redirect(`/?problem=${encodeURIComponent(reachable.reason)}`);
    sourceUrl = resolved.url;
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
  redirect(`/sermon/${sermon.id}`);
}

export async function setWindowAction(formData) {
  const id = String(formData.get('sermonId'));
  await setWindow(id, toSeconds(formData.get('startAt')), toSeconds(formData.get('endAt')));
  // Only redo what already exists: changing the window should not quietly
  // bill for deliverables this church never asked for.
  const existing = formData.getAll('existing').map(String);
  await generateKinds(id, existing.length ? existing : ['clip']);
  revalidatePath(`/sermon/${id}`);
}

export async function generateKindAction(formData) {
  const id = String(formData.get('sermonId'));
  const kind = String(formData.get('kind'));
  await generateKinds(id, [kind]);
  revalidatePath(`/sermon/${id}`);
}

export async function retryAction(formData) {
  const id = String(formData.get('sermonId'));
  await retryIngest(id);
  revalidatePath(`/sermon/${id}`);
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
    handles,
  });
  revalidatePath('/settings');
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

/** Where the network should send the volunteer back to. */
function appUrl() {
  return (process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/$/, '')
    || 'http://localhost:3000';
}

export async function deleteSermonAction(formData) {
  await deleteSermon(String(formData.get('sermonId')));
  // From a sermon page there is nowhere to stay; from the list, stay put.
  if (String(formData.get('stay') || '') === '1') return revalidatePath('/');
  redirect('/');
}

export async function deleteFailedAction() {
  await deleteFailedSermons();
  revalidatePath('/');
}

export async function makeAspectAction(formData) {
  await renderAspect(String(formData.get('itemId')), String(formData.get('aspect')));
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}

export async function approveAction(formData) {
  await setItemStatus(String(formData.get('id')), 'approved');
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}

export async function rejectAction(formData) {
  await setItemStatus(String(formData.get('id')), 'rejected', String(formData.get('reason') || ''));
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}

export async function scheduleAction(formData) {
  const when = String(formData.get('when') || '');
  const networks = formData.getAll('networks').map(String);
  await scheduleItem(String(formData.get('id')), when ? new Date(when) : null, networks);
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}

export async function publishNowAction(formData) {
  await publishNow(String(formData.get('id')));
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}
