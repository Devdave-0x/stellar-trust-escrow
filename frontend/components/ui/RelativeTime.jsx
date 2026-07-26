/**
 * RelativeTime Component
 *
 * Accepts an ISO timestamp and renders it as relative text (e.g. "2 hours ago").
 * Uses Intl.RelativeTimeFormat for locale-aware output.
 * Auto-updates every 60 seconds.
 * Shows absolute date in a tooltip on hover.
 * Falls back to absolute date for timestamps older than 7 days.
 *
 * @param {object}   props
 * @param {string}   props.timestamp  - ISO 8601 timestamp string
 * @param {string}   [props.className] - Additional classes on the wrapper span
 * @param {string}   [props.locale]    - BCP 47 locale tag (default: browser default)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pick the best unit and value for Intl.RelativeTimeFormat.
 */
function getRelativeTimeValue(date) {
  const diffMs = date.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) {
    return { value: diffSeconds, unit: 'second' };
  }

  const absMinutes = Math.floor(absSeconds / 60);
  if (absMinutes < 60) {
    return { value: diffSeconds < 0 ? -absMinutes : absMinutes, unit: 'minute' };
  }

  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) {
    return { value: diffSeconds < 0 ? -absHours : absHours, unit: 'hour' };
  }

  const absDays = Math.floor(absHours / 24);
  return { value: diffSeconds < 0 ? -absDays : absDays, unit: 'day' };
}

function formatAbsolute(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RelativeTime({ timestamp, className, locale }) {
  const date = new Date(timestamp);
  const [now, setNow] = useState(() => Date.now());
  const isOlderThan7Days = now - date.getTime() > SEVEN_DAYS_MS;

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const absoluteText = formatAbsolute(date);

  if (isNaN(date.getTime())) {
    return (
      <span className={className} title="Invalid date">
        Invalid date
      </span>
    );
  }

  // Fall back to absolute date for timestamps older than 7 days
  if (isOlderThan7Days) {
    return (
      <span className={className} title={absoluteText}>
        {absoluteText}
      </span>
    );
  }

  const { value, unit } = getRelativeTimeValue(date);

  let relativeText;
  // Use "just now" for timestamps within 10 seconds
  const absSeconds = Math.abs(Math.round((date.getTime() - now) / 1000));
  if (absSeconds < 10) {
    relativeText = 'just now';
  } else {
    try {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      relativeText = rtf.format(value, unit);
    } catch {
      // Fallback in case of invalid locale
      relativeText = formatAbsolute(date);
    }
  }

  return (
    <span className={className} title={absoluteText}>
      {relativeText}
    </span>
  );
}
