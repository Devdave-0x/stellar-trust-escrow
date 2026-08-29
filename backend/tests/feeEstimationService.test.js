/**
 * Fee Estimation Service — regression tests
 *
 * Motivating case: `estimateFee`/`resolveFeePercent` previously used a mix
 * of `=== undefined`, `== null`, and truthy checks. A tenant fee override
 * of `0` (fee waived) was falsy and got silently replaced by the default
 * fee percent, and an `amount: 0` escrow was rejected as "missing" by a
 * truthy check. Both are legitimate values, not "absent" values.
 */

import { estimateFee, resolveFeePercent, DEFAULT_PLATFORM_FEE_PERCENT } from '../services/feeEstimationService.js';

describe('feeEstimationService', () => {
  describe('resolveFeePercent', () => {
    it('honors an explicit 0% override instead of falling back to the default', () => {
      expect(resolveFeePercent(0)).toBe(0);
    });

    it('falls back to the default when the override is null or undefined', () => {
      expect(resolveFeePercent(null)).toBe(DEFAULT_PLATFORM_FEE_PERCENT);
      expect(resolveFeePercent(undefined)).toBe(DEFAULT_PLATFORM_FEE_PERCENT);
    });

    it('preserves a positive override', () => {
      expect(resolveFeePercent(2.5)).toBe(2.5);
    });
  });

  describe('estimateFee', () => {
    it('accepts amount: 0 as a valid (not missing) input', () => {
      const result = estimateFee(0);
      expect(result.amount).toBe(0);
      expect(result.total).toBeGreaterThanOrEqual(0);
    });

    it('throws only when amount is null or undefined', () => {
      expect(() => estimateFee(null)).toThrow(/required/);
      expect(() => estimateFee(undefined)).toThrow(/required/);
    });

    it('rejects negative amounts', () => {
      expect(() => estimateFee(-5)).toThrow(/non-negative/);
    });

    it('applies a 0% platformFeePercent override without treating it as unset', () => {
      const result = estimateFee(100, { platformFeePercent: 0 });
      expect(result.platformFee).toBe(0);
    });

    it('computes standard fees for a typical amount', () => {
      const result = estimateFee(1000, { platformFeePercent: 1.5, networkFeeStroops: 100 });
      expect(result.platformFee).toBeCloseTo(15, 5);
      expect(result.total).toBeCloseTo(1015.00001, 5);
    });
  });
});
