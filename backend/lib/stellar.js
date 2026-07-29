/**
 * Stellar address validation utility.
 *
 * Wraps StrKey.isValidEd25519PublicKey so every module that needs to
 * validate a user-supplied Stellar address imports from a single place
 * instead of reaching into the SDK directly.  This also makes the validation
 * easy to mock in tests.
 *
 * Valid Stellar addresses are:
 *  - G-prefixed Ed25519 public keys in Stellar's base32 encoding
 *  - Exactly 56 characters long
 *  - Pass the StrKey checksum
 *
 * M-addresses (muxed accounts) look similar but are NOT accepted here because
 * only vanilla Ed25519 public keys can own on-chain escrow contracts.
 *
 * @module lib/stellar
 */

import { StrKey } from '@stellar/stellar-sdk';

/**
 * Returns true iff `address` is a valid Stellar Ed25519 public key (G-address).
 *
 * Never throws — invalid input (null, undefined, wrong type) returns false.
 *
 * @param {unknown} address
 * @returns {boolean}
 */
export function isValidStellarAddress(address) {
  if (!address || typeof address !== 'string') return false;
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

/**
 * Asserts that `address` is a valid Stellar G-address.
 * Throws a descriptive `Error` if it is not, so callers can surface a clear
 * 400 message to clients.
 *
 * @param {unknown} address
 * @param {string} [fieldName='address'] — field label used in the error message
 * @throws {Error} if the address is invalid
 */
export function assertValidStellarAddress(address, fieldName = 'address') {
  if (!isValidStellarAddress(address)) {
    throw Object.assign(
      new Error(`Invalid Stellar address for field '${fieldName}': ${String(address)}`),
      { statusCode: 400, code: 'INVALID_STELLAR_ADDRESS' },
    );
  }
}

export default { isValidStellarAddress, assertValidStellarAddress };
