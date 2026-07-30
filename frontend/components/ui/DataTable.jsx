'use client';

/**
 * DataTable — responsive, sortable, paginated data table.
 *
 * Fully keyboard navigable (sortable headers are buttons, pagination controls
 * are native buttons) and screen-reader friendly (aria-sort, live region for
 * page announcements). Matches the app's dark/light design system.
 *
 * @param {object}   props
 * @param {Array<{key: string, label: string, sortable?: boolean, render?: function}>} props.columns
 * @param {Array<object>} props.data
 * @param {string}   [props.caption]        — accessible table caption
 * @param {number}   [props.pageSize=10]
 * @param {string}   [props.getRowId]       — function(row) => unique id, defaults to index
 * @param {string}   [props.emptyMessage]
 * @param {string}   [props.className]
 */

import { useMemo, useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/utils';

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export default function DataTable({
  columns,
  data = [],
  caption,
  pageSize = 10,
  getRowId,
  emptyMessage = 'No results found.',
  className,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    const accessor = col?.sortAccessor || ((row) => row[sortKey]);
    const copy = [...data];
    copy.sort((a, b) => {
      const result = compareValues(accessor(a), accessor(b));
      return sortDir === 'asc' ? result : -result;
    });
    return copy;
  }, [data, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const handleSort = useCallback(
    (key) => {
      setPage(1);
      setSortKey((prevKey) => {
        if (prevKey !== key) {
          setSortDir('asc');
          return key;
        }
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return key;
      });
    },
    [],
  );

  const goToPage = useCallback(
    (next) => {
      setPage(Math.min(Math.max(1, next), totalPages));
    },
    [totalPages],
  );

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={col.sortable ? ariaSort : undefined}
                    className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap"
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                      >
                        {col.label}
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr
                  key={getRowId ? getRowId(row) : i}
                  className="hover:bg-gray-50 dark:hover:bg-gray-900/40"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-800 dark:text-gray-200">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sorted.length > 0 && (
        <nav
          aria-label="Table pagination"
          className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-3 text-sm text-gray-600 dark:text-gray-400"
        >
          <p aria-live="polite">
            Page {currentPage} of {totalPages} &middot; {sorted.length} results
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
