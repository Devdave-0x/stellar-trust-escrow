/**
 * Lightweight currency formatter for display contexts that don't need the
 * full CurrencyContext (e.g. printable receipts, exports).
 * @param {string|number} amount
 * @param {string} currency — ISO 4217 code, defaults to USDC-as-USD display
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'USD') {
  const numeric = Number(amount ?? 0);
  if (Number.isNaN(numeric)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${currency}`;
  }
}

/**
 * @param {string|number|Date} value
 * @returns {string} e.g. "Jul 28, 2026, 3:45 PM"
 */
export function formatDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
