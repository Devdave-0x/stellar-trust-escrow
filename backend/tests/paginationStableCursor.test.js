import { describe, expect, it } from '@jest/globals';
import { buildStableCursorWhere, encodeCursor } from '../lib/pagination.js';

describe('stable pagination tie-breaker — issue 915', () => {
  it('builds composite filters with id tie-breaker', () => {
    const cursor = encodeCursor({
      id: '42',
      sortField: 'createdAt',
      sortValue: '2026-01-01T00:00:00.000Z',
      dir: 'desc',
    });
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const where = buildStableCursorWhere(parsed, 'createdAt', 'desc', 'id');
    expect(where.OR).toHaveLength(2);
  });
});