'use client';

/**
 * Chart theme tokens for the admin dashboard.
 *
 * Light and dark are *selected* palettes, not an automatic flip: each mode's
 * series steps were chosen for that mode's surface and validated as a set
 * against the surface the charts actually render on (the `.card` background —
 * gray-100 in light, gray-900 in dark).
 *
 * The three real categorical slots — active / completed / disputed — clear
 * every gate on the *all-pairs* list in both modes (OKLab ΔE ×100):
 *
 *   light  surface #f3f4f6 — lightness PASS · chroma PASS · CVD ΔE 8.4 PASS
 *                            · normal-vision ΔE 19.8 PASS
 *                            · contrast WARN on `disputed` (2.79)
 *   dark   surface #111827 — lightness PASS · chroma PASS · CVD ΔE 8.4 PASS
 *                            · normal-vision ΔE 19.8 PASS · contrast PASS
 *
 * The light-mode contrast WARN is discharged by the relief rule: every chart
 * ships visible direct labels *and* a table view, so no value is ever carried
 * by hue alone.
 *
 * `other` is the residual bucket rather than an entity, so it takes the
 * de-emphasis gray — deliberately below the categorical chroma floor, since
 * reading as gray is the point.
 *
 * Colour follows the entity, never its rank — `SERIES_KEYS` is a fixed
 * assignment, so filtering or reordering never repaints a series.
 */

import { useEffect, useState } from 'react';

/** Fixed slot order. A series keeps its hue regardless of value or position. */
export const SERIES_KEYS = ['active', 'completed', 'disputed', 'other'];

export const CHART_THEME = {
  light: {
    mode: 'light',
    surface: '#f3f4f6',
    grid: '#e5e7eb',
    axis: '#d1d5db',
    mutedInk: '#6b7280',
    primaryInk: '#111827',
    tooltipSurface: '#ffffff',
    tooltipBorder: 'rgba(17, 24, 39, 0.12)',
    /** Unfilled meter track — a lighter step of the meter fill's own ramp. */
    track: '#e0e7ff',
    series: {
      active: '#4f46e5',
      completed: '#199e70',
      disputed: '#c98500',
      other: '#9ca3af',
    },
  },
  dark: {
    mode: 'dark',
    surface: '#111827',
    grid: '#1f2937',
    axis: '#374151',
    mutedInk: '#9ca3af',
    primaryInk: '#f9fafb',
    tooltipSurface: '#1f2937',
    tooltipBorder: 'rgba(249, 250, 251, 0.14)',
    track: '#312e81',
    series: {
      // Stepped up from indigo-500 so an inline label on the segment clears
      // 4.5:1; indigo-500 tops out at 4.47:1 against either ink.
      active: '#7a81f4',
      completed: '#199e70',
      disputed: '#c98500',
      other: '#6b7280',
    },
  },
};

/**
 * Tracks the `dark` class that ThemeProvider stamps on `<html>`.
 *
 * Reading the class rather than the React context keeps the chart components
 * usable anywhere — Storybook, isolated tests, a future admin shell — without
 * requiring a provider, while still recolouring live when the user toggles.
 *
 * @returns {boolean}
 */
export function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains('dark'));

    read();

    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

/**
 * @returns {typeof CHART_THEME.light} tokens for the active colour scheme
 */
export function useChartTheme() {
  return useIsDarkTheme() ? CHART_THEME.dark : CHART_THEME.light;
}

/**
 * Formats a count for a stat tile: exact below 10,000, compact above.
 * Proportional figures are used at display size, so no padding is applied.
 *
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (Math.abs(n) < 10000) return n.toLocaleString('en-US');
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

const LIGHT_INK = '#ffffff';
const DARK_INK = '#111827';

/**
 * WCAG relative luminance of a `#rrggbb` colour.
 * @param {string} hex
 * @returns {number}
 */
function relativeLuminance(hex) {
  const int = parseInt(hex.slice(1), 16);
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((int >> 16) & 255) +
    0.7152 * channel((int >> 8) & 255) +
    0.0722 * channel(int & 255)
  );
}

/**
 * Picks the ink for a label set *inside* a coloured fill — the one place text
 * may sit on a series colour — by taking whichever of white or near-black has
 * the higher contrast against that fill.
 *
 * @param {string} hex e.g. "#4f46e5"
 * @returns {string} white or near-black
 */
export function readableInkOn(hex) {
  const contrast = (a, b) => {
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  };
  const fill = relativeLuminance(hex);
  return contrast(relativeLuminance(LIGHT_INK), fill) >= contrast(relativeLuminance(DARK_INK), fill)
    ? LIGHT_INK
    : DARK_INK;
}

/**
 * @param {number|null|undefined} value 0–1
 * @returns {string} e.g. "62.5%" or "—"
 */
export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const pct = Number(value) * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/**
 * Derives every metric the dashboard shows from the `/api/admin/stats` payload.
 * Returns `null` for rates that have no denominator, so the UI can render an
 * honest em dash instead of a misleading 0%.
 *
 * @param {object|null} stats
 */
export function deriveMetrics(stats) {
  const escrows = stats?.escrows ?? {};
  const disputes = stats?.disputes ?? {};

  const total = Number(escrows.total ?? 0);
  const active = Number(escrows.active ?? 0);
  const completed = Number(escrows.completed ?? 0);
  const disputed = Number(escrows.disputed ?? 0);
  const other = Math.max(0, total - active - completed - disputed);

  const open = Number(disputes.open ?? 0);
  const resolved = Math.max(0, Number(disputes.resolved ?? 0));
  const totalDisputes = open + resolved;

  return {
    total,
    active,
    completed,
    disputed,
    other,
    users: Number(stats?.users?.total ?? 0),
    open,
    resolved,
    totalDisputes,
    completionRate: total > 0 ? completed / total : null,
    disputeRate: total > 0 ? disputed / total : null,
    resolutionRate: totalDisputes > 0 ? resolved / totalDisputes : null,
  };
}
