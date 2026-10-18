import { describe, expect, it } from '@jest/globals';
import { readIdempotencyConfig } from '../api/middleware/idempotency.js';

describe('idempotency configuration', () => {
  it('accepts bounded TTL settings', () => {
    expect(
      readIdempotencyConfig({ IDEMPOTENCY_TTL_SECONDS: '3600', IDEMPOTENCY_LOCK_TTL_SECONDS: '15' }),
    ).toEqual({ responseTtlSeconds: 3600, lockTtlSeconds: 15 });
  });

  it('rejects malformed TTL settings', () => {
    expect(() => readIdempotencyConfig({ IDEMPOTENCY_TTL_SECONDS: 'invalid' })).toThrow(
      'IDEMPOTENCY_TTL_SECONDS',
    );
  });

  it('rejects a lock TTL longer than the response TTL', () => {
    expect(() =>
      readIdempotencyConfig({ IDEMPOTENCY_TTL_SECONDS: '60', IDEMPOTENCY_LOCK_TTL_SECONDS: '60' }),
    ).toThrow('must be shorter');
  });
});
