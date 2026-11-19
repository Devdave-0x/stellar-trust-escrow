import { describe, expect, it } from '@jest/globals';
import { validateQuoteFreshness } from '../services/priceOracleService.js';

describe('oracle quote freshness — issue 914', () => {
  const now = Date.parse('2026-01-01T00:00:30.000Z');
  it('rejects stale quotes', () => {
    const result = validateQuoteFreshness({ quotedAt: '2026-01-01T00:00:00.000Z' }, now);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('ORACLE_QUOTE_STALE');
  });

  it('accepts fresh quotes', () => {
    const result = validateQuoteFreshness({ quotedAt: '2026-01-01T00:00:25.000Z' }, now);
    expect(result.ok).toBe(true);
  });
});