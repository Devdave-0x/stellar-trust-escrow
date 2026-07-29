'use client';

/**
 * MetricCard — a stat tile.
 *
 * A handful of headline numbers is a KPI row, not a grouped bar chart, so each
 * platform metric gets a tile: label (sentence case) · value · optional
 * supporting line. The `hero` variant renders the one number the dashboard
 * leads with at display size — exactly one per view.
 *
 * Values use proportional figures (`tabular-nums` is reserved for the table
 * views, where digits must align vertically).
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value      Pre-formatted; render "—" for unknown
 * @param {string} [props.sub]      Supporting line beneath the value
 * @param {string} [props.accent]   Hex for the identity dot beside the label
 * @param {boolean} [props.hero]    Render as the dashboard's lead figure
 */

import { cn } from '../../lib/utils';

export default function MetricCard({ label, value, sub, accent, hero = false }) {
  return (
    <div className={cn('card flex flex-col gap-2', hero && 'sm:col-span-2 lg:col-span-1')}>
      <div className="flex items-center gap-2">
        {accent && (
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
        )}
        <p className="text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
          {label}
        </p>
      </div>
      <p
        className={cn(
          'font-semibold text-gray-900 dark:text-gray-50',
          hero ? 'text-4xl sm:text-5xl' : 'text-3xl',
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-600 dark:text-gray-400">{sub}</p>}
    </div>
  );
}
