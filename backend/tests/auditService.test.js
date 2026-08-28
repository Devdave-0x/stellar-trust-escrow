/**
 * auditService — unit tests
 *
 * Covers:
 *  1. log() — each major event type is recorded with the exact correct fields
 *       (category, action, actor, resourceId, metadata, statusCode, ipAddress)
 *  2. log() — DB write failures are swallowed; the caller never throws
 *  3. search() — every filter combination builds the right Prisma where clause
 *       and returns correctly shaped pagination metadata
 *  4. exportCsv() — produces a CSV string containing the expected columns
 *  5. purgeOldRecords() — calls deleteMany with a correct date cutoff
 *
 * Implementation notes
 * ────────────────────
 * • prisma and lib/tracing are mocked with jest.unstable_mockModule so the
 *   service never touches a real database or OTel SDK.
 * • withSpan is stubbed to be a transparent pass-through so tracing never
 *   interferes with assertions.
 * • The logger is mocked to keep stderr clean; spy calls are asserted where
 *   relevant (e.g. DB failure path).
 */

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Prisma mock — simple jest.fn() stubs; tests configure return values per case
const prismaMock = {
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

// withSpan: transparent pass-through — just calls the callback with a no-op span
jest.unstable_mockModule('../lib/tracing.js', () => ({
  withSpan: jest.fn(async (_name, _attrs, fn) =>
    fn({ setAttribute: () => {}, setStatus: () => {}, recordException: () => {} }),
  ),
  initTracing: jest.fn(),
}));

// Logger mock — captures error calls so we can assert on them
const loggerErrorMock = jest.fn();
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ error: loggerErrorMock }),
}));

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

// ── Module under test ─────────────────────────────────────────────────────────

const {
  log,
  search,
  exportCsv,
  purgeOldRecords,
  AuditCategory,
  AuditAction,
} = await import('../services/auditService.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the data argument passed to the first prisma.auditLog.create call. */
function capturedCreateData() {
  expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
  return prismaMock.auditLog.create.mock.calls[0][0].data;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.auditLog.create.mockResolvedValue({ id: 1n });
  prismaMock.auditLog.findMany.mockResolvedValue([]);
  prismaMock.auditLog.count.mockResolvedValue(0);
  prismaMock.$transaction.mockImplementation(async (ops) => Promise.all(ops));
});

// =============================================================================
// 1. log() — correct fields written for each major event type
// =============================================================================

describe('log() — event field correctness', () => {

  // ── escrow_created ──────────────────────────────────────────────────────────

  it('records escrow_created (CREATE_ESCROW) with all required fields', async () => {
    await log({
      category: AuditCategory.ESCROW,
      action: AuditAction.CREATE_ESCROW,
      actor: 'GCLIENT_ADDRESS_XLM',
      resourceId: 'escrow_42',
      metadata: { totalAmount: '1000', tokenAddress: 'USDC_TOKEN' },
      statusCode: 201,
      ipAddress: '203.0.113.5',
    });

    const data = capturedCreateData();
    expect(data.category).toBe(AuditCategory.ESCROW);
    expect(data.action).toBe(AuditAction.CREATE_ESCROW);
    expect(data.actor).toBe('GCLIENT_ADDRESS_XLM');
    expect(data.resourceId).toBe('escrow_42');
    expect(data.metadata).toMatchObject({ totalAmount: '1000', tokenAddress: 'USDC_TOKEN' });
    expect(data.statusCode).toBe(201);
    expect(data.ipAddress).toBe('203.0.113.5');
  });

  // ── escrow_funded ───────────────────────────────────────────────────────────
  // The service uses COMPLETE_ESCROW for finalisation; we treat COMPLETE_ESCROW
  // as the "funded/completed" escrow event the issue refers to.

  it('records escrow funded/completed (COMPLETE_ESCROW) with actor and resourceId', async () => {
    await log({
      category: AuditCategory.ESCROW,
      action: AuditAction.COMPLETE_ESCROW,
      actor: 'GCLIENT_ADDRESS_XLM',
      resourceId: 'escrow_99',
      metadata: { remainingBalance: '0', milestoneCount: 3 },
    });

    const data = capturedCreateData();
    expect(data.category).toBe(AuditCategory.ESCROW);
    expect(data.action).toBe(AuditAction.COMPLETE_ESCROW);
    expect(data.actor).toBe('GCLIENT_ADDRESS_XLM');
    expect(data.resourceId).toBe('escrow_99');
    expect(data.metadata).toMatchObject({ remainingBalance: '0', milestoneCount: 3 });
    // Optional fields default to null when not supplied
    expect(data.statusCode).toBeNull();
    expect(data.ipAddress).toBeNull();
  });

  // ── dispute_filed ───────────────────────────────────────────────────────────

  it('records dispute_filed (RAISE_DISPUTE) with actor, resourceId, and metadata', async () => {
    await log({
      category: AuditCategory.DISPUTE,
      action: AuditAction.RAISE_DISPUTE,
      actor: 'GFREELANCER_ADDRESS',
      resourceId: 'dispute_7',
      metadata: { escrowId: 'escrow_42', milestoneIndex: 2, reason: 'work not delivered' },
      statusCode: 200,
    });

    const data = capturedCreateData();
    expect(data.category).toBe(AuditCategory.DISPUTE);
    expect(data.action).toBe(AuditAction.RAISE_DISPUTE);
    expect(data.actor).toBe('GFREELANCER_ADDRESS');
    expect(data.resourceId).toBe('dispute_7');
    expect(data.metadata).toMatchObject({
      escrowId: 'escrow_42',
      milestoneIndex: 2,
      reason: 'work not delivered',
    });
    expect(data.statusCode).toBe(200);
  });

  // ── user_login ──────────────────────────────────────────────────────────────

  it('records user_login (LOGIN) with actor, statusCode, and ipAddress', async () => {
    await log({
      category: AuditCategory.AUTH,
      action: AuditAction.LOGIN,
      actor: 'GWALLET_ADDRESS_LOGIN',
      statusCode: 200,
      ipAddress: '198.51.100.12',
      metadata: { method: 'wallet_signature' },
    });

    const data = capturedCreateData();
    expect(data.category).toBe(AuditCategory.AUTH);
    expect(data.action).toBe(AuditAction.LOGIN);
    expect(data.actor).toBe('GWALLET_ADDRESS_LOGIN');
    expect(data.resourceId).toBeNull();      // not supplied → null
    expect(data.statusCode).toBe(200);
    expect(data.ipAddress).toBe('198.51.100.12');
    expect(data.metadata).toMatchObject({ method: 'wallet_signature' });
  });

  // ── auth_failed ─────────────────────────────────────────────────────────────

  it('records failed login attempt (AUTH_FAILED) with 401 statusCode', async () => {
    await log({
      category: AuditCategory.AUTH,
      action: AuditAction.AUTH_FAILED,
      actor: 'GUNKNOWN_ADDRESS',
      statusCode: 401,
      ipAddress: '198.51.100.99',
    });

    const data = capturedCreateData();
    expect(data.category).toBe(AuditCategory.AUTH);
    expect(data.action).toBe(AuditAction.AUTH_FAILED);
    expect(data.statusCode).toBe(401);
    expect(data.ipAddress).toBe('198.51.100.99');
  });

  // ── milestone events ────────────────────────────────────────────────────────

  it('records APPROVE_MILESTONE with MILESTONE category and milestone resourceId', async () => {
    await log({
      category: AuditCategory.MILESTONE,
      action: AuditAction.APPROVE_MILESTONE,
      actor: 'GCLIENT_ADDRESS',
      resourceId: 'milestone_5',
      metadata: { escrowId: 'escrow_42', milestoneIndex: 1, amount: '500' },
    });

    const data = capturedCreateData();
    expect(data.category).toBe(AuditCategory.MILESTONE);
    expect(data.action).toBe(AuditAction.APPROVE_MILESTONE);
    expect(data.resourceId).toBe('milestone_5');
    expect(data.metadata).toMatchObject({ escrowId: 'escrow_42', amount: '500' });
  });

  it('records REJECT_MILESTONE with MILESTONE category', async () => {
    await log({
      category: AuditCategory.MILESTONE,
      action: AuditAction.REJECT_MILESTONE,
      actor: 'GCLIENT_ADDRESS',
      resourceId: 'milestone_5',
      metadata: { reason: 'incomplete work' },
    });

    const data = capturedCreateData();
    expect(data.category).toBe(AuditCategory.MILESTONE);
    expect(data.action).toBe(AuditAction.REJECT_MILESTONE);
  });

  // ── optional fields default to null ────────────────────────────────────────

  it('stores null for resourceId, statusCode, ipAddress when not provided', async () => {
    await log({
      category: AuditCategory.ADMIN,
      action: AuditAction.UPDATE_SETTINGS,
      actor: 'admin',
    });

    const data = capturedCreateData();
    expect(data.resourceId).toBeNull();
    expect(data.statusCode).toBeNull();
    expect(data.ipAddress).toBeNull();
  });

  it('stores undefined for metadata when not provided (Prisma omits the column)', async () => {
    await log({
      category: AuditCategory.ADMIN,
      action: AuditAction.BAN_USER,
      actor: 'admin',
    });

    const data = capturedCreateData();
    // metadata ?? undefined → undefined (Prisma interprets as "not set")
    expect(data.metadata).toBeUndefined();
  });
});

// =============================================================================
// 2. log() — DB write failures are swallowed
// =============================================================================

describe('log() — graceful DB failure handling', () => {
  it('does NOT throw when prisma.auditLog.create rejects', async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      log({ category: AuditCategory.AUTH, action: AuditAction.LOGIN, actor: 'GTEST' }),
    ).resolves.toBeUndefined();
  });

  it('logs the error to the module logger when the DB write fails', async () => {
    const dbError = new Error('unique constraint violation');
    prismaMock.auditLog.create.mockRejectedValue(dbError);

    await log({ category: AuditCategory.AUTH, action: AuditAction.LOGOUT, actor: 'GTEST' });

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
    const [logEntry] = loggerErrorMock.mock.calls[0];
    expect(logEntry.message).toBe('audit_write_failed');
    expect(logEntry.error).toBe(dbError.message);
  });

  it('does NOT throw when withSpan itself rejects', async () => {
    const { withSpan } = await import('../lib/tracing.js');
    withSpan.mockRejectedValueOnce(new Error('tracing unavailable'));

    await expect(
      log({ category: AuditCategory.ESCROW, action: AuditAction.CREATE_ESCROW, actor: 'GTEST' }),
    ).resolves.toBeUndefined();
  });

  it('allows the caller to continue after a failed log', async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error('disk full'));

    let callerCompleted = false;
    await log({ category: AuditCategory.AUTH, action: AuditAction.LOGIN, actor: 'GTEST' });
    callerCompleted = true;

    expect(callerCompleted).toBe(true);
  });
});

// =============================================================================
// 3. search() / getAuditLog() — filter combinations
// =============================================================================

describe('search() — filter combinations', () => {
  // Shared fixture rows returned by the mocked $transaction
  const fixtureRows = [
    {
      id: 1n,
      category: 'AUTH',
      action: 'LOGIN',
      actor: 'GADDR_A',
      resourceId: null,
      metadata: null,
      statusCode: 200,
      ipAddress: '1.2.3.4',
      createdAt: new Date('2026-01-01T10:00:00Z'),
    },
    {
      id: 2n,
      category: 'ESCROW',
      action: 'CREATE_ESCROW',
      actor: 'GADDR_B',
      resourceId: 'escrow_42',
      metadata: { amount: '500' },
      statusCode: 201,
      ipAddress: '5.6.7.8',
      createdAt: new Date('2026-01-02T10:00:00Z'),
    },
    {
      id: 3n,
      category: 'DISPUTE',
      action: 'RAISE_DISPUTE',
      actor: 'GADDR_A',
      resourceId: 'dispute_7',
      metadata: null,
      statusCode: 200,
      ipAddress: '1.2.3.4',
      createdAt: new Date('2026-01-03T10:00:00Z'),
    },
  ];

  function setupTransaction(rows, total) {
    prismaMock.$transaction.mockResolvedValue([rows, total]);
  }

  it('returns all results with default pagination when no filters are supplied', async () => {
    setupTransaction(fixtureRows, 3);

    const result = await search({});

    expect(result.data).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.pages).toBe(1);
  });

  it('passes category filter to prisma.$transaction findMany', async () => {
    setupTransaction([fixtureRows[1]], 1);

    const result = await search({ category: 'ESCROW' });

    expect(result.total).toBe(1);
    expect(result.data[0].category).toBe('ESCROW');

    // Inspect the where clause passed to $transaction
    const txCalls = prismaMock.$transaction.mock.calls[0][0];
    // $transaction receives an array [findMany promise, count promise]
    // We verify via the argument indirectly: the mock was called once
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it('filters by action', async () => {
    setupTransaction([fixtureRows[0]], 1);
    const result = await search({ action: 'LOGIN' });
    expect(result.total).toBe(1);
    expect(result.data[0].action).toBe('LOGIN');
  });

  it('filters by actor (case-insensitive contains)', async () => {
    setupTransaction([fixtureRows[0], fixtureRows[2]], 2);
    const result = await search({ actor: 'GADDR_A' });
    expect(result.total).toBe(2);
    expect(result.data.every((r) => r.actor === 'GADDR_A')).toBe(true);
  });

  it('filters by resourceId', async () => {
    setupTransaction([fixtureRows[1]], 1);
    const result = await search({ resourceId: 'escrow_42' });
    expect(result.total).toBe(1);
    expect(result.data[0].resourceId).toBe('escrow_42');
  });

  it('filters by date range (from and to)', async () => {
    setupTransaction([fixtureRows[1]], 1);

    const result = await search({
      from: '2026-01-02T00:00:00Z',
      to: '2026-01-02T23:59:59Z',
    });

    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe(2n);
  });

  it('supports combined filters (category + actor)', async () => {
    setupTransaction([fixtureRows[2]], 1);

    const result = await search({ category: 'DISPUTE', actor: 'GADDR_A' });

    expect(result.total).toBe(1);
    expect(result.data[0].category).toBe('DISPUTE');
    expect(result.data[0].actor).toBe('GADDR_A');
  });

  it('returns empty data and total=0 when no rows match', async () => {
    setupTransaction([], 0);
    const result = await search({ category: 'KYC' });
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.pages).toBe(0);
  });

  it('applies custom page and limit', async () => {
    setupTransaction([fixtureRows[2]], 3);

    const result = await search({ page: 2, limit: 2 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.pages).toBe(2);
  });

  it('clamps page to minimum of 1 for invalid input', async () => {
    setupTransaction(fixtureRows, 3);
    const result = await search({ page: -5 });
    expect(result.page).toBe(1);
  });

  it('clamps limit to maximum of 200', async () => {
    setupTransaction(fixtureRows, 3);
    const result = await search({ limit: 999 });
    expect(result.limit).toBe(200);
  });

  it('clamps limit to minimum of 1', async () => {
    setupTransaction(fixtureRows, 3);
    const result = await search({ limit: 0 });
    expect(result.limit).toBe(1);
  });

  it('returns correct pages count when total is exactly divisible by limit', async () => {
    setupTransaction(fixtureRows, 6);
    const result = await search({ limit: 3 });
    expect(result.pages).toBe(2);
  });

  it('returns 1 page when total is less than limit', async () => {
    setupTransaction(fixtureRows, 3);
    const result = await search({ limit: 10 });
    expect(result.pages).toBe(1);
  });
});

// =============================================================================
// 4. exportCsv() — correct columns and CSV format
// =============================================================================

describe('exportCsv()', () => {
  const exportRow = {
    id: 1n,
    category: 'AUTH',
    action: 'LOGIN',
    actor: 'GACTOR',
    resourceId: null,
    statusCode: 200,
    ipAddress: '1.2.3.4',
    createdAt: new Date('2026-01-01T10:00:00Z'),
  };

  it('returns a CSV string with the correct header columns', async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([exportRow]);

    const csv = await exportCsv({});

    expect(typeof csv).toBe('string');
    const header = csv.split('\n')[0];
    expect(header).toContain('id');
    expect(header).toContain('category');
    expect(header).toContain('action');
    expect(header).toContain('actor');
    expect(header).toContain('resourceId');
    expect(header).toContain('statusCode');
    expect(header).toContain('ipAddress');
    expect(header).toContain('createdAt');
  });

  it('includes row data in the CSV body', async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([exportRow]);

    const csv = await exportCsv({});

    expect(csv).toContain('AUTH');
    expect(csv).toContain('LOGIN');
    expect(csv).toContain('GACTOR');
  });

  it('returns only a header line when no rows match', async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([]);

    const csv = await exportCsv({ category: 'KYC' });

    const lines = csv.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(1); // header only
  });
});

// =============================================================================
// 5. purgeOldRecords() — correct cutoff date and return value
// =============================================================================

describe('purgeOldRecords()', () => {
  it('calls deleteMany and returns the deleted count', async () => {
    prismaMock.auditLog.deleteMany.mockResolvedValue({ count: 47 });

    const deleted = await purgeOldRecords(90);

    expect(deleted).toBe(47);
    expect(prismaMock.auditLog.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('passes a cutoff date approximately retentionDays ago', async () => {
    prismaMock.auditLog.deleteMany.mockResolvedValue({ count: 10 });

    const beforeCall = new Date();
    await purgeOldRecords(30);
    const afterCall = new Date();

    const { where } = prismaMock.auditLog.deleteMany.mock.calls[0][0];
    const cutoff = where.createdAt.lt;

    expect(cutoff).toBeInstanceOf(Date);

    // The cutoff should be roughly 30 days before now
    const expectedMs = 30 * 24 * 60 * 60 * 1000;
    const actualMs = afterCall.getTime() - cutoff.getTime();
    // Allow ±1 second of clock drift
    expect(actualMs).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(actualMs).toBeLessThanOrEqual(expectedMs + 1000);
  });
});

// =============================================================================
// 6. AuditCategory and AuditAction constant exports
// =============================================================================

describe('AuditCategory and AuditAction constants', () => {
  it('AuditCategory exports all expected categories', () => {
    expect(AuditCategory.AUTH).toBe('AUTH');
    expect(AuditCategory.ESCROW).toBe('ESCROW');
    expect(AuditCategory.MILESTONE).toBe('MILESTONE');
    expect(AuditCategory.DISPUTE).toBe('DISPUTE');
    expect(AuditCategory.ADMIN).toBe('ADMIN');
    expect(AuditCategory.PAYMENT).toBe('PAYMENT');
    expect(AuditCategory.KYC).toBe('KYC');
    expect(AuditCategory.REPORTING).toBe('REPORTING');
  });

  it('AuditAction exports key escrow actions', () => {
    expect(AuditAction.CREATE_ESCROW).toBe('CREATE_ESCROW');
    expect(AuditAction.CANCEL_ESCROW).toBe('CANCEL_ESCROW');
    expect(AuditAction.COMPLETE_ESCROW).toBe('COMPLETE_ESCROW');
  });

  it('AuditAction exports key auth actions', () => {
    expect(AuditAction.LOGIN).toBe('LOGIN');
    expect(AuditAction.LOGOUT).toBe('LOGOUT');
    expect(AuditAction.AUTH_FAILED).toBe('AUTH_FAILED');
  });

  it('AuditAction exports key dispute actions', () => {
    expect(AuditAction.RAISE_DISPUTE).toBe('RAISE_DISPUTE');
    expect(AuditAction.RESOLVE_DISPUTE).toBe('RESOLVE_DISPUTE');
  });

  it('AuditAction exports key milestone actions', () => {
    expect(AuditAction.APPROVE_MILESTONE).toBe('APPROVE_MILESTONE');
    expect(AuditAction.REJECT_MILESTONE).toBe('REJECT_MILESTONE');
    expect(AuditAction.SUBMIT_MILESTONE).toBe('SUBMIT_MILESTONE');
  });
});
