/**
 * Share-link deep links: stellartrustescrow://share/<token> and
 * https://<web>/share/<token> both map to the share screen.
 *
 * Tokens are 24 random bytes in base64url (32 chars) — anything outside a
 * conservative base64url shape is rejected before any network call.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isValidShareToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Extract a valid share token from a deep link or web share URL, else null. */
export function parseShareLink(url: string): string | null {
  const match = /^(?:stellartrustescrow:\/\/|https?:\/\/[^/]+\/)share\/([^/?#]+)/.exec(url);
  if (!match) return null;
  let token: string;
  try {
    token = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return isValidShareToken(token) ? token : null;
}
