'use client';

/**
 * CurrencyAmount
 *
 * Renders a monetary amount with locale-aware formatting and an optional
 * convert-to-USD tooltip.
 *
 * @param {object}   props
 * @param {number|string|bigint} props.amount — the amount (number or raw stroop string)
 * @param {string}   props.currency       — currency code (e.g. 'XLM', 'USD', 'EUR', 'GBP')
 * @param {string}   [props.locale]       — BCP 47 locale override
 * @param {boolean}  [props.showUsdTooltip=false] — show USD equivalent on hover
 * @param {number}   [props.usdRate]      — exchange rate: 1 unit of currency = X USD
 * @param {boolean}  [props.showUsdc=false] — show USDC denomination below (legacy, from context)
 * @param {boolean}  [props.compact=false]  — use compact notation
 * @param {string}   [props.className]
 * @param {'sm'|'md'|'lg'} [props.size='md']
 *
 * @example
 * <CurrencyAmount amount={1234.56} currency="USD" showUsdTooltip usdRate={1} />
 * <CurrencyAmount amount={100.1234567} currency="XLM" />
 */

import { useEffect, useState } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import { formatCurrency, convertToUSD } from '../../lib/formatCurrency.js';

const SIZE_CLASSES = {
  sm: { value: 'text-sm font-semibold', sub: 'text-xs', tooltip: 'text-[10px]' },
  md: { value: 'text-base font-bold', sub: 'text-xs', tooltip: 'text-[10px]' },
  lg: { value: 'text-2xl font-bold', sub: 'text-sm', tooltip: 'text-xs' },
};

export default function CurrencyAmount({
  amount,
  currency,
  locale,
  showUsdTooltip = false,
  usdRate,
  showUsdc = false,
  compact = false,
  className = '',
  size = 'md',
}) {
  let ctx = null;
  try {
    ctx = useCurrency();
  } catch {
    // CurrencyProvider not available — fine, we'll use explicit props
  }
  const classes = SIZE_CLASSES[size] ?? SIZE_CLASSES.md;

  const [showTooltip, setShowTooltip] = useState(false);

  const numericAmount = Number(amount);
  if (amount === undefined || amount === null || Number.isNaN(numericAmount)) {
    return <span className={`text-gray-500 ${classes.value} ${className}`}>—</span>;
  }

  // Determine actual currency to display: explicit prop first, then context, fallback to USD
  const displayCurrency = currency ?? ctx?.currency ?? 'USD';
  const formatted = formatCurrency(numericAmount, displayCurrency, locale);

  // USD conversion for tooltip (only if enabled and not already showing USD)
  const usdEquivalent =
    showUsdTooltip && displayCurrency !== 'USD' && usdRate != null
      ? convertToUSD(numericAmount, usdRate)
      : null;
  const usdFormatted = usdEquivalent != null ? formatCurrency(usdEquivalent, 'USD') : null;

  // Legacy: USDC subtitle from context (context handles its own stroop conversion)
  const usdcStr = showUsdc && ctx ? ctx.formatUSDC?.(amount) : null;

  return (
    <span
      className={`inline-flex flex-col ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={`${classes.value} text-white ${ctx?.ratesLoading ? 'opacity-70' : ''}`}
        title={usdFormatted ?? undefined}
      >
        {formatted}
      </span>

      {/* USD tooltip on hover */}
      {showTooltip && usdFormatted && (
        <span
          className={`${classes.tooltip} text-gray-400 mt-0.5`}
          aria-hidden="true"
        >
          ≈ {usdFormatted}
        </span>
      )}

      {/* Legacy USDC subtitle */}
      {usdcStr && <span className={`${classes.sub} text-gray-500`}>{usdcStr}</span>}
    </span>
  );
}
