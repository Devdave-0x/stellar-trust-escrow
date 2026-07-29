'use client';

/**
 * EscrowStatusChart — part-to-whole, so: a 100% stacked horizontal bar.
 *
 * Built from layout primitives rather than a charting library on purpose. The
 * spec for a stack is a **2px gap in the surface colour** between segments —
 * never a stroke drawn around them — and flex `gap` gives exactly that, at
 * exactly 2px, at every width. It also keeps the bar capped at 24px thick with
 * rounded data-ends only at the two outer edges.
 *
 * Every value is readable three ways: direct labels inside the segments wide
 * enough to hold them, the legend rows (which carry count and share for *all*
 * segments, including the ones too small to label inline), and the table view.
 * The hover readout is an enhancement on top of those, never the only path —
 * which is why the plot itself can be `aria-hidden` without gating anything.
 * The legend sits outside that boundary, so identity reaches assistive tech.
 *
 * @param {object} props
 * @param {ReturnType<import('./chartTheme').deriveMetrics>} props.metrics
 * @param {boolean} [props.busy]
 */

import { useState } from 'react';
import ChartCard from './ChartCard';
import { useChartTheme, formatCount, formatPercent, readableInkOn } from './chartTheme';

/**
 * Below this share an inline label cannot fit with padding on both sides, so
 * it is dropped rather than clipped — the legend and table still carry it.
 */
const INLINE_LABEL_MIN_SHARE = 0.12;

/**
 * `other` is the residual bucket, painted in the de-emphasis gray. That step is
 * chosen to recede against the surface, which leaves it too low-contrast to
 * host 11px text in either mode — so it never carries an inline label, the same
 * way a segment too narrow to fit one doesn't. The legend and table carry its
 * value either way, so nothing is gated.
 */
const SEGMENT_DEFS = [
  { key: 'active', label: 'Active', inlineLabel: true },
  { key: 'completed', label: 'Completed', inlineLabel: true },
  { key: 'disputed', label: 'Disputed', inlineLabel: true },
  { key: 'other', label: 'Other', inlineLabel: false },
];

export default function EscrowStatusChart({ metrics, busy = false }) {
  const theme = useChartTheme();
  const [hovered, setHovered] = useState(null);

  const { total } = metrics;
  const share = (key) => (total > 0 ? metrics[key] / total : 0);

  const segments = SEGMENT_DEFS.map((def) => ({
    ...def,
    count: metrics[def.key],
    share: share(def.key),
    color: theme.series[def.key],
  })).filter((segment) => segment.count > 0);

  const table = {
    caption: 'Escrow count and share of total, by lifecycle status',
    columns: ['Status', 'Escrows', 'Share'],
    rows: [
      ...SEGMENT_DEFS.map((def) => [
        def.label,
        formatCount(metrics[def.key]),
        total > 0 ? formatPercent(share(def.key)) : '—',
      ]),
      ['Total', formatCount(total), total > 0 ? '100%' : '—'],
    ],
  };

  /* Legend — outside the aria-hidden plot, and value-bearing, so it doubles as
     the direct label for segments too narrow to carry one inline. */
  const legendRows = (
    <dl
      aria-label="Escrow status legend"
      className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4"
    >
      {SEGMENT_DEFS.map((def) => (
        <div key={def.key} className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span
              aria-hidden="true"
              className="h-2.5 w-4 shrink-0 rounded-sm"
              style={{ backgroundColor: theme.series[def.key] }}
            />
            {def.label}
          </dt>
          <dd className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {formatCount(metrics[def.key])}
            <span className="ml-1 font-normal text-gray-600 dark:text-gray-400">
              ({total > 0 ? formatPercent(share(def.key)) : '—'})
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <ChartCard
      id="escrow-status"
      title="Escrow status distribution"
      subtitle="Share of all escrows by lifecycle state"
      table={table}
      busy={busy}
      footer={legendRows}
      empty={total === 0 ? 'No escrows have been created yet.' : undefined}
    >
      {total > 0 && (
        <div className="flex flex-col gap-3">
          {/* The stack. `gap-0.5` is the 2px surface gap between segments. */}
          <div className="flex h-6 w-full gap-0.5">
            {segments.map((segment) => (
              <div
                key={segment.key}
                onPointerEnter={() => setHovered(segment.key)}
                onPointerLeave={() => setHovered(null)}
                className="flex min-w-0 items-center justify-center transition-opacity duration-150 first:rounded-l last:rounded-r motion-reduce:transition-none"
                style={{
                  width: `${segment.share * 100}%`,
                  backgroundColor: segment.color,
                  opacity: hovered && hovered !== segment.key ? 0.55 : 1,
                }}
              >
                {segment.inlineLabel && segment.share >= INLINE_LABEL_MIN_SHARE && (
                  <span
                    className="px-1 text-[11px] font-semibold"
                    style={{ color: readableInkOn(segment.color) }}
                  >
                    {formatPercent(segment.share)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Hover readout — value leads, series name follows. */}
          <p className="min-h-[1.25rem] text-xs text-gray-600 dark:text-gray-400">
            {hovered ? (
              <>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatCount(metrics[hovered])}
                </span>{' '}
                {SEGMENT_DEFS.find((def) => def.key === hovered)?.label.toLowerCase()} escrows
              </>
            ) : (
              `${formatCount(total)} escrows total`
            )}
          </p>
        </div>
      )}
    </ChartCard>
  );
}
