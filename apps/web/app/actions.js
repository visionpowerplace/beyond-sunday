'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSermon, setItemStatus, scheduleItem, setWindow, generateKinds, retryIngest } from '../lib/data.js';
import { normalizeSourceUrl, checkSourceUrl } from '@bs/core/source-url.js';

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
  await scheduleItem(String(formData.get('id')), when ? new Date(when) : null, formData.getAll('networks').map(String));
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}
