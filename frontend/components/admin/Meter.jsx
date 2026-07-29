'use client';

/**
 * Meter — a single ratio against a limit.
 *
 * Used instead of a two-slice pie: the fill carries the ratio, the unfilled
 * track is a lighter step of the fill's own ramp so the state reads across the
 * whole bar. Exposed to assistive tech as a `progressbar` (better supported
 * than `role="meter"`) with an `aria-valuetext` that reads the same sentence a
 * sighted user gets from the label beside it.
 *
 * @param {object} props
 * @param {string} props.label      Accessible name, e.g. "Dispute resolution rate"
 * @param {number|null} props.value 0–1, or null when there is no denominator
 * @param {string} props.valueText  Human-readable readout, e.g. "62.5% (5 of 8)"
 */

import { useChartTheme } from './chartTheme';

export default function Meter({ label, value, valueText }) {
  const theme = useChartTheme();
  const hasValue = typeof value === 'number' && !Number.isNaN(value);
  const pct = hasValue ? Math.min(100, Math.max(0, value * 100)) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400">
          {label}
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{valueText}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(hasValue ? { 'aria-valuenow': Math.round(pct) } : {})}
        aria-valuetext={valueText}
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: theme.track }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%`, backgroundColor: theme.series.active }}
        />
      </div>
    </div>
  );
}
