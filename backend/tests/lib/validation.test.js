/**
 * Tests for the shared Stellar transaction hash validator.
 *
 * The validator lives in /shared/validation.js and is consumed by both
 * the backend (monitor records) and the frontend (UI links).
 */

import { isValidStellarTransactionHash } from '../../../shared/validation.js';

const VALID_HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

describe('isValidStellarTransactionHash', () => {
  it('accepts a 64-character lowercase hex string', () => {
    expect(isValidStellarTransactionHash(VALID_HASH)).toBe(true);
  });

  it('accepts an all-zero hash', () => {
    expect(isValidStellarTransactionHash('0'.repeat(64))).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidStellarTransactionHash(`  ${VALID_HASH}  `)).toBe(true);
    expect(isValidStellarTransactionHash(`\n${VALID_HASH}\n`)).toBe(true);
  });

  it('rejects a 63-character string', () => {
    expect(isValidStellarTransactionHash(VALID_HASH.slice(0, 63))).toBe(false);
  });

  it('rejects a 65-character string', () => {
    expect(isValidStellarTransactionHash(`${VALID_HASH}a`)).toBe(false);
  });

  it('rejects uppercase hex characters', () => {
    expect(isValidStellarTransactionHash(VALID_HASH.toUpperCase())).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(isValidStellarTransactionHash('g'.repeat(64))).toBe(false);
    expect(
      isValidStellarTransactionHash('z1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'),
    ).toBe(false);
  });

  it('rejects a hash with a 0x prefix', () => {
    expect(isValidStellarTransactionHash(`0x${VALID_HASH}`)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidStellarTransactionHash('')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidStellarTransactionHash(null)).toBe(false);
    expect(isValidStellarTransactionHash(undefined)).toBe(false);
    expect(isValidStellarTransactionHash(123456)).toBe(false);
    expect(isValidStellarTransactionHash({})).toBe(false);
  });
});
