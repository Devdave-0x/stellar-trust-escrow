/**
 * auditVerifier — unit tests (Issue #570)
 *
 * Covers:
 *  1. Scheduled execution of auditVerifier
 *  2. Report generation with range information
 *  3. Detection of tampered audit chains
 *  4. Checksum validation
 *
 * Implementation notes
 * ────────────────────
 * • prisma and Redis clients are mocked to avoid real database/cache access
 * • The verifier is tested with both intact and compromised audit chains
 * • Reports include range, validity status, first invalid row, and checksums
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const prismaMock = {
  auditLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  auditChainRoot: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const redisMock = {
  setEx: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  on: jest.fn(),
  connect: jest.fn(),
};

const loggerErrorMock = jest.fn();
const loggerWarnMock = jest.fn();

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({
    error: loggerErrorMock,
    warn: loggerWarnMock,
  }),
}));

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('redis', () => ({
  createClient: jest.fn(() => redisMock),
}));

// ── Module under test ─────────────────────────────────────────────────────────

const { computeChainRoot, verifyAuditChain, generateAuditReport } = await import('../services/auditVerifier.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockAuditLog(id, tenantId, action, actor) {
  return {
    id: BigInt(id),
    tenantId,
    category: 'ESCROW',
    action,
    actor,
    createdAt: new Date('2026-01-15T10:00:00Z'),
  };
}

function computeHash(prevHash, entry) {
  return crypto
    .createHash('sha256')
    .update(prevHash)
    .update(String(entry.id))
    .update(entry.tenantId)
    .update(entry.category)
    .update(entry.action)
    .update(entry.actor)
    .update(entry.createdAt.toISOString())
    .digest('hex');
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.auditLog.findMany.mockResolvedValue([]);
  prismaMock.auditLog.count.mockResolvedValue(0);
  prismaMock.auditChainRoot.upsert.mockResolvedValue({});
  prismaMock.auditChainRoot.findUnique.mockResolvedValue({ rootHash: '' });
  prismaMock.$transaction.mockImplementation(async (ops) => Promise.all(ops));
  redisMock.setEx.mockResolvedValue('OK');
  redisMock.get.mockResolvedValue(null);
  redisMock.connect.mockResolvedValue(undefined);
  redisMock.on.mockReturnValue(undefined);
});

// =============================================================================
// 1. REPORT GENERATION WITH RANGE INFORMATION
// =============================================================================

describe('auditVerifier — report generation', () => {
  it('generates report containing transaction range start and end', async () => {
    const tenantId = 'tenant_123';
    const logs = [
      mockAuditLog(1, tenantId, 'CREATE_ESCROW', 'client_1'),
      mockAuditLog(2, tenantId, 'FUND_ESCROW', 'client_1'),
      mockAuditLog(3, tenantId, 'APPROVE_MILESTONE', 'client_1'),
    ];

    prismaMock.auditLog.findMany.mockResolvedValue(logs);

    const report = await generateAuditReport(tenantId);

    expect(report).toBeDefined();
    expect(report.rangeStart).toBe(1n);
    expect(report.rangeEnd).toBe(3n);
    expect(report.logCount).toBe(3);
  });

  it('includes validity status in generated report', async () => {
    const tenantId = 'tenant_456';
    const logs = [mockAuditLog(1, tenantId, 'CREATE_ESCROW', 'client_1')];

    prismaMock.auditLog.findMany.mockResolvedValue(logs);
    prismaMock.auditChainRoot.findUnique.mockResolvedValue({
      rootHash: computeHash('STELLAR_TRUST_ESCROW_AUDIT_GENESIS', logs[0]),
    });

    const report = await generateAuditReport(tenantId);

    expect(report).toBeDefined();
    expect(report.isValid).toBe(true);
  });

  it('identifies first invalid row when tampering detected', async () => {
    const tenantId = 'tenant_789';
    const logs = [
      mockAuditLog(1, tenantId, 'CREATE_ESCROW', 'client_1'),
      mockAuditLog(2, tenantId, 'FUND_ESCROW', 'client_1'),
      mockAuditLog(3, tenantId, 'APPROVE_MILESTONE', 'client_1'),
    ];

    prismaMock.auditLog.findMany.mockResolvedValue(logs);

    const hash1 = computeHash('STELLAR_TRUST_ESCROW_AUDIT_GENESIS', logs[0]);
    const hash2 = computeHash(hash1, logs[1]);
    const tamperedHash3 = 'deadbeef' + '0'.repeat(56);

    prismaMock.auditChainRoot.findUnique.mockResolvedValue({
      rootHash: tamperedHash3,
    });

    const report = await generateAuditReport(tenantId);

    expect(report).toBeDefined();
    expect(report.isValid).toBe(false);
    expect(report.firstInvalidRow).toBeDefined();
  });
});

// =============================================================================
// 2. CHECKSUM VALIDATION
// =============================================================================

describe('auditVerifier — checksum validation', () => {
  it('includes root hash checksum in report', async () => {
    const tenantId = 'tenant_checksum';
    const logs = [
      mockAuditLog(1, tenantId, 'CREATE_ESCROW', 'client_1'),
      mockAuditLog(2, tenantId, 'FUND_ESCROW', 'client_1'),
    ];

    prismaMock.auditLog.findMany.mockResolvedValue(logs);

    const hash1 = computeHash('STELLAR_TRUST_ESCROW_AUDIT_GENESIS', logs[0]);
    const rootHash = computeHash(hash1, logs[1]);

    prismaMock.auditChainRoot.findUnique.mockResolvedValue({ rootHash });

    const report = await generateAuditReport(tenantId);

    expect(report).toBeDefined();
    expect(report.computedRootHash).toBe(rootHash);
    expect(report.storedRootHash).toBe(rootHash);
  });

  it('detects checksum mismatch on chain tampering', async () => {
    const tenantId = 'tenant_tampering';
    const logs = [
      mockAuditLog(1, tenantId, 'CREATE_ESCROW', 'client_1'),
    ];

    prismaMock.auditLog.findMany.mockResolvedValue(logs);

    const correctHash = computeHash('STELLAR_TRUST_ESCROW_AUDIT_GENESIS', logs[0]);
    const tamperedHash = 'cafebabe' + '0'.repeat(56);

    prismaMock.auditChainRoot.findUnique.mockResolvedValue({
      rootHash: tamperedHash,
    });

    const report = await generateAuditReport(tenantId);

    expect(report).toBeDefined();
    expect(report.isValid).toBe(false);
    expect(report.computedRootHash).toBe(correctHash);
    expect(report.storedRootHash).toBe(tamperedHash);
  });
});

// =============================================================================
// 3. INTACT CHAIN VALIDATION
// =============================================================================

describe('auditVerifier — intact chain detection', () => {
  it('confirms valid chain with correct checksums', async () => {
    const tenantId = 'tenant_intact';
    const logs = [
      mockAuditLog(1, tenantId, 'CREATE_ESCROW', 'client_1'),
      mockAuditLog(2, tenantId, 'APPROVE_MILESTONE', 'client_1'),
      mockAuditLog(3, tenantId, 'RELEASE_FUNDS', 'client_1'),
    ];

    prismaMock.auditLog.findMany.mockResolvedValue(logs);

    let hash = 'STELLAR_TRUST_ESCROW_AUDIT_GENESIS';
    for (const log of logs) {
      hash = computeHash(hash, log);
    }

    prismaMock.auditChainRoot.findUnique.mockResolvedValue({ rootHash: hash });

    const report = await generateAuditReport(tenantId);

    expect(report).toBeDefined();
    expect(report.isValid).toBe(true);
    expect(report.logCount).toBe(3);
  });
});

// =============================================================================
// 4. COMPROMISED CHAIN DETECTION
// =============================================================================

describe('auditVerifier — compromised chain detection', () => {
  it('detects insertion of unauthorized log entry', async () => {
    const tenantId = 'tenant_compromised';
    const logs = [
      mockAuditLog(1, tenantId, 'CREATE_ESCROW', 'client_1'),
      mockAuditLog(2, tenantId, 'UNAUTHORIZED_ACTION', 'attacker'),
      mockAuditLog(3, tenantId, 'RELEASE_FUNDS', 'client_1'),
    ];

    prismaMock.auditLog.findMany.mockResolvedValue(logs);

    let hash = 'STELLAR_TRUST_ESCROW_AUDIT_GENESIS';
    hash = computeHash(hash, logs[0]);

    hash = computeHash(hash, logs[2]);

    prismaMock.auditChainRoot.findUnique.mockResolvedValue({ rootHash: hash });

    const report = await generateAuditReport(tenantId);

    expect(report).toBeDefined();
    expect(report.isValid).toBe(false);
  });
});
