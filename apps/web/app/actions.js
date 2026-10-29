'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSermon, setItemStatus, scheduleItem, setWindow, regenerate, retryIngest } from '../lib/data.js';

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
  const sourceUrl = String(formData.get('sourceUrl') || '').trim();
  const mode = String(formData.get('mode') || 'link');
  if (!title) return;
  if (mode === 'link' && !sourceUrl) return;

  const sermon = await createSermon({
    churchName: String(formData.get('churchName') || '').trim(),
    title,
    preacher: String(formData.get('preacher') || '').trim(),
    sourceUrl: mode === 'link' ? sourceUrl : null,
    startS: toSeconds(formData.get('startAt')),
    endS: toSeconds(formData.get('endAt')),
    upload: mode === 'upload',
  });
  redirect(`/sermon/${sermon.id}`);
}

export async function setWindowAction(formData) {
  const id = String(formData.get('sermonId'));
  await setWindow(id, toSeconds(formData.get('startAt')), toSeconds(formData.get('endAt')));
  await regenerate(id);
  revalidatePath(`/sermon/${id}`);
}

export async function regenerateAction(formData) {
  const id = String(formData.get('sermonId'));
  await regenerate(id);
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
