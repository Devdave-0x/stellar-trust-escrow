/**
 * Unit tests for lib/pagination.js
 *
 * Covers:
 *  - parsePagination: defaults, custom page/limit, limit capping, negative/zero inputs
 *  - buildPaginatedResponse: correct total/page/pages/has_next/has_prev fields
 *  - encodeCursor / decodeCursor: round-trip, tampered, malformed, missing
 *  - parseCursorPagination: parses query, falls back to defaults, honours embedded cursor sort
 *  - buildPrismaFindArgs: no cursor / with cursor variants
 *  - buildCursorResponse: has_more, next_cursor, edge cases
 */

import {
  parsePagination,
  buildPaginatedResponse,
  encodeCursor,
  decodeCursor,
  parseCursorPagination,
  buildPrismaFindArgs,
  buildCursorResponse,
  paginationDocs,
} from '../lib/pagination.js';

// ── parsePagination ───────────────────────────────────────────────────────────

describe('parsePagination', () => {
  it('returns default values for empty query', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('returns default values when called with no arguments', () => {
    expect(parsePagination()).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it('parses custom page and limit', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
    });
  });

  it('calculates skip as (page-1) * limit', () => {
    const result = parsePagination({ page: '5', limit: '7' });
    expect(result.skip).toBe((5 - 1) * 7);
  });

  it('caps limit at MAX_LIMIT (100)', () => {
    const result = parsePagination({ limit: '999' });
    expect(result.limit).toBe(100);
  });

  it('enforces minimum limit of 1 for a zero value', () => {
    const result = parsePagination({ limit: '0' });
    expect(result.limit).toBe(1);
  });

  it('enforces minimum limit of 1 for a negative value', () => {
    const result = parsePagination({ limit: '-5' });
    expect(result.limit).toBe(1);
  });

  it('enforces minimum page of 1 for page=0', () => {
    const result = parsePagination({ page: '0' });
    expect(result.page).toBe(1);
  });

  it('enforces minimum page of 1 for a negative page', () => {
    const result = parsePagination({ page: '-10' });
    expect(result.page).toBe(1);
  });

  it('handles non-numeric page string by falling back to default', () => {
    const result = parsePagination({ page: 'abc' });
    expect(result.page).toBe(1);
  });

  it('handles non-numeric limit string by falling back to default', () => {
    const result = parsePagination({ limit: 'xyz' });
    expect(result.limit).toBe(20);
  });

  it('handles numeric values (not strings)', () => {
    const result = parsePagination({ page: 2, limit: 50 });
    expect(result).toEqual({ page: 2, limit: 50, skip: 50 });
  });

  it('MAX_LIMIT is documented in paginationDocs', () => {
    expect(paginationDocs.maxLimit).toBe(100);
    expect(paginationDocs.defaultLimit).toBe(20);
    expect(paginationDocs.defaultPage).toBe(1);
  });
});

// ── buildPaginatedResponse ────────────────────────────────────────────────────

describe('buildPaginatedResponse', () => {
  it('returns all expected fields', () => {
    const result = buildPaginatedResponse(['a', 'b'], { page: 1, limit: 2, total: 2 });
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('totalPages');
    expect(result).toHaveProperty('hasNextPage');
    expect(result).toHaveProperty('hasPreviousPage');
  });

  it('first page of many: hasNextPage=true, hasPreviousPage=false', () => {
    const result = buildPaginatedResponse(['a', 'b'], { page: 1, limit: 2, total: 5 });
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(false);
  });

  it('last page: hasNextPage=false, hasPreviousPage=true', () => {
    const result = buildPaginatedResponse(['e'], { page: 3, limit: 2, total: 5 });
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(true);
  });

  it('middle page: hasNextPage=true, hasPreviousPage=true', () => {
    const result = buildPaginatedResponse(['c', 'd'], { page: 2, limit: 2, total: 5 });
    expect(result.hasNextPage).toBe(true);
    expect(result.hasPreviousPage).toBe(true);
  });

  it('single page: hasNextPage=false, hasPreviousPage=false', () => {
    const result = buildPaginatedResponse(['a'], { page: 1, limit: 20, total: 1 });
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(false);
  });

  it('empty result set: totalPages=0, both flags false', () => {
    const result = buildPaginatedResponse([], { page: 1, limit: 20, total: 0 });
    expect(result.totalPages).toBe(0);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(false);
  });

  it('computes totalPages correctly (ceiling division)', () => {
    // 5 items / 2 per page = 3 pages (ceil)
    expect(buildPaginatedResponse([], { page: 1, limit: 2, total: 5 }).totalPages).toBe(3);
    // 4 items / 2 per page = 2 pages (exact)
    expect(buildPaginatedResponse([], { page: 1, limit: 2, total: 4 }).totalPages).toBe(2);
    // 1 item / 20 per page = 1 page
    expect(buildPaginatedResponse([], { page: 1, limit: 20, total: 1 }).totalPages).toBe(1);
  });

  it('passes data through unchanged', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = buildPaginatedResponse(data, { page: 1, limit: 20, total: 2 });
    expect(result.data).toBe(data);
  });

  it('reflects the requested page and limit in the response', () => {
    const result = buildPaginatedResponse([], { page: 7, limit: 15, total: 100 });
    expect(result.page).toBe(7);
    expect(result.limit).toBe(15);
    expect(result.total).toBe(100);
  });
});

// ── encodeCursor / decodeCursor ───────────────────────────────────────────────

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a cursor payload', () => {
    const payload = { id: '42', sortField: 'createdAt', sortValue: '2025-01-01T00:00:00Z', dir: 'desc' };
    const token = encodeCursor(payload);
    expect(typeof token).toBe('string');
    expect(decodeCursor(token)).toEqual(payload);
  });

  it('produces URL-safe base64 (no +, /, or = characters)', () => {
    const token = encodeCursor({ id: 'abc', sortField: 'createdAt', sortValue: null, dir: 'asc' });
    expect(token).not.toMatch(/[+/=]/);
  });

  it('returns null for null input', () => {
    expect(decodeCursor(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeCursor('')).toBeNull();
  });

  it('returns null for a non-string value', () => {
    expect(decodeCursor(42)).toBeNull();
  });

  it('returns null for a completely invalid base64 string', () => {
    expect(decodeCursor('!@#$%^&*()')).toBeNull();
  });

  it('returns null for a valid base64 that is not JSON', () => {
    const notJson = Buffer.from('hello world', 'utf8').toString('base64url');
    expect(decodeCursor(notJson)).toBeNull();
  });

  it('returns null for a valid base64 JSON that lacks required fields', () => {
    // Missing 'id', 'sortField', 'dir'
    const missingFields = Buffer.from(JSON.stringify({ only: 'this' }), 'utf8').toString('base64url');
    expect(decodeCursor(missingFields)).toBeNull();
  });

  it('preserves numeric id', () => {
    const payload = { id: 99, sortField: 'id', sortValue: 99, dir: 'asc' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('preserves Date sortValue stored as ISO string', () => {
    const iso = new Date('2025-06-15T12:00:00Z').toISOString();
    const payload = { id: '1', sortField: 'createdAt', sortValue: iso, dir: 'desc' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });
});

// ── parseCursorPagination ─────────────────────────────────────────────────────

describe('parseCursorPagination', () => {
  it('returns defaults when query is empty', () => {
    const result = parseCursorPagination({}, 'createdAt', 'desc');
    expect(result.take).toBe(20);
    expect(result.parsedCursor).toBeNull();
    expect(result.sortField).toBe('createdAt');
    expect(result.sortDir).toBe('desc');
  });

  it('parses limit from query', () => {
    const result = parseCursorPagination({ limit: '5' }, 'createdAt', 'desc');
    expect(result.take).toBe(5);
  });

  it('caps limit at MAX_LIMIT (100)', () => {
    const result = parseCursorPagination({ limit: '500' }, 'createdAt', 'desc');
    expect(result.take).toBe(100);
  });

  it('uses sortBy/sortOrder query params in the absence of a cursor', () => {
    const result = parseCursorPagination({ sortBy: 'totalAmount', sortOrder: 'asc' });
    expect(result.sortField).toBe('totalAmount');
    expect(result.sortDir).toBe('asc');
  });

  it('honours sort params embedded in cursor over query params', () => {
    const cursorPayload = { id: '5', sortField: 'totalAmount', sortValue: 100, dir: 'asc' };
    const cursor = encodeCursor(cursorPayload);
    // Pass conflicting query params — cursor should win
    const result = parseCursorPagination({ cursor, sortBy: 'createdAt', sortOrder: 'desc' });
    expect(result.sortField).toBe('totalAmount');
    expect(result.sortDir).toBe('asc');
    expect(result.parsedCursor).toEqual(cursorPayload);
  });

  it('returns null parsedCursor for a malformed cursor token', () => {
    const result = parseCursorPagination({ cursor: 'not-a-real-cursor' });
    expect(result.parsedCursor).toBeNull();
  });

  it('ignores whitespace-only cursor strings', () => {
    const result = parseCursorPagination({ cursor: '   ' });
    expect(result.parsedCursor).toBeNull();
  });
});

// ── buildPrismaFindArgs ───────────────────────────────────────────────────────

describe('buildPrismaFindArgs', () => {
  it('returns take + orderBy only when there is no cursor', () => {
    const args = buildPrismaFindArgs({
      parsedCursor: null,
      take: 10,
      sortField: 'createdAt',
      sortDir: 'desc',
    });
    expect(args).toEqual({ take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    expect(args.cursor).toBeUndefined();
    expect(args.skip).toBeUndefined();
  });

  it('returns simple orderBy when sortField === idField', () => {
    const args = buildPrismaFindArgs({
      parsedCursor: null,
      take: 5,
      sortField: 'id',
      sortDir: 'asc',
      idField: 'id',
    });
    expect(args.orderBy).toEqual({ id: 'asc' });
  });

  it('adds cursor + skip:1 when parsedCursor is present', () => {
    const parsedCursor = { id: '42', sortField: 'createdAt', sortValue: '2025-01-01', dir: 'desc' };
    const args = buildPrismaFindArgs({
      parsedCursor,
      take: 10,
      sortField: 'createdAt',
      sortDir: 'desc',
    });
    expect(args.cursor).toEqual({ id: '42' });
    expect(args.skip).toBe(1);
    expect(args.take).toBe(10);
  });

  it('respects a custom idField', () => {
    const parsedCursor = { id: 'uuid-1', sortField: 'createdAt', sortValue: null, dir: 'asc' };
    const args = buildPrismaFindArgs({
      parsedCursor,
      take: 5,
      sortField: 'createdAt',
      sortDir: 'asc',
      idField: 'uuid',
    });
    expect(args.cursor).toEqual({ uuid: 'uuid-1' });
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { uuid: 'asc' }]);
  });
});

// ── buildCursorResponse ───────────────────────────────────────────────────────

describe('buildCursorResponse', () => {
  const makeRow = (id, createdAt) => ({ id: String(id), createdAt });

  it('sets has_more=false and next_cursor=null when data length < take', () => {
    const data = [makeRow(1, '2025-01-01'), makeRow(2, '2025-01-02')];
    const result = buildCursorResponse(data, 10, 'id', 'createdAt', 'desc');
    expect(result.has_more).toBe(false);
    expect(result.next_cursor).toBeNull();
  });

  it('sets has_more=true and emits a non-null next_cursor when data.length === take', () => {
    const data = [makeRow(1, '2025-01-01'), makeRow(2, '2025-01-02')];
    const result = buildCursorResponse(data, 2, 'id', 'createdAt', 'desc');
    expect(result.has_more).toBe(true);
    expect(typeof result.next_cursor).toBe('string');
    expect(result.next_cursor.length).toBeGreaterThan(0);
  });

  it('next_cursor decodes to a payload containing the last row id', () => {
    const data = [makeRow(10, '2025-06-01'), makeRow(20, '2025-06-02')];
    const result = buildCursorResponse(data, 2, 'id', 'createdAt', 'asc');
    const decoded = decodeCursor(result.next_cursor);
    expect(decoded.id).toBe('20');
    expect(decoded.sortField).toBe('createdAt');
    expect(decoded.dir).toBe('asc');
  });

  it('converts Date sortValue to ISO string in cursor', () => {
    const date = new Date('2025-03-15T08:00:00Z');
    const data = [{ id: '1', createdAt: date }];
    const result = buildCursorResponse(data, 1, 'id', 'createdAt', 'desc');
    const decoded = decodeCursor(result.next_cursor);
    expect(decoded.sortValue).toBe(date.toISOString());
  });

  it('passes data through unchanged', () => {
    const data = [makeRow(1, null)];
    const result = buildCursorResponse(data, 5, 'id', 'createdAt', 'asc');
    expect(result.data).toBe(data);
  });

  it('handles empty data gracefully', () => {
    const result = buildCursorResponse([], 10, 'id', 'createdAt', 'desc');
    expect(result.has_more).toBe(false);
    expect(result.next_cursor).toBeNull();
    expect(result.data).toEqual([]);
  });

  it('cursor next_cursor is URL-safe (no +, /, or = characters)', () => {
    const data = [makeRow(999, '2025-01-01')];
    const result = buildCursorResponse(data, 1, 'id', 'createdAt', 'desc');
    expect(result.next_cursor).not.toMatch(/[+/=]/);
  });
});
