'use client';

import { useFormStatus } from 'react-dom';

/**
 * The button says what it is doing while it does it.
 *
 * Without this the page looked unchanged after a click, so people pressed the
 * same button again — four carousel jobs for one sermon, and three of them
 * wasted.
 */
export default function AddButton({ label }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending}>
      {pending ? <><span className="spinner" aria-hidden="true" /> Starting…</> : label}
    </button>
  );
}
