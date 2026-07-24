/**
 * IANA timezone utilities.
 *
 * Uses the built-in Intl.DateTimeFormat to validate timezone identifiers
 * without any external dependency — all IANA timezones supported by the
 * V8 ICU data are accepted.
 */

/**
 * Returns true when `tz` is a valid IANA timezone identifier on this runtime.
 * @param {string} tz
 * @returns {boolean}
 */
export function isValidTimezone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert an ISO-8601 date string (or Date object) to the user's local time,
 * returning an ISO string with the UTC offset appended.
 *
 * @param {Date|string} date
 * @param {string} timezone — IANA identifier
 * @returns {string}
 */
export function toLocalISOString(date, timezone) {
  const d = date instanceof Date ? date : new Date(date);
  if (!isValidTimezone(timezone)) return d.toISOString();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  });

  const parts = Object.fromEntries(formatter.formatToParts(d).map((p) => [p.type, p.value]));
  const offset = parts.timeZoneName?.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}
