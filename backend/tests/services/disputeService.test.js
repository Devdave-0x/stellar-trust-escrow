import disputeService, { isNil, getDisputeEmptyState, validateDisputeInput } from '../../services/disputeService.js';

describe('disputeService null/undefined checks (#454)', () => {
  it('consistently identifies null and undefined as nil', () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    expect(isNil(0)).toBe(false);
    expect(isNil('')).toBe(false);
    expect(isNil(false)).toBe(false);
  });

  it('handles null and undefined queries consistently in getDisputeEmptyState', () => {
    expect(getDisputeEmptyState(null)).toEqual(getDisputeEmptyState(undefined));
  });

  it('throws on null or undefined input in validateDisputeInput', () => {
    expect(() => validateDisputeInput(null, 'reason')).toThrow();
    expect(() => validateDisputeInput(123, undefined)).toThrow();
    expect(validateDisputeInput(123, 'valid reason')).toBe(true);
  });
});
