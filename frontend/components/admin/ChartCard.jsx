'use client';

/**
 * ChartCard — the shell every admin chart renders inside.
 *
 * Carries the two things a chart must never ship without:
 *
 *  1. a table view twin. The table is always in the accessibility tree, so a
 *     screen-reader user reaches every value without touching the chart; the
 *     toggle only controls whether sighted users see it too, which is why the
 *     button is `aria-pressed` rather than `aria-expanded`;
 *  2. refetch that keeps the frame — the previous render is held at reduced
 *     opacity instead of collapsing to a skeleton, so nothing jumps.
 *
 * The plot itself is `aria-hidden` — it emits decorative SVG that reads as noise,
 * and the table already carries the data. Anything that must reach assistive tech
 * (a legend, meters, an empty-state message) goes in `footer` or `empty`, both of
 * which render outside that boundary.
 *
 * @param {object} props
 * @param {string} props.id
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {{caption: string, columns: string[], rows: Array<Array<string>>}} props.table
 * @param {boolean} [props.busy]  Refetching — hold the frame, dim it
 * @param {string} [props.empty]  Message to show in place of the plot when
 *                                there is nothing to plot. Rendered outside the
 *                                `aria-hidden` boundary, since "no data yet" is
 *                                information rather than chart decoration.
 * @param {React.ReactNode} props.children  The plot
 * @param {React.ReactNode} [props.footer]  Legend, meters, or notes below the plot
 */

import { useId, useState } from 'react';
import { cn } from '../../lib/utils';

export default function ChartCard({
  id,
  title,
  subtitle,
  table,
  busy = false,
  empty,
  children,
  footer,
}) {
  const [showTable, setShowTable] = useState(false);
  const generatedId = useId();
  const headingId = `${id ?? generatedId}-title`;
  const tableId = `${id ?? generatedId}-table`;

  return (
    <section
      aria-labelledby={headingId}
      className="card flex flex-col gap-4"
      aria-busy={busy || undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={headingId} className="text-base font-semibold text-gray-900 dark:text-gray-50">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          aria-controls={tableId}
          className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {showTable ? 'Hide data table' : 'Show data table'}
        </button>
      </div>

      <div
        className={cn(
          'transition-opacity duration-200 motion-reduce:transition-none',
          busy && 'opacity-50',
        )}
      >
        {empty ? (
          <p className="py-6 text-sm text-gray-600 dark:text-gray-400">{empty}</p>
        ) : (
          <div aria-hidden="true">{children}</div>
        )}
        {footer}
      </div>

      <div id={tableId} className={cn(!showTable && 'sr-only')}>
        <table className="w-full text-left text-sm tabular-nums">
          <caption className="sr-only">{table.caption}</caption>
          <thead>
            <tr className="border-b border-gray-300 dark:border-gray-700">
              {table.columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="py-1.5 pr-3 text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr
                key={row[0]}
                className="border-b border-gray-200 last:border-0 dark:border-gray-800"
              >
                <th
                  scope="row"
                  className="py-1.5 pr-3 font-normal text-gray-700 dark:text-gray-300"
                >
                  {row[0]}
                </th>
                {row.slice(1).map((cell, i) => (
                  <td
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${row[0]}-${i}`}
                    className="py-1.5 pr-3 text-gray-900 dark:text-gray-100"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
