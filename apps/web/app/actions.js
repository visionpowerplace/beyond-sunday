'use server';

import { revalidatePath } from 'next/cache';
import { createSermon, setItemStatus, scheduleItem } from '../lib/data.js';
import { redirect } from 'next/navigation';

export async function newSermonAction(formData) {
  const sourceUrl = String(formData.get('sourceUrl') || '').trim();
  const title = String(formData.get('title') || '').trim();
  if (!sourceUrl || !title) return;
  const sermon = await createSermon({
    churchName: String(formData.get('churchName') || '').trim(),
    title,
    preacher: String(formData.get('preacher') || '').trim(),
    sourceUrl,
  });
  redirect(`/sermon/${sermon.id}`);
}

export async function approveAction(formData) {
  const id = String(formData.get('id'));
  await setItemStatus(id, 'approved');
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}

export async function rejectAction(formData) {
  const id = String(formData.get('id'));
  await setItemStatus(id, 'rejected', String(formData.get('reason') || ''));
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}

export async function scheduleAction(formData) {
  const id = String(formData.get('id'));
  const when = String(formData.get('when') || '');
  const networks = formData.getAll('networks').map(String);
  await scheduleItem(id, when ? new Date(when) : null, networks);
  revalidatePath(`/sermon/${formData.get('sermonId')}`);
}
