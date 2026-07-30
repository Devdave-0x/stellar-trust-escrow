'use client';

/**
 * DisputeForm
 *
 * Standalone dispute submission form with drag-and-drop evidence upload.
 * Covers the full dispute lifecycle: reason selection, description, evidence
 * files, and submission confirmation.
 *
 * Closes #28 — dispute submission form with drag-and-drop file upload
 *
 * @param {object}    props
 * @param {string|number} props.escrowId
 * @param {Function}  [props.onSuccess]   — called with { disputeId } on success
 * @param {Function}  [props.onCancel]
 * @param {string}    [props.className]
 * @param {string}    [props.originalTerms]  — terms as originally agreed, for the terms diff
 * @param {string}    [props.proposedTerms]  — terms as amended/disputed, for the terms diff
 */

import { useState, useCallback } from 'react';
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import FileDropZone from '../ui/FileDropZone';
import TermsDiff from './TermsDiff';
import { useToast } from '../../contexts/ToastContext';

const DISPUTE_REASONS = [
  { value: 'non_delivery',       label: 'Work not delivered' },
  { value: 'quality_issue',      label: 'Quality below agreed standard' },
  { value: 'scope_disagreement', label: 'Scope / requirements dispute' },
  { value: 'payment_issue',      label: 'Payment or milestone dispute' },
  { value: 'communication',      label: 'Communication breakdown' },
  { value: 'other',              label: 'Other' },
];

const MAX_DESCRIPTION = 2000;

export default function DisputeForm({
  escrowId,
  onSuccess,
  onCancel,
  className = '',
  originalTerms,
  proposedTerms,
}) {
  const [reason, setReason]           = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles]             = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors]  = useState({});
  const { showToast } = useToast();

  const validate = () => {
    const errs = {};
    if (!reason)                         errs.reason = 'Please select a reason.';
    if (description.trim().length < 20)  errs.description = 'Please describe the issue (min 20 characters).';
    return errs;
  };

  const handleFilesAccepted = useCallback((accepted) => {
    setFiles((prev) => [...prev, ...accepted]);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    setIsSubmitting(true);
    try {
      const body = new FormData();
      body.append('escrowId', String(escrowId));
      body.append('reason', reason);
      body.append('description', description.trim());
      files.forEach((f) => body.append('evidence', f));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/disputes`,
        { method: 'POST', body },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `Server error ${res.status}`);
      }

      const data = await res.json();
      showToast('Dispute submitted successfully. A mediator will review within 48 hours.', 'success');
      onSuccess?.(data);
    } catch (err) {
      showToast(err.message || 'Failed to submit dispute. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={`space-y-6 ${className}`}
      aria-label="Submit a dispute"
    >
      {/* Warning banner */}
      <div
        className="flex gap-3 rounded-xl border border-yellow-700/50 bg-yellow-900/20 px-4 py-3"
        role="note"
      >
        <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-yellow-300">
          Raising a dispute will pause fund release until a mediator resolves the issue.
          Both parties will be notified.
        </p>
      </div>

      {/* Terms diff — only shown when both versions of the terms are supplied */}
      {originalTerms && proposedTerms && (
        <TermsDiff before={originalTerms} after={proposedTerms} />
      )}

      {/* Reason */}
      <fieldset>
        <legend className="block text-sm font-medium text-gray-300 mb-2">
          Reason <span className="text-red-400" aria-hidden="true">*</span>
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label="Dispute reason">
          {DISPUTE_REASONS.map(({ value, label }) => (
            <label
              key={value}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer
                transition-colors text-sm select-none
                ${reason === value
                  ? 'border-indigo-500 bg-indigo-900/30 text-indigo-200'
                  : 'border-white/10 bg-white/[0.02] text-gray-400 hover:border-white/20 hover:text-gray-300'
                }
              `}
            >
              <input
                type="radio"
                name="dispute_reason"
                value={value}
                checked={reason === value}
                onChange={() => { setReason(value); setFieldErrors((p) => ({ ...p, reason: undefined })); }}
                className="sr-only"
                aria-describedby={fieldErrors.reason ? 'reason-error' : undefined}
              />
              <span
                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                  ${reason === value ? 'border-indigo-400' : 'border-gray-600'}`}
                aria-hidden="true"
              >
                {reason === value && (
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                )}
              </span>
              {label}
            </label>
          ))}
        </div>
        {fieldErrors.reason && (
          <p id="reason-error" role="alert" className="mt-1.5 text-xs text-red-400">
            {fieldErrors.reason}
          </p>
        )}
      </fieldset>

      {/* Description */}
      <div>
        <label htmlFor="dispute-description" className="block text-sm font-medium text-gray-300 mb-2">
          Description <span className="text-red-400" aria-hidden="true">*</span>
        </label>
        <textarea
          id="dispute-description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setFieldErrors((p) => ({ ...p, description: undefined }));
          }}
          maxLength={MAX_DESCRIPTION}
          rows={5}
          placeholder="Describe the issue in detail. Include timeline, agreed deliverables, and what went wrong."
          aria-describedby={`desc-count ${fieldErrors.description ? 'desc-error' : ''}`}
          aria-invalid={Boolean(fieldErrors.description)}
          className={`
            w-full rounded-xl border px-4 py-3 text-sm text-white placeholder-gray-600
            bg-white/[0.03] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500
            transition-colors
            ${fieldErrors.description ? 'border-red-500' : 'border-white/10 hover:border-white/20'}
          `}
        />
        <div className="flex items-start justify-between mt-1.5 gap-2">
          {fieldErrors.description ? (
            <p id="desc-error" role="alert" className="text-xs text-red-400">
              {fieldErrors.description}
            </p>
          ) : <span />}
          <p
            id="desc-count"
            className={`text-[11px] flex-shrink-0 ${description.length > MAX_DESCRIPTION * 0.9 ? 'text-orange-400' : 'text-gray-600'}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {description.length}/{MAX_DESCRIPTION}
          </p>
        </div>
      </div>

      {/* Evidence upload */}
      <div>
        <p className="block text-sm font-medium text-gray-300 mb-2">
          Evidence <span className="text-gray-500 font-normal">(optional)</span>
        </p>
        <FileDropZone
          onFilesAccepted={handleFilesAccepted}
          maxFiles={8}
          maxSizeBytes={25 * 1024 * 1024}
        />
        <p className="mt-2 text-[11px] text-gray-600">
          Screenshots, contracts, chat logs, or any files that support your claim.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white transition-colors
                       disabled:opacity-40"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium
                     bg-red-600 hover:bg-red-500 text-white transition-colors
                     focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                     focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            <>
              Submit Dispute
              <ChevronRight size={15} aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
