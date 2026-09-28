/**
 * Shared Stellar field validators.
 *
 * Single source of truth for Stellar format checks used across the
 * frontend (UI links, payment flows) and the backend (monitor records,
 * payment webhooks). This module is intentionally plain ESM JavaScript
 * with no runtime dependencies so it can be imported directly from both
 * the Node.js backend and the browser frontend without a build step.
 *
 * @module shared/validation
 */

/** Matches a valid Stellar transaction hash: 64 lowercase hex characters. */
const STELLAR_TRANSACTION_HASH_RE = /^[a-f0-9]{64}$/;

/**
 * Returns true if the given string is a valid Stellar transaction hash.
 *
 * A Stellar transaction hash is the SHA-256 digest of the transaction
 * envelope, conventionally serialised as exactly 64 lowercase hex
 * characters. Trims surrounding whitespace before checking so copy-paste
 * errors are handled gracefully.
 *
 * @param {unknown} hash
 * @returns {boolean}
 */
export function isValidStellarTransactionHash(hash) {
  if (typeof hash !== 'string') return false;
  return STELLAR_TRANSACTION_HASH_RE.test(hash.trim());
}
