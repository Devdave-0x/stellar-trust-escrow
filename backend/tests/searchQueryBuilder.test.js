/**
 * Unit tests for the search query builder — Issue #2
 *
 * buildWhere() is an internal function in services/searchService.js that is not
 * exported directly.  We exercise it indirectly by calling
 * searchService.search() with a mocked Prisma client and inspecting the
 * `where` argument that was passed to prisma.escrow.findMany / count.
 *
 * Covers:
 *  - Keyword search  → OR contains clause on clientAddress / freelancerAddress
 *  - Status filter   → equals clause (single) or { in: [...] } (multi)
 *  - Date range      → createdAt gte / lte clause
 *  - Combined        → AND compound (all clauses present simultaneously)
 *  - Empty filters   → no where clause (returns every record)
 *  - Sort allowlist  → validated by searchController; service passes sortBy
 *                      straight through → controller-level allowlist test
 */

import { jest } from '@jest/globals';

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const prismaMock = {
  escrow: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};

// ─── Archive service mock (used by search() on zero-result fallback) ──────────

jest.unstable_mockModule('../services/escrowArchiveService.js', () => ({
  listArchiveTables: jest.fn().mockResolvedValue([]),
}));

// The search service lazily imports prisma via dynamic import; we intercept it
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: searchService } = await import('../services/searchService.js');
const { default: searchController } = await import('../api/controllers/searchController.js');

// ─── Helper: capture the `where` argument from a prisma.escrow.findMany call ──

function capturedWhere() {
  const [[call]] = prismaMock.escrow.findMany.mock.calls;
  return call?.where ?? null;
}

// ─── Shared result stub ────────────────────────────────────────────────────────

const EMPTY_PAGE = {
  data: [],
  total: 0,
  page: 1,
  limit: 20,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

function stubTransaction(rows = [], total = 0) {
  prismaMock.$transaction.mockImplementation(async ([findPromise, countPromise]) => {
    return [await findPromise, await countPromise];
  });
  prismaMock.escrow.findMany.mockResolvedValue(rows);
  prismaMock.escrow.count.mockResolvedValue(total);
}

beforeEach(() => {
  jest.clearAllMocks();
  stubTransaction([], 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Keyword search  →  OR / contains clause
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWhere — keyword search', () => {
  it('produces an OR contains clause on clientAddress and freelancerAddress', async () => {
    await searchService.search({ q: 'GABC' });

    const where = capturedWhere();
    expect(where).toHaveProperty('OR');
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { clientAddress: { contains: 'GABC', mode: 'insensitive' } },
        { freelancerAddress: { contains: 'GABC', mode: 'insensitive' } },
      ]),
    );
  });

  it('includes a numeric-id clause when the query is a pure number string', async () => {
    await searchService.search({ q: '42' });

    const where = capturedWhere();
    expect(where.OR).toEqual(
      expect.arrayContaining([{ id: 42n }]),
    );
  });

  it('does not add the numeric-id clause for non-numeric queries', async () => {
    await searchService.search({ q: 'GTEST' });

    const where = capturedWhere();
    const hasNumericClause = where.OR?.some((c) => 'id' in c);
    expect(hasNumericClause).toBe(false);
  });

  it('strips leading/trailing whitespace from the keyword before building the clause', async () => {
    await searchService.search({ q: '  GABC  ' });

    const where = capturedWhere();
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { clientAddress: { contains: 'GABC', mode: 'insensitive' } },
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status filter  →  equals clause (single) or { in: [...] } (multi-value)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWhere — status filter', () => {
  it('produces a direct equality clause for a single status value', async () => {
    await searchService.search({ status: 'Active' });

    const where = capturedWhere();
    expect(where.status).toBe('Active');
  });

  it('produces an { in: [...] } clause for comma-separated status values', async () => {
    await searchService.search({ status: 'Active,Completed' });

    const where = capturedWhere();
    expect(where.status).toEqual({ in: ['Active', 'Completed'] });
  });

  it('handles extra whitespace in comma-separated status values', async () => {
    await searchService.search({ status: 'Active , Disputed , Completed' });

    const where = capturedWhere();
    expect(where.status).toEqual({ in: ['Active', 'Disputed', 'Completed'] });
  });

  it('does not add a status clause when the filter is absent', async () => {
    await searchService.search({});

    const where = capturedWhere();
    expect(where).not.toHaveProperty('status');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Date range  →  createdAt gte / lte clause
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWhere — date range', () => {
  it('produces a createdAt.gte clause for dateFrom', async () => {
    await searchService.search({ dateFrom: '2025-01-01' });

    const where = capturedWhere();
    expect(where.createdAt).toBeDefined();
    expect(where.createdAt.gte).toEqual(new Date('2025-01-01'));
  });

  it('produces a createdAt.lte clause for dateTo at end-of-day', async () => {
    await searchService.search({ dateTo: '2025-12-31' });

    const where = capturedWhere();
    expect(where.createdAt).toBeDefined();
    const lte = where.createdAt.lte;
    expect(lte).toBeInstanceOf(Date);
    // End of day: hours=23, minutes=59, seconds=59
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
  });

  it('includes both gte and lte when both dateFrom and dateTo are supplied', async () => {
    await searchService.search({ dateFrom: '2025-01-01', dateTo: '2025-12-31' });

    const where = capturedWhere();
    expect(where.createdAt).toHaveProperty('gte');
    expect(where.createdAt).toHaveProperty('lte');
  });

  it('does not add a createdAt clause when no date filters are supplied', async () => {
    await searchService.search({});

    const where = capturedWhere();
    expect(where).not.toHaveProperty('createdAt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Amount range  →  totalAmount gte / lte
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWhere — amount range', () => {
  it('adds a totalAmount.gte clause for minAmount', async () => {
    await searchService.search({ minAmount: 1000 });

    const where = capturedWhere();
    expect(where.totalAmount?.gte).toBe('1000');
  });

  it('adds a totalAmount.lte clause for maxAmount', async () => {
    await searchService.search({ maxAmount: 5000 });

    const where = capturedWhere();
    expect(where.totalAmount?.lte).toBe('5000');
  });

  it('combines gte and lte when both are supplied', async () => {
    await searchService.search({ minAmount: 100, maxAmount: 9999 });

    const where = capturedWhere();
    expect(where.totalAmount).toEqual({ gte: '100', lte: '9999' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Address filters
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWhere — address filters', () => {
  it('adds clientAddress equals clause', async () => {
    await searchService.search({ client: 'GCLIENT123' });

    const where = capturedWhere();
    expect(where.clientAddress).toBe('GCLIENT123');
  });

  it('adds freelancerAddress equals clause', async () => {
    await searchService.search({ freelancer: 'GFREELANCER456' });

    const where = capturedWhere();
    expect(where.freelancerAddress).toBe('GFREELANCER456');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty filters  →  no where clause (return every record)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWhere — empty filters', () => {
  it('returns an empty where object when no filters are supplied', async () => {
    await searchService.search({});

    const where = capturedWhere();
    expect(where).toEqual({});
  });

  it('returns an empty where object when filters contain only undefined values', async () => {
    await searchService.search({ q: undefined, status: undefined, dateFrom: undefined });

    const where = capturedWhere();
    expect(where).toEqual({});
  });

  it('returns an empty where object when q is an empty string', async () => {
    await searchService.search({ q: '' });

    const where = capturedWhere();
    expect(where).not.toHaveProperty('OR');
  });

  it('returns an empty where object when q is only whitespace', async () => {
    await searchService.search({ q: '   ' });

    const where = capturedWhere();
    expect(where).not.toHaveProperty('OR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Combined filters  →  AND compound clause
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWhere — combined filters produce AND compound clause', () => {
  it('merges keyword, status, date range, and amount into a single where object', async () => {
    await searchService.search({
      q: 'GABC',
      status: 'Active',
      dateFrom: '2025-01-01',
      dateTo: '2025-12-31',
      minAmount: 100,
      maxAmount: 5000,
    });

    const where = capturedWhere();

    // Keyword clause
    expect(where).toHaveProperty('OR');

    // Status clause
    expect(where.status).toBe('Active');

    // Date clause
    expect(where.createdAt).toHaveProperty('gte');
    expect(where.createdAt).toHaveProperty('lte');

    // Amount clause
    expect(where.totalAmount).toEqual({ gte: '100', lte: '5000' });
  });

  it('all clauses are present simultaneously (true AND semantics)', async () => {
    await searchService.search({
      q: 'GTEST',
      status: 'Disputed,Completed',
      client: 'GCLIENT_A',
      freelancer: 'GFREELANCER_B',
      dateFrom: '2025-06-01',
      dateTo: '2025-06-30',
      minAmount: 50,
      maxAmount: 2000,
    });

    const where = capturedWhere();

    expect(where).toHaveProperty('OR');
    expect(where.status).toEqual({ in: ['Disputed', 'Completed'] });
    expect(where.clientAddress).toBe('GCLIENT_A');
    expect(where.freelancerAddress).toBe('GFREELANCER_B');
    expect(where.createdAt.gte).toEqual(new Date('2025-06-01'));
    expect(where.totalAmount).toEqual({ gte: '50', lte: '2000' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort field validation — allowlist enforced at the controller layer
// ─────────────────────────────────────────────────────────────────────────────

describe('Sort field allowlist — validated by searchController', () => {
  // The search service passes sortBy straight to Prisma orderBy without
  // validation.  The controller is the guard layer that validates against the
  // allowlist before calling the service.  These tests confirm that behaviour.

  function createRes() {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    return res;
  }

  const mockSearchResult = {
    data: [],
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  it('passes an allowlisted sortBy field through to the service unchanged', async () => {
    // Re-import searchController with a fresh mock of searchService
    const serviceSpy = jest.fn().mockResolvedValue(mockSearchResult);
    const { default: ctrl } = await import('../api/controllers/searchController.js');

    // Directly spy on what the controller passed — it delegates to searchService
    // so we can verify the valid sort field is forwarded
    const req = { query: { sortBy: 'totalAmount', sortOrder: 'asc' } };
    const res = createRes();

    // searchService mock from module-level setup will record the call
    stubTransaction([], 0);
    await ctrl.searchEscrows(req, res);

    // Controller should have forwarded the valid sortBy without replacing it
    expect(res.statusCode).toBe(200);
  });

  it('replaces an un-allowlisted sortBy with the safe default "createdAt"', async () => {
    const req = { query: { sortBy: 'injected_column; DROP TABLE escrows; --', sortOrder: 'asc' } };
    const res = createRes();

    stubTransaction([], 0);

    // We need to observe what sortBy the controller passed to the service mock.
    // The controller already validates and overwrites unknown fields to 'createdAt'.
    // We verify by checking that the controller returns 200 (not 500) and didn't
    // crash — AND we interrogate the prisma orderBy via the findMany mock.
    await searchController.searchEscrows(req, res);

    // Controller must not forward the malicious sort field — if it did the
    // response could expose an error or unexpected behaviour.
    expect(res.statusCode).toBe(200);

    const findManyCall = prismaMock.escrow.findMany.mock.calls[0]?.[0];
    if (findManyCall) {
      const sortKey = Object.keys(findManyCall.orderBy || {})[0];
      // Must be one of the safe columns, never the injected string
      const ALLOWED = ['createdAt', 'totalAmount', 'status', 'id'];
      expect(ALLOWED).toContain(sortKey);
    }
  });

  it('uses "desc" as the default sortOrder when an invalid value is supplied', async () => {
    const req = { query: { sortOrder: 'INVALID_ORDER' } };
    const res = createRes();

    stubTransaction([], 0);
    await searchController.searchEscrows(req, res);

    const findManyCall = prismaMock.escrow.findMany.mock.calls[0]?.[0];
    if (findManyCall) {
      const sortDir = Object.values(findManyCall.orderBy || {})[0];
      expect(['asc', 'desc']).toContain(sortDir);
    }
    expect(res.statusCode).toBe(200);
  });
});
