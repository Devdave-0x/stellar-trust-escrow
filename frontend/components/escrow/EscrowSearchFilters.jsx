'use client';

import { useId, useState } from 'react';
import { cn } from '../../lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const inputClasses =
  'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 ' +
  'px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

const labelClasses = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

/**
 * Search and advanced filter panel for the escrow list.
 * Controlled component: pairs with the `useEscrowFilter` hook's `filters`/`setFilter`/`resetFilters`/`activeCount`.
 */
export default function EscrowSearchFilters({
  filters,
  setFilter,
  resetFilters,
  activeCount = 0,
  className,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const searchId = useId();
  const statusId = useId();
  const minId = useId();
  const maxId = useId();
  const fromId = useId();
  const toId = useId();
  const panelId = useId();

  const handleAdvancedKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setAdvancedOpen((open) => !open);
    }
  };

  return (
    <section
      aria-label="Search and filter escrows"
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1 min-w-0">
          <label htmlFor={searchId} className={labelClasses}>
            Search
          </label>
          <div className="relative">
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"
              />
            </svg>
            <input
              id={searchId}
              type="search"
              role="searchbox"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Search by ID, counterparty, or description"
              className={cn(inputClasses, 'pl-9')}
              aria-describedby={`${searchId}-hint`}
            />
          </div>
          <span id={`${searchId}-hint`} className="sr-only">
            Filters the escrow list as you type
          </span>
        </div>

        <div className="w-full sm:w-48">
          <label htmlFor={statusId} className={labelClasses}>
            Status
          </label>
          <select
            id={statusId}
            value={filters.status}
            onChange={(e) => setFilter('status', e.target.value)}
            className={inputClasses}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            onKeyDown={handleAdvancedKeyDown}
            aria-expanded={advancedOpen}
            aria-controls={panelId}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Advanced
            <svg
              aria-hidden="true"
              className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Clear ({activeCount})
            </button>
          )}
        </div>
      </div>

      <div
        id={panelId}
        hidden={!advancedOpen}
        className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 dark:border-gray-800 pt-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label htmlFor={minId} className={labelClasses}>
            Min amount
          </label>
          <input
            id={minId}
            type="number"
            inputMode="decimal"
            min="0"
            value={filters.minAmount}
            onChange={(e) => setFilter('minAmount', e.target.value)}
            placeholder="0"
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={maxId} className={labelClasses}>
            Max amount
          </label>
          <input
            id={maxId}
            type="number"
            inputMode="decimal"
            min="0"
            value={filters.maxAmount}
            onChange={(e) => setFilter('maxAmount', e.target.value)}
            placeholder="Any"
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={fromId} className={labelClasses}>
            Created from
          </label>
          <input
            id={fromId}
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilter('dateFrom', e.target.value)}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor={toId} className={labelClasses}>
            Created to
          </label>
          <input
            id={toId}
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilter('dateTo', e.target.value)}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {activeCount > 0 ? `${activeCount} filter${activeCount === 1 ? '' : 's'} applied` : ''}
      </div>
    </section>
  );
}
