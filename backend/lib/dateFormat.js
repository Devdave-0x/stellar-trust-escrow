/**
 * Date Formatting Utility
 *
 * Provides a consistent set of date formatting helpers used across the backend:
 *   - ISO string to locale display format  (e.g. "Jul 29, 2025, 1:48 AM")
 *   - Timestamp / Date to relative time    (e.g. "3 minutes ago")
 *   - Date to YYYY-MM-DD calendar string
 *   - Timezone-aware formatting via IANA identifiers
 *
 * All helpers return an empty string (or a designated fallback) for null,
 * undefined, or unparseable inputs — never "Invalid Date".
 */

/** Sentinel returned when the input cannot be parsed as a valid date. */
export const INVALID_DATE_FALLBACK = '';

/**
 * Coerce `value` to a Date.  Returns `null` if the input is falsy or produces
 * an invalid date.
 *
 * @param {Date|string|number|null|undefined} value
 * @returns {Date|null}
 */
function toDate(value) {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date as a human-readable display string.
 *
 * By default the output uses the locale "en-US" and the UTC timezone so that
 * results are deterministic across environments.  Pass a valid IANA timezone
 * to render the date in a specific region.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {object}  [options]
 * @param {string}  [options.timezone='UTC']   IANA timezone identifier
 * @param {string}  [options.locale='en-US']   BCP-47 locale tag
 * @returns {string}  e.g. "Jul 29, 2025, 1:48 AM"  or '' on bad input
 *
 * @example
 * formatDisplay('2025-07-29T01:48:00.000Z');
 * // → "Jul 29, 2025, 1:48 AM"
 *
 * @example
 * formatDisplay('2025-07-29T01:48:00.000Z', { timezone: 'America/New_York' });
 * // → "Jul 28, 2025, 9:48 PM"
 */
export function formatDisplay(value, { timezone = 'UTC', locale = 'en-US' } = {}) {
  const d = toDate(value);
  if (!d) return INVALID_DATE_FALLBACK;

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    // Unknown timezone or unsupported locale — fall back to UTC
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  }
}

/**
 * Format a date as a YYYY-MM-DD calendar string (ISO 8601 date portion).
 *
 * The date parts are taken from the given timezone so that 2025-07-29T00:30:00Z
 * in UTC remains "2025-07-29" but becomes "2025-07-28" in America/New_York.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {object} [options]
 * @param {string} [options.timezone='UTC']  IANA timezone identifier
 * @returns {string}  "YYYY-MM-DD" or '' on bad input
 *
 * @example
 * formatYMD('2025-07-29T01:48:00.000Z');
 * // → "2025-07-29"
 */
export function formatYMD(value, { timezone = 'UTC' } = {}) {
  const d = toDate(value);
  if (!d) return INVALID_DATE_FALLBACK;

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      // en-CA produces YYYY-MM-DD natively
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // en-CA always returns "YYYY-MM-DD"
    return formatter.format(d);
  } catch {
    // Fallback: extract parts directly in UTC
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Format a date as a relative human-readable string.
 *
 * Uses `Intl.RelativeTimeFormat` when available (Node 14+) so that the output
 * is locale-aware.  Falls back to a simple English string on older runtimes.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {object} [options]
 * @param {string} [options.locale='en-US']   BCP-47 locale tag
 * @param {Date|number} [options.now=Date.now()] Reference point for "now"
 * @returns {string}  e.g. "3 minutes ago", "just now", "in 2 days"  or ''
 *
 * @example
 * formatRelative(Date.now() - 90_000);
 * // → "2 minutes ago"
 */
export function formatRelative(value, { locale = 'en-US', now = Date.now() } = {}) {
  const d = toDate(value);
  if (!d) return INVALID_DATE_FALLBACK;

  const diffMs = d.getTime() - (now instanceof Date ? now.getTime() : now);
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  // "just now" band: within 10 seconds in either direction
  if (absSec < 10) return 'just now';

  const sign = diffSec < 0 ? -1 : 1;

  if (absSec < 60) return fmt(locale, sign * absSec, 'second');
  if (absSec < 3600) return fmt(locale, sign * Math.round(absSec / 60), 'minute');
  if (absSec < 86400) return fmt(locale, sign * Math.round(absSec / 3600), 'hour');
  if (absSec < 2592000) return fmt(locale, sign * Math.round(absSec / 86400), 'day');
  if (absSec < 31536000) return fmt(locale, sign * Math.round(absSec / 2592000), 'month');
  return fmt(locale, sign * Math.round(absSec / 31536000), 'year');
}

/**
 * @param {string} locale
 * @param {number} value   positive = future, negative = past
 * @param {Intl.RelativeTimeFormatUnit} unit
 * @returns {string}
 */
function fmt(locale, value, unit) {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(value, unit);
  } catch {
    // Minimal English fallback
    const abs = Math.abs(value);
    const label = abs === 1 ? unit : `${unit}s`;
    return value < 0 ? `${abs} ${label} ago` : `in ${abs} ${label}`;
  }
}

/**
 * Format a timestamp to a display string in a specific timezone.
 *
 * Convenience wrapper combining `formatDisplay` with a fixed `timezone`.
 *
 * @param {Date|string|number|null|undefined} value
 * @param {string} timezone   IANA identifier, e.g. "America/New_York"
 * @returns {string}
 */
export function formatInTimezone(value, timezone) {
  return formatDisplay(value, { timezone });
}

export default {
  formatDisplay,
  formatYMD,
  formatRelative,
  formatInTimezone,
  INVALID_DATE_FALLBACK,
};
