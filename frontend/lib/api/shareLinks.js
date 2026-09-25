import { shareLinkResolveResponseSchema } from '../../../shared/schemas/shareLink.js';

/** Thrown when a share link cannot be resolved; `status` is the HTTP status (0 for a bad payload). */
export class ShareLinkError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ShareLinkError';
    this.status = status;
  }
}

/**
 * Resolve a public escrow share link.
 *
 * The response is validated against the schema the backend validates with,
 * so a shape mismatch surfaces here as a ShareLinkError instead of as
 * undefined fields deep in the UI. Dates are returned as ISO strings.
 *
 * @param {string} token
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<import('../../../shared/types/shareLink').ShareLinkResolveResponse>}
 */
export async function resolveShareLink(token, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`/api/share/${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const fallback = res.status === 410 ? 'Share link has expired' : 'Share link not found';
    throw new ShareLinkError(body?.error ?? fallback, res.status);
  }

  const parsed = shareLinkResolveResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ShareLinkError('Share link response has an unexpected shape', 0);
  }
  return parsed.data;
}
