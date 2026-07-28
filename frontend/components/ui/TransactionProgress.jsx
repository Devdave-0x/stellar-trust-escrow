'use client';

/**
 * TransactionProgress
 *
 * Step indicator for a Stellar blockchain operation, from wallet signature
 * through network confirmation. Use it any time a component submits a
 * transaction so users get clear, live feedback instead of a bare spinner.
 *
 * @param {object} props
 * @param {'idle'|'signing'|'submitting'|'confirming'|'confirmed'|'failed'} props.status
 * @param {string} [props.txHash]      — shown once available (submitting onward)
 * @param {string} [props.explorerUrl] — link to view the transaction once confirmed
 * @param {string} [props.errorMessage] — shown when status === 'failed'
 * @param {Function} [props.onRetry]   — renders a Retry button when provided and failed
 * @param {string} [props.className]
 */

import { cn } from '../../lib/utils';
import TransactionHash from './TransactionHash';
import Button from './Button';

export const TX_STEPS = [
  { id: 'signing', label: 'Awaiting signature', description: 'Confirm the transaction in your wallet.' },
  { id: 'submitting', label: 'Submitting', description: 'Broadcasting to the Stellar network.' },
  { id: 'confirming', label: 'Confirming', description: 'Waiting for ledger confirmation.' },
  { id: 'confirmed', label: 'Confirmed', description: 'Transaction complete.' },
];

const STEP_ORDER = ['idle', 'signing', 'submitting', 'confirming', 'confirmed', 'failed'];

function stepState(stepId, status) {
  if (status === 'failed') {
    const failedAtIndex = STEP_ORDER.indexOf(stepId);
    const currentIndex = STEP_ORDER.indexOf('failed');
    return failedAtIndex < currentIndex ? 'complete' : 'failed';
  }
  const stepIndex = STEP_ORDER.indexOf(stepId);
  const statusIndex = STEP_ORDER.indexOf(status);
  if (stepIndex < statusIndex) return 'complete';
  if (stepIndex === statusIndex) return 'active';
  return 'pending';
}

function StepIcon({ state }) {
  if (state === 'complete') {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
        aria-hidden="true"
      >
        ✓
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
        aria-hidden="true"
      >
        ✕
      </span>
    );
  }
  if (state === 'active') {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-indigo-500"
        aria-hidden="true"
      >
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-indigo-500" />
      </span>
    );
  }
  return (
    <span
      className="h-6 w-6 shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-700"
      aria-hidden="true"
    />
  );
}

export default function TransactionProgress({
  status = 'idle',
  txHash,
  explorerUrl,
  errorMessage,
  onRetry,
  className,
}) {
  const activeStep = TX_STEPS.find((s) => s.id === status);
  const statusLabel =
    status === 'failed'
      ? 'Transaction failed'
      : status === 'idle'
        ? 'Ready to send'
        : activeStep?.label ?? 'Processing';

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900',
        className,
      )}
      role="group"
      aria-label="Transaction progress"
    >
      <p className="sr-only" role="status" aria-live="polite">
        {statusLabel}
      </p>

      <ol className="space-y-4">
        {TX_STEPS.map((step) => {
          const state = stepState(step.id, status);
          return (
            <li key={step.id} className="flex items-start gap-3">
              <StepIcon state={state} />
              <div>
                <p
                  className={cn(
                    'text-sm font-medium',
                    state === 'pending'
                      ? 'text-gray-400 dark:text-gray-600'
                      : 'text-gray-900 dark:text-white',
                  )}
                >
                  {step.label}
                </p>
                {state === 'active' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{step.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {status === 'failed' && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        >
          <p>{errorMessage || 'The transaction could not be completed.'}</p>
          {onRetry && (
            <Button variant="danger" size="sm" className="mt-2" onClick={onRetry}>
              Retry transaction
            </Button>
          )}
        </div>
      )}

      {txHash && (status === 'submitting' || status === 'confirming' || status === 'confirmed') && (
        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          <TransactionHash hash={txHash} explorerUrl={explorerUrl} label="Transaction hash" />
        </div>
      )}
    </div>
  );
}
