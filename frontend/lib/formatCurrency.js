/**
 * formatCurrency
 *
 * Formats a monetary amount with locale-aware display based on the currency.
 *
 * - XLM: always 7 decimal places with "XLM" suffix
 * - USD/EUR/GBP (and other fiat): 2 decimal places using Intl.NumberFormat
 *   with the appropriate locale from CURRENCY_LOCALES
 * - Invalid/unknown currency: falls back to 2 decimal places with raw code suffix
 *
 * @param {number}  amount    — the numeric amount to format
 * @param {string}  currency  — currency code (e.g. 'XLM', 'USD', 'EUR', 'GBP')
 * @param {string}  [locale]  — optional BCP 47 locale override (falls back to currency default)
 * @returns {string}          — formatted string, e.g. "1,234.5678901 XLM" or "$1,234.56"
 *
 * @example
 * formatCurrency(1234.5678901, 'XLM')           // "1,234.5678901 XLM"
 * formatCurrency(1234.56, 'USD')                // "$1,234.56"
 * formatCurrency(1234.56, 'EUR', 'fr-FR')       // "1 234,56 €"
 * formatCurrency(1234.56, 'GBP')                // "£1,234.56"
 * formatCurrency(1234.56, 'XYZ')                // "1,234.56 XYZ" (fallback)
 */

// Currency → default locale mapping for Intl.NumberFormat
const CURRENCY_LOCALES = {
  USD: 'en-US',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CAD: 'en-CA',
  AUD: 'en-AU',
  CHF: 'de-CH',
  CNY: 'zh-CN',
  INR: 'en-IN',
  BRL: 'pt-BR',
  MXN: 'es-MX',
  SGD: 'en-SG',
  KRW: 'ko-KR',
  NGN: 'en-NG',
  ZAR: 'en-ZA',
};

// Currencies that should use 0 fraction digits
const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW'];

// Crypto / on-chain tokens with custom formatting
const CRYPTO_FORMATTERS = {
  XLM: (amount) => `${amount.toFixed(7)} XLM`,
};

/**
 * Returns a locale-aware formatted string for a monetary amount.
 */
export function formatCurrency(amount, currency, locale) {
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return '—';
  }

  const upper = (currency ?? '').toUpperCase();

  // ── XLM: always 7 decimal places ─────────────────────────────────────────
  if (upper === 'XLM') {
    return CRYPTO_FORMATTERS.XLM(amount);
  }

  // ── Fiat currencies: use Intl.NumberFormat ──────────────────────────────
  const resolvedLocale = locale ?? CURRENCY_LOCALES[upper] ?? 'en-US';
  const isValidCurrency = upper in CURRENCY_LOCALES;

  if (isValidCurrency) {
    try {
      return new Intl.NumberFormat(resolvedLocale, {
        style: 'currency',
        currency: upper,
        minimumFractionDigits: ZERO_DECIMAL_CURRENCIES.includes(upper) ? 0 : 2,
        maximumFractionDigits: ZERO_DECIMAL_CURRENCIES.includes(upper) ? 0 : 2,
      }).format(amount);
    } catch {
      // Intl failed — fallback below
    }
  }

  // ── Fallback for unknown currencies ──────────────────────────────────────
  try {
    return `${new Intl.NumberFormat(resolvedLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)} ${upper}`;
  } catch {
    return `${amount.toFixed(2)} ${upper}`;
  }
}

/**
 * Converts an amount from one currency to USD using a given rate.
 *
 * @param {number} amount       — amount in the source currency
 * @param {number} rateToUSD    — how many USD per 1 unit of source currency
 * @returns {number}
 */
export function convertToUSD(amount, rateToUSD) {
  return amount * rateToUSD;
}

export default formatCurrency;
