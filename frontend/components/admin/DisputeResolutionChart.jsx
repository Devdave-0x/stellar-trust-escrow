'use client';

/**
 * DisputeResolutionChart — "are we clearing disputes?".
 *
 * A magnitude comparison across two ordered buckets, so: a column chart on a
 * single baseline, one series in slot 1 (no legend — the title names what is
 * plotted, and a one-swatch legend box would just restate it). Both columns are
 * direct-labelled; with two marks that is a label per column, not a flood.
 *
 * The two rates live beneath the plot as meters rather than extra columns: a
 * single ratio against a limit is a meter, never a two-slice pie, and mixing a
 * count scale and a percentage scale in one plot would mean a second y-axis.
 *
 * @param {object} props
 * @param {ReturnType<import('./chartTheme').deriveMetrics>} props.metrics
 * @param {boolean} [props.busy]
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartCard from './ChartCard';
import Meter from './Meter';
import { useChartTheme, formatCount, formatPercent } from './chartTheme';

function ChartTooltip({ active, payload, theme }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        backgroundColor: theme.tooltipSurface,
        border: `1px solid ${theme.tooltipBorder}`,
        color: theme.primaryInk,
      }}
    >
      {/* Value leads, label follows — the reader already has the series. The
          series is keyed with a short stroke, not a filled box: at tooltip
          density a box is data-weight ink doing a label's job. */}
      <p className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-0.5 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: theme.series.active }}
        />
        <span className="font-semibold">{formatCount(point.value)}</span>
        <span style={{ color: theme.mutedInk }}>{point.label.toLowerCase()}</span>
      </p>
    </div>
  );
}

export default function DisputeResolutionChart({ metrics, busy = false }) {
  const theme = useChartTheme();

  const data = [
    { label: 'Open', value: metrics.open },
    { label: 'Resolved', value: metrics.resolved },
  ];

  const table = {
    caption: 'Dispute counts by state, with resolution and dispute rates',
    columns: ['Metric', 'Value'],
    rows: [
      ['Open disputes', formatCount(metrics.open)],
      ['Resolved disputes', formatCount(metrics.resolved)],
      ['Total disputes', formatCount(metrics.totalDisputes)],
      ['Resolution rate', formatPercent(metrics.resolutionRate)],
      ['Escrow dispute rate', formatPercent(metrics.disputeRate)],
    ],
  };

  /** "62.5% — 5 of 8 resolved", or a plain sentence when there is no ratio. */
  const ratioText = (rate, part, whole, noun, fallback) =>
    whole > 0
      ? `${formatPercent(rate)} — ${formatCount(part)} of ${formatCount(whole)} ${noun}`
      : fallback;

  const meters = (
    <div className="mt-4 flex flex-col gap-4">
      <Meter
        label="Resolution rate"
        value={metrics.resolutionRate}
        valueText={ratioText(
          metrics.resolutionRate,
          metrics.resolved,
          metrics.totalDisputes,
          'resolved',
          'No disputes raised',
        )}
      />
      <Meter
        label="Escrow dispute rate"
        value={metrics.disputeRate}
        valueText={ratioText(
          metrics.disputeRate,
          metrics.disputed,
          metrics.total,
          'escrows',
          'No escrows yet',
        )}
      />
    </div>
  );

  return (
    <ChartCard
      id="dispute-resolution"
      title="Dispute resolution"
      subtitle="Open versus resolved disputes across the platform"
      table={table}
      busy={busy}
      footer={meters}
      empty={metrics.totalDisputes === 0 ? 'No disputes have been raised yet.' : undefined}
    >
      {metrics.totalDisputes > 0 && (
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: theme.axis }}
                tick={{ fill: theme.mutedInk, fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={48}
                tick={{ fill: theme.mutedInk, fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
                content={<ChartTooltip theme={theme} />}
              />
              <Bar
                dataKey="value"
                fill={theme.series.active}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  offset={8}
                  fill={theme.mutedInk}
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
