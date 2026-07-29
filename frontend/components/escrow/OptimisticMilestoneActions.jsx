'use client';

/**
 * OptimisticMilestoneActions — Approve/Reject controls that update the UI
 * immediately (optimistic update) instead of waiting for the network round
 * trip, then reconcile or roll back once the request settles.
 *
 * Gives instant perceived feedback while remaining accessible: the pending
 * state is announced via aria-live, buttons expose aria-busy while a request
 * is in flight, and failures roll the status back with a visible error.
 *
 * @param {object}   props
 * @param {object}   props.milestone       — { id, title, status, amount }
 * @param {Function} props.onApprove(id)   — returns a Promise
 * @param {Function} props.onReject(id)    — returns a Promise
 * @param {string}   [props.className]
 */

import { useOptimisticAction } from '../../hooks/useOptimisticAction';
import { cn } from '../../lib/utils';

export default function OptimisticMilestoneActions({ milestone, onApprove, onReject, className }) {
  const { state, run, isPending, error } = useOptimisticAction(milestone);

  const handle = (nextStatus, action) =>
    run({
      optimisticUpdate: (prev) => ({ ...prev, status: nextStatus }),
      action: () => action(milestone.id),
      onSuccess: (result, prev) => ({ ...prev, ...(result || {}) }),
    }).catch(() => {
      /* error state is surfaced via `error` below; rollback already applied */
    });

  const isSettled = state.status === 'Approved' || state.status === 'Rejected';

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-2">
        {state.status === 'Submitted' && (
          <>
            <button
              type="button"
              onClick={() => handle('Approved', onApprove)}
              disabled={isPending}
              aria-busy={isPending}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              ✓ Approve
            </button>
            <button
              type="button"
              onClick={() => handle('Rejected', onReject)}
              disabled={isPending}
              aria-busy={isPending}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              ✗ Reject
            </button>
          </>
        )}
        {isSettled && (
          <span
            className={cn(
              'text-sm font-medium',
              state.status === 'Approved'
                ? 'text-emerald-500 dark:text-emerald-400'
                : 'text-red-500 dark:text-red-400',
            )}
          >
            {state.status === 'Approved' ? '✓ Approved' : '✗ Rejected'}
          </span>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {isPending ? `Updating milestone to ${state.status}` : ''}
      </p>

      {error && (
        <p role="alert" className="text-xs text-red-500 dark:text-red-400">
          Update failed — reverted to previous status. {error.message || 'Please try again.'}
        </p>
      )}
    </div>
  );
}
