'use client';

/**
 * EscrowHistoryList
 *
 * Full escrow history for a user's profile page. Lets the user filter
 * their escrows by role/status, and renders each row as an accessible
 * card that works from mobile (375px) up through desktop (1440px).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '../ui/StatusBadge';
import CurrencyAmount from '../ui/CurrencyAmount';
import TruncatedAddress from '../ui/TruncatedAddress';
import EmptyState from '../ui/EmptyState';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed', label: 'Disputed' },
];

const ACTIVE_STATUSES = new Set(['funded', 'in_progress', 'release_requested']);
const COMPLETED_STATUSES = new Set(['released', 'resolved']);
const DISPUTED_STATUSES = new Set(['disputed']);

function matchesFilter(escrow, filterId) {
  if (filterId === 'all') return true;
  if (filterId === 'active') return ACTIVE_STATUSES.has(escrow.status);
  if (filterId === 'completed') return COMPLETED_STATUSES.has(escrow.status);
  if (filterId === 'disputed') return DISPUTED_STATUSES.has(escrow.status);
  return true;
}

function formatDate(value) {
  if (!value) return 'Unknown date';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Unknown date';
  }
}

function HistorySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="mt-3 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function EscrowRow({ escrow }) {
  const role = escrow.role === 'client' ? 'You are the client' : 'You are the counterparty';
  return (
    <li>
      <Link
        href={`/escrow/${escrow.id}`}
        className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-colors
                   hover:border-indigo-400 focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-indigo-500 dark:border-gray-800 dark:bg-gray-900
                   dark:hover:border-indigo-500 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white">
              Escrow #{escrow.id}
            </span>
            <StatusBadge status={escrow.status} />
          </div>
          <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">
            {role} with <TruncatedAddress address={escrow.counterparty} className="!text-xs" />
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
            {formatDate(escrow.createdAt)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <CurrencyAmount amount={escrow.amount} showUsdc size="sm" />
        </div>
      </Link>
    </li>
  );
}

export default function EscrowHistoryList({ escrows = [], isLoading = false, error = null }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const filtered = useMemo(
    () => escrows.filter((escrow) => matchesFilter(escrow, activeFilter)),
    [escrows, activeFilter],
  );

  return (
    <section aria-labelledby="escrow-history-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2
          id="escrow-history-heading"
          className="text-lg font-semibold text-gray-900 dark:text-white"
        >
          Escrow history
        </h2>

        <div
          role="tablist"
          aria-label="Filter escrow history"
          className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
        >
          {FILTERS.map((filter) => {
            const isActive = filter.id === activeFilter;
            return (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveFilter(filter.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none
                            focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                              isActive
                                ? 'bg-white text-indigo-600 shadow-sm dark:bg-gray-950 dark:text-indigo-400'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                            }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && <HistorySkeleton />}

      {!isLoading && error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        >
          Failed to load escrow history. Please try again later.
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <EmptyState
          title="No escrows here yet"
          description="Escrows you create or participate in will show up in this list."
          actionLabel="Create an escrow"
          actionHref="/escrow/create"
        />
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <ul className="space-y-3" aria-label="Escrow history list">
          {filtered.map((escrow) => (
            <EscrowRow key={escrow.id} escrow={escrow} />
          ))}
        </ul>
      )}
    </section>
  );
}
