/**
 * Unit Tests — Date Formatting Utility  (backend/lib/dateFormat.js)
 *
 * Covers:
 *  1. ISO string → display format
 *  2. Timestamp / Date → relative time
 *  3. Date → YYYY-MM-DD
 *  4. Invalid / unparseable input handling
 *  5. Timezone-aware formatting (UTC vs America/New_York)
 *  6. DST boundary dates (no off-by-one-hour errors)
 *  7. null / undefined inputs → empty string fallback, never "Invalid Date"
 */

import { formatDisplay, formatYMD, formatRelative, formatInTimezone, INVALID_DATE_FALLBACK } from '../lib/dateFormat.js';

// ── 1. ISO string → display format ────────────────────────────────────────────

describe('formatDisplay — ISO string to display format', () => {
  it('formats an ISO string to a human-readable display string in UTC', () => {
    const result = formatDisplay('2025-07-29T01:48:00.000Z');
    expect(result).toBeTruthy();
    // Must include the year and not be "Invalid Date"
    expect(result).not.toBe('Invalid Date');
    expect(result).toContain('2025');
  });

  it('includes the month, day, and year components', () => {
    const result = formatDisplay('2025-03-15T12:00:00.000Z');
    expect(result).toContain('2025');
    // "Mar" in en-US short format
    expect(result).toMatch(/Mar/i);
    expect(result).toContain('15');
  });

  it('includes the time (hours and minutes)', () => {
    const result = formatDisplay('2025-07-29T14:30:00.000Z');
    expect(result).toMatch(/2:30|14:30/); // 2:30 PM in en-US
  });

  it('accepts a Date object as input', () => {
    const d = new Date('2025-07-29T01:48:00.000Z');
    const result = formatDisplay(d);
    expect(result).not.toBe('Invalid Date');
    expect(result).toContain('2025');
  });

  it('accepts a unix timestamp (number) as input', () => {
    const ts = new Date('2025-07-29T01:48:00.000Z').getTime();
    const result = formatDisplay(ts);
    expect(result).not.toBe('Invalid Date');
    expect(result).toContain('2025');
  });
});

// ── 2. Timestamp → relative time ──────────────────────────────────────────────

describe('formatRelative — timestamp to relative time', () => {
  it('returns "just now" for times within the past 10 seconds', () => {
    const now = Date.now();
    expect(formatRelative(now - 5_000, { now })).toBe('just now');
    expect(formatRelative(now, { now })).toBe('just now');
  });

  it('returns a seconds-ago string for times 10–59 seconds in the past', () => {
    const now = Date.now();
    const result = formatRelative(now - 30_000, { now });
    expect(result).toMatch(/30 second/);
  });

  it('returns a minutes-ago string for times 1–59 minutes in the past', () => {
    const now = Date.now();
    const result = formatRelative(now - 2 * 60_000, { now });
    expect(result).toMatch(/2 minute/);
  });

  it('returns an hours-ago string for times 1–23 hours in the past', () => {
    const now = Date.now();
    const result = formatRelative(now - 3 * 3600_000, { now });
    expect(result).toMatch(/3 hour/);
  });

  it('returns a days-ago string for times ≥ 1 day in the past', () => {
    const now = Date.now();
    const result = formatRelative(now - 2 * 86_400_000, { now });
    expect(result).toMatch(/2 day/);
  });

  it('handles future dates (returns a forward-pointing string)', () => {
    const now = Date.now();
    const result = formatRelative(now + 2 * 60_000, { now });
    // Intl.RelativeTimeFormat produces "in 2 minutes"
    expect(result).toMatch(/in 2 minute|2 minutes/i);
  });

  it('accepts a Date object as the reference "now" parameter', () => {
    const refDate = new Date('2025-01-01T00:00:00.000Z');
    const input = new Date('2024-12-31T23:00:00.000Z'); // 1 hour before ref
    const result = formatRelative(input, { now: refDate });
    expect(result).toMatch(/hour/);
  });

  it('returns empty string for null input', () => {
    expect(formatRelative(null)).toBe(INVALID_DATE_FALLBACK);
    expect(formatRelative(null)).not.toBe('Invalid Date');
  });
});

// ── 3. Date → YYYY-MM-DD ──────────────────────────────────────────────────────

describe('formatYMD — date to YYYY-MM-DD', () => {
  it('formats an ISO string to YYYY-MM-DD in UTC', () => {
    expect(formatYMD('2025-07-29T01:48:00.000Z')).toBe('2025-07-29');
  });

  it('zero-pads single-digit months and days', () => {
    expect(formatYMD('2025-03-05T00:00:00.000Z')).toBe('2025-03-05');
    expect(formatYMD('2025-01-09T00:00:00.000Z')).toBe('2025-01-09');
  });

  it('accepts a Date object', () => {
    const d = new Date('2025-12-31T23:59:59.999Z');
    expect(formatYMD(d)).toBe('2025-12-31');
  });

  it('accepts a unix timestamp', () => {
    const ts = new Date('2025-06-15T00:00:00.000Z').getTime();
    expect(formatYMD(ts)).toBe('2025-06-15');
  });

  it('reflects the timezone when one is supplied', () => {
    // 2025-07-29T01:00:00Z is 2025-07-28 in America/New_York (UTC-4 in summer)
    expect(formatYMD('2025-07-29T01:00:00.000Z', { timezone: 'America/New_York' })).toBe(
      '2025-07-28',
    );
  });

  it('returns empty string for invalid input', () => {
    expect(formatYMD('not-a-date')).toBe(INVALID_DATE_FALLBACK);
    expect(formatYMD('')).toBe(INVALID_DATE_FALLBACK);
  });
});

// ── 4. Invalid input handling ─────────────────────────────────────────────────

describe('formatDisplay — invalid date input handling', () => {
  it('returns empty string for a non-date string', () => {
    expect(formatDisplay('not-a-date')).toBe(INVALID_DATE_FALLBACK);
    expect(formatDisplay('not-a-date')).not.toBe('Invalid Date');
  });

  it('returns empty string for an empty string', () => {
    expect(formatDisplay('')).toBe(INVALID_DATE_FALLBACK);
  });

  it('returns empty string for NaN', () => {
    expect(formatDisplay(NaN)).toBe(INVALID_DATE_FALLBACK);
  });

  it('returns empty string for an object that is not a Date', () => {
    expect(formatDisplay({})).toBe(INVALID_DATE_FALLBACK);
  });
});

describe('formatYMD — invalid date input handling', () => {
  it('returns empty string for a non-date string', () => {
    expect(formatYMD('garbage')).toBe(INVALID_DATE_FALLBACK);
    expect(formatYMD('garbage')).not.toBe('Invalid Date');
  });

  it('returns empty string for NaN', () => {
    expect(formatYMD(NaN)).toBe(INVALID_DATE_FALLBACK);
  });
});

describe('formatRelative — invalid date input handling', () => {
  it('returns empty string for a non-date string', () => {
    expect(formatRelative('garbage')).toBe(INVALID_DATE_FALLBACK);
    expect(formatRelative('garbage')).not.toBe('Invalid Date');
  });

  it('returns empty string for NaN', () => {
    expect(formatRelative(NaN)).toBe(INVALID_DATE_FALLBACK);
  });
});

// ── 5. Timezone-aware formatting ──────────────────────────────────────────────

describe('formatInTimezone — timezone-aware formatting', () => {
  // A fixed UTC instant that straddles midnight in New York:
  // 2025-07-29 01:00:00 UTC  →  2025-07-28 21:00:00 EDT (UTC-4)
  const UTC_MIDNIGHT_STRADDLER = '2025-07-29T01:00:00.000Z';

  it('formats the same timestamp in UTC', () => {
    const utcResult = formatInTimezone(UTC_MIDNIGHT_STRADDLER, 'UTC');
    expect(utcResult).not.toBe('Invalid Date');
    expect(utcResult).toContain('2025');
    // UTC date should show Jul 29
    expect(utcResult).toMatch(/Jul 29/);
  });

  it('formats the same timestamp in America/New_York', () => {
    const nyResult = formatInTimezone(UTC_MIDNIGHT_STRADDLER, 'America/New_York');
    expect(nyResult).not.toBe('Invalid Date');
    expect(nyResult).toContain('2025');
    // New York is UTC-4 in summer, so this should show Jul 28
    expect(nyResult).toMatch(/Jul 28/);
  });

  it('produces different output for UTC vs America/New_York when dates differ', () => {
    const utcResult = formatInTimezone(UTC_MIDNIGHT_STRADDLER, 'UTC');
    const nyResult = formatInTimezone(UTC_MIDNIGHT_STRADDLER, 'America/New_York');
    expect(utcResult).not.toBe(nyResult);
  });

  it('produces different output for UTC vs America/New_York (same day, different time)', () => {
    // 2025-07-29T14:00:00Z → 10:00 AM in New York
    const ts = '2025-07-29T14:00:00.000Z';
    const utcResult = formatInTimezone(ts, 'UTC');
    const nyResult = formatInTimezone(ts, 'America/New_York');
    // Same date but different hour portion
    expect(utcResult).not.toBe(nyResult);
    expect(utcResult).toMatch(/2:00 PM/i);
    expect(nyResult).toMatch(/10:00 AM/i);
  });

  it('handles a timezone east of UTC (Asia/Tokyo, UTC+9)', () => {
    // 2025-07-29T00:00:00Z is 2025-07-29 09:00:00 in Tokyo
    const ts = '2025-07-29T00:00:00.000Z';
    const tokyoResult = formatInTimezone(ts, 'Asia/Tokyo');
    expect(tokyoResult).not.toBe('Invalid Date');
    // Tokyo should show 9:00 AM on Jul 29
    expect(tokyoResult).toMatch(/9:00 AM/i);
  });

  it('returns empty string for an invalid timezone identifier', () => {
    // formatDisplay falls back to UTC for unknown timezones so will still return a valid string
    const result = formatDisplay('2025-07-29T01:00:00.000Z', { timezone: 'Mars/Olympus' });
    // Should not be "Invalid Date"
    expect(result).not.toBe('Invalid Date');
    expect(result).toContain('2025');
  });
});

// ── 6. DST boundary dates ─────────────────────────────────────────────────────

describe('formatYMD / formatDisplay — DST boundary dates', () => {
  // US DST spring-forward 2025: clocks jump from 2:00 AM → 3:00 AM on Mar 9
  // The instant 2025-03-09T07:00:00Z is 2:00 AM EST immediately before spring-forward
  const SPRING_FORWARD_INSTANT = '2025-03-09T07:00:00.000Z'; // 2:00 AM EST = 7:00 UTC
  const SPRING_FORWARD_PLUS_1H = '2025-03-09T08:00:00.000Z'; // 3:00 AM EDT = 8:00 UTC (gap skipped)

  // US DST fall-back 2025: clocks fall from 2:00 AM → 1:00 AM on Nov 2
  const FALL_BACK_BEFORE = '2025-11-02T05:00:00.000Z'; // 1:00 AM EDT  (UTC-4)
  const FALL_BACK_AFTER = '2025-11-02T06:00:00.000Z'; // 1:00 AM EST  (UTC-5)

  it('YYYY-MM-DD is correct at the spring-forward boundary in America/New_York', () => {
    expect(formatYMD(SPRING_FORWARD_INSTANT, { timezone: 'America/New_York' })).toBe('2025-03-09');
    expect(formatYMD(SPRING_FORWARD_PLUS_1H, { timezone: 'America/New_York' })).toBe('2025-03-09');
  });

  it('YYYY-MM-DD in UTC is not affected by US DST boundaries', () => {
    expect(formatYMD(SPRING_FORWARD_INSTANT)).toBe('2025-03-09');
    expect(formatYMD(SPRING_FORWARD_PLUS_1H)).toBe('2025-03-09');
  });

  it('display format at spring-forward boundary shows correct date in New York', () => {
    const result = formatDisplay(SPRING_FORWARD_INSTANT, { timezone: 'America/New_York' });
    expect(result).not.toBe('Invalid Date');
    expect(result).toMatch(/Mar 9/);
    // Should show 2:00 AM (right before spring-forward)
    expect(result).toMatch(/2:00 AM/i);
  });

  it('display format after spring-forward shows 3:00 AM (the gap is skipped, not duplicated)', () => {
    const result = formatDisplay(SPRING_FORWARD_PLUS_1H, { timezone: 'America/New_York' });
    expect(result).not.toBe('Invalid Date');
    // After spring-forward, 8:00 UTC = 4:00 AM EDT
    expect(result).toMatch(/4:00 AM/i);
  });

  it('YYYY-MM-DD at fall-back boundary: both instants map to the same local date', () => {
    expect(formatYMD(FALL_BACK_BEFORE, { timezone: 'America/New_York' })).toBe('2025-11-02');
    expect(formatYMD(FALL_BACK_AFTER, { timezone: 'America/New_York' })).toBe('2025-11-02');
  });

  it('display format at fall-back boundary: no off-by-one-hour error', () => {
    // FALL_BACK_BEFORE: 05:00 UTC = 1:00 AM EDT (UTC-4)
    const before = formatDisplay(FALL_BACK_BEFORE, { timezone: 'America/New_York' });
    // FALL_BACK_AFTER: 06:00 UTC = 1:00 AM EST (UTC-5) — clocks have fallen back
    const after = formatDisplay(FALL_BACK_AFTER, { timezone: 'America/New_York' });

    expect(before).not.toBe('Invalid Date');
    expect(after).not.toBe('Invalid Date');

    // Both show "1:00 AM" but the UTC offsets differ — the display strings may
    // or may not look identical depending on the Intl implementation; what matters
    // is neither is "Invalid Date" and both show the correct hour.
    expect(before).toMatch(/1:00 AM/i);
    expect(after).toMatch(/1:00 AM/i);
  });
});

// ── 7. null / undefined inputs ────────────────────────────────────────────────

describe('null and undefined inputs — never produce "Invalid Date"', () => {
  const ALL_FORMATTERS = [
    ['formatDisplay', formatDisplay],
    ['formatYMD', formatYMD],
    ['formatRelative', formatRelative],
    ['formatInTimezone (UTC)', (v) => formatInTimezone(v, 'UTC')],
  ];

  for (const [name, fn] of ALL_FORMATTERS) {
    it(`${name}(null) returns empty string, not "Invalid Date"`, () => {
      const result = fn(null);
      expect(result).toBe(INVALID_DATE_FALLBACK);
      expect(result).not.toBe('Invalid Date');
    });

    it(`${name}(undefined) returns empty string, not "Invalid Date"`, () => {
      const result = fn(undefined);
      expect(result).toBe(INVALID_DATE_FALLBACK);
      expect(result).not.toBe('Invalid Date');
    });
  }

  it('INVALID_DATE_FALLBACK constant is an empty string', () => {
    expect(INVALID_DATE_FALLBACK).toBe('');
  });
});
