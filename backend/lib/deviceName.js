/**
 * Derives a short, human-friendly device label from a User-Agent header
 * (e.g. "Chrome on macOS") for display in the session list.
 */

// Order matters: Edge/Chrome-based UAs also contain "Safari/", so check the
// more specific tokens first and leave Safari as the catch-all.
const BROWSER_PATTERNS = [
  [/edg\//i, 'Edge'],
  [/opr\//i, 'Opera'],
  [/crios\//i, 'Chrome'],
  [/fxios\//i, 'Firefox'],
  [/chrome\//i, 'Chrome'],
  [/firefox\//i, 'Firefox'],
  [/safari\//i, 'Safari'],
];

const OS_PATTERNS = [
  [/windows nt/i, 'Windows'],
  [/mac os x/i, 'macOS'],
  [/iphone/i, 'iPhone'],
  [/ipad/i, 'iPad'],
  [/android/i, 'Android'],
  [/linux/i, 'Linux'],
];

export function deviceNameFromUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'Unknown device';

  const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];

  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Unknown device';
}

export default { deviceNameFromUserAgent };
