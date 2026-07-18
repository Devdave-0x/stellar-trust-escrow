'use client';

import { useState, type FormEvent } from 'react';
import { cn } from '../../lib/utils';

export interface DisputeEvidence {
  id: string;
  name: string;
  size: string;
}

export interface DisputeFormValues {
  reason: string;
  evidence: DisputeEvidence[];
}

interface DisputeFormProps {
  escrowId?: string;
  initialEvidence?: DisputeEvidence[];
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit?: (values: DisputeFormValues) => void;
}

/**
 * Form used to raise a dispute against an escrow. Includes an accessible,
 * labelled reason textarea, an evidence list, and an error summary region.
 */
export default function DisputeForm({
  escrowId,
  initialEvidence = [],
  isSubmitting = false,
  submitError = null,
  onSubmit,
}: DisputeFormProps) {
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<DisputeEvidence[]>(initialEvidence);
  const [touched, setTouched] = useState(false);

  const reasonId = 'dispute-reason';
  const errorId = 'dispute-error';
  const invalid = touched && reason.trim().length === 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (reason.trim().length === 0 || isSubmitting) return;
    onSubmit?.({ reason, evidence });
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={submitError ? errorId : undefined}
      className="w-full max-w-lg space-y-4 rounded-xl border border-gray-700 bg-gray-800/60 p-5"
    >
      {escrowId && (
        <p className="text-xs text-gray-400">
          Disputing escrow <span className="font-mono text-gray-300">{escrowId}</span>
        </p>
      )}

      {submitError && (
        <div
          id={errorId}
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-300"
        >
          {submitError}
        </div>
      )}

      <div>
        <label htmlFor={reasonId} className="mb-1 block text-sm font-medium text-gray-200">
          Reason for dispute
        </label>
        <textarea
          id={reasonId}
          name="reason"
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${reasonId}-error` : undefined}
          placeholder="Describe what went wrong…"
          className={cn(
            'w-full rounded-lg border bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
            invalid ? 'border-red-600' : 'border-gray-700',
          )}
        />
        {invalid && (
          <p id={`${reasonId}-error`} className="mt-1 text-xs text-red-400">
            A reason is required to submit a dispute.
          </p>
        )}
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-200">Evidence</span>
        {evidence.length === 0 ? (
          <p className="text-xs text-gray-500">No evidence attached.</p>
        ) : (
          <ul className="space-y-1">
            {evidence.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-md bg-gray-900 px-3 py-1.5 text-xs text-gray-300"
              >
                <span className="truncate">{item.name}</span>
                <span className="ml-2 text-gray-500">{item.size}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting…' : 'Submit dispute'}
      </button>
    </form>
  );
}
