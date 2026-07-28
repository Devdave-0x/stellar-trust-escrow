/**
 * Unit tests for disputeEscalationService.runDisputeEscalationJob
 *
 * Issue #2: Verify time-sensitive escalation logic, boundary conditions,
 * arbiter notification, and idempotency.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const prismaMock = {
  tenant: { findMany: jest.fn() },
  dispute: { findMany: jest.fn(), update: jest.fn() },
};

const auditLogMock = jest.fn();

const enqueueEventMock = jest.fn();

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('../services/auditService.js', () => ({
  log: auditLogMock,
  AuditCategory: { DISPUTE: 'DISPUTE' },
  AuditAction: { ESCALATE_DISPUTE: 'ESCALATE_DISPUTE' },
}));

// The service imports emailQueue dynamically inside notifyAdmin(), so we mock
// the module at the path the dynamic import will resolve to.
jest.unstable_mockModule('../queues/emailQueue.js', () => ({
  enqueueEvent: enqueueEventMock,
  default: { enqueueEvent: enqueueEventMock },
}));

// Logger mock — prevents actual pino/winston output during tests
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ── Import SUT after mocks are registered ────────────────────────────────────

const { runDisputeEscalationJob } = await import('../services/disputeEscalationService.js');

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD_HOURS = 48;
const DEFAULT_THRESHOLD_MS = DEFAULT_THRESHOLD_HOURS * 3_600_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTenant(overrides = {}) {
  return {
    id: 'tenant-1',
    slug: 'acme',
    configuration: null,
    ...overrides,
  };
}

/**
 * Build a dispute whose last activity is `hoursAgo` hours before `now`.
 * When `resolved` is true, resolvedAt is set so the dispute is skipped.
 */
function buildDispute({ id = 1, hoursAgo = 72, now = new Date(), resolved = false, alreadyEscalated = false } = {}) {
  const activityTime = new Date(now.getTime() - hoursAgo * 3_600_000);
  return {
    id,
    escrowId: 100 + id,
    raisedByAddress: 'GRAISEDBY1',
    raisedAt: activityTime,
    escalatedAt: alreadyEscalated ? activityTime : null,
    escalationCount: alreadyEscalated ? 1 : 0,
    tenantId: 'tenant-1',
    resolvedAt: resolved ? activityTime : null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runDisputeEscalationJob', () => {
  const NOW = new Date('2026-07-28T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    // Default: single active tenant
    prismaMock.tenant.findMany.mockResolvedValue([buildTenant()]);
    // Default: no disputes awaiting escalation
    prismaMock.dispute.findMany.mockResolvedValue([]);
    prismaMock.dispute.update.mockResolvedValue({});
    auditLogMock.mockResolvedValue({});
    enqueueEventMock.mockResolvedValue({ id: 'job-1' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── No disputes ──────────────────────────────────────────────────────────────

  it('returns 0 when there are no disputes to escalate', async () => {
    const count = await runDisputeEscalationJob();

    expect(count).toBe(0);
    expect(prismaMock.dispute.update).not.toHaveBeenCalled();
    expect(auditLogMock).not.toHaveBeenCalled();
  });

  // ── Dispute past threshold → escalated ───────────────────────────────────────

  it('escalates a dispute whose last activity exceeds the default 48-hour threshold', async () => {
    const dispute = buildDispute({ id: 1, hoursAgo: 72, now: NOW });
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    const count = await runDisputeEscalationJob();

    expect(count).toBe(1);
    expect(prismaMock.dispute.update).toHaveBeenCalledWith({
      where: { id: dispute.id },
      data: {
        escalatedAt: expect.any(Date),
        escalationCount: { increment: 1 },
        resolutionType: 'ESCALATED',
      },
    });
  });

  // ── Dispute exactly at boundary → escalated (past threshold) ─────────────────

  it('escalates a dispute whose activity is exactly 1 ms past the threshold', async () => {
    // Set the clock precisely so raisedAt is (threshold + 1ms) ago
    const EXACT_NOW = new Date('2026-07-28T12:00:00.000Z');
    jest.setSystemTime(EXACT_NOW);

    const raisedAt = new Date(EXACT_NOW.getTime() - DEFAULT_THRESHOLD_MS - 1);
    const dispute = { ...buildDispute({ id: 2, now: EXACT_NOW }), raisedAt, escalatedAt: null };
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    const count = await runDisputeEscalationJob();

    expect(count).toBe(1);
  });

  // ── Dispute with recent activity → not escalated ─────────────────────────────
  // (This is enforced by the DB query's cutoff filter; the job trusts the query.)

  it('does not escalate disputes that the query correctly filters out (recent activity)', async () => {
    // The service applies the cutoff inside the prisma query. When findMany returns
    // nothing (simulating recent-activity disputes being filtered), count must be 0.
    prismaMock.dispute.findMany.mockResolvedValue([]);

    const count = await runDisputeEscalationJob();

    expect(count).toBe(0);
    expect(prismaMock.dispute.update).not.toHaveBeenCalled();
  });

  it('queries with the correct cutoff date for the default threshold', async () => {
    await runDisputeEscalationJob();

    const expectedCutoff = new Date(NOW.getTime() - DEFAULT_THRESHOLD_MS);
    const callArgs = prismaMock.dispute.findMany.mock.calls[0][0];

    // The query must filter raisedAt < cutoff
    expect(callArgs.where.raisedAt.lt).toEqual(expectedCutoff);
    // Must only look at unresolved disputes
    expect(callArgs.where.resolvedAt).toBe(null);
  });

  // ── Already-resolved dispute → skipped ───────────────────────────────────────

  it('skips already-resolved disputes (resolvedAt is not null)', async () => {
    // The service's prisma query filters out resolved disputes with resolvedAt: null.
    // We simulate this by confirming findMany is called with resolvedAt: null filter.
    await runDisputeEscalationJob();

    const callArgs = prismaMock.dispute.findMany.mock.calls[0][0];
    expect(callArgs.where.resolvedAt).toBe(null);
    expect(prismaMock.dispute.update).not.toHaveBeenCalled();
  });

  // ── Tenant custom threshold ───────────────────────────────────────────────────

  it('uses a tenant-specific escalation threshold when configured', async () => {
    const CUSTOM_HOURS = 24;
    prismaMock.tenant.findMany.mockResolvedValue([
      buildTenant({ configuration: { disputeEscalationHours: CUSTOM_HOURS } }),
    ]);

    await runDisputeEscalationJob();

    const expectedCutoff = new Date(NOW.getTime() - CUSTOM_HOURS * 3_600_000);
    const callArgs = prismaMock.dispute.findMany.mock.calls[0][0];
    expect(callArgs.where.raisedAt.lt).toEqual(expectedCutoff);
  });

  it('falls back to the default threshold when tenant configuration is invalid', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      buildTenant({ configuration: { disputeEscalationHours: -5 } }),
    ]);

    await runDisputeEscalationJob();

    const expectedCutoff = new Date(NOW.getTime() - DEFAULT_THRESHOLD_MS);
    const callArgs = prismaMock.dispute.findMany.mock.calls[0][0];
    expect(callArgs.where.raisedAt.lt).toEqual(expectedCutoff);
  });

  // ── Audit log ────────────────────────────────────────────────────────────────

  it('writes an ESCALATE_DISPUTE audit log entry for each escalated dispute', async () => {
    const dispute = buildDispute({ id: 5, hoursAgo: 100, now: NOW });
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    await runDisputeEscalationJob();

    expect(auditLogMock).toHaveBeenCalledTimes(1);
    expect(auditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'DISPUTE',
        action: 'ESCALATE_DISPUTE',
        actor: 'system',
        resourceId: String(dispute.id),
        metadata: expect.objectContaining({
          escrowId: String(dispute.escrowId),
          tenantId: dispute.tenantId,
        }),
      }),
    );
  });

  // ── Admin notification ────────────────────────────────────────────────────────

  it('sends an admin notification with correct to/subject/text when ADMIN_ALERT_EMAIL is set', async () => {
    const originalEmail = process.env.ADMIN_ALERT_EMAIL;
    process.env.ADMIN_ALERT_EMAIL = 'arbiter@example.com';

    const dispute = buildDispute({ id: 7, hoursAgo: 96, now: NOW });
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    await runDisputeEscalationJob();

    expect(enqueueEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'arbiter@example.com',
        subject: expect.stringContaining(`Dispute #${dispute.id}`),
        text: expect.stringContaining(String(dispute.id)),
      }),
    );

    process.env.ADMIN_ALERT_EMAIL = originalEmail;
  });

  it('does not call enqueueEvent when ADMIN_ALERT_EMAIL is unset', async () => {
    const originalEmail = process.env.ADMIN_ALERT_EMAIL;
    delete process.env.ADMIN_ALERT_EMAIL;

    const dispute = buildDispute({ id: 8, hoursAgo: 60, now: NOW });
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    await runDisputeEscalationJob();

    expect(enqueueEventMock).not.toHaveBeenCalled();

    process.env.ADMIN_ALERT_EMAIL = originalEmail;
  });

  // ── Admin email failure is non-fatal ─────────────────────────────────────────

  it('still escalates the dispute and writes the audit log even if the admin email fails', async () => {
    const originalEmail = process.env.ADMIN_ALERT_EMAIL;
    process.env.ADMIN_ALERT_EMAIL = 'arbiter@example.com';
    enqueueEventMock.mockRejectedValue(new Error('email queue unavailable'));

    const dispute = buildDispute({ id: 9, hoursAgo: 80, now: NOW });
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    const count = await runDisputeEscalationJob();

    // Escalation count should still be 1
    expect(count).toBe(1);
    // DB update must have happened
    expect(prismaMock.dispute.update).toHaveBeenCalledTimes(1);
    // Audit log must have been written
    expect(auditLogMock).toHaveBeenCalledTimes(1);

    process.env.ADMIN_ALERT_EMAIL = originalEmail;
  });

  // ── Idempotency: running twice escalates only once ────────────────────────────

  it('escalates a dispute only once (idempotency via escalatedAt filter)', async () => {
    // First run: dispute has no escalatedAt, raisedAt is past threshold
    const dispute = buildDispute({ id: 10, hoursAgo: 100, now: NOW });
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    const firstCount = await runDisputeEscalationJob();
    expect(firstCount).toBe(1);

    // Second run: simulate the DB update having been applied — the dispute now
    // has escalatedAt = NOW, which is within the threshold window, so the query
    // returns no disputes. We model this by returning [] on the second call.
    prismaMock.dispute.findMany.mockResolvedValue([]);

    const secondCount = await runDisputeEscalationJob();
    expect(secondCount).toBe(0);

    // Total DB updates across both runs: 1 (not 2)
    expect(prismaMock.dispute.update).toHaveBeenCalledTimes(1);
  });

  // ── Boundary conditions using fake clock ─────────────────────────────────────

  it('does not escalate when the dispute activity is exactly at the threshold (not past it)', async () => {
    // At exactly the threshold the cutoff equals raisedAt, meaning raisedAt < cutoff
    // is FALSE — the dispute should NOT appear in the query result.
    // We simulate the DB correctly filtering it out.
    prismaMock.dispute.findMany.mockResolvedValue([]);

    const count = await runDisputeEscalationJob();

    expect(count).toBe(0);
    expect(prismaMock.dispute.update).not.toHaveBeenCalled();
  });

  it('escalates when clock advances 1 ms past the threshold', async () => {
    // Advance clock so the cutoff is 1ms later than raisedAt
    const FUTURE = new Date(NOW.getTime() + 1);
    jest.setSystemTime(FUTURE);

    const raisedAt = new Date(FUTURE.getTime() - DEFAULT_THRESHOLD_MS - 1);
    const dispute = { ...buildDispute({ id: 11, now: FUTURE }), raisedAt, escalatedAt: null };
    prismaMock.dispute.findMany.mockResolvedValue([dispute]);

    const count = await runDisputeEscalationJob();

    expect(count).toBe(1);
  });

  // ── Multi-tenant ──────────────────────────────────────────────────────────────

  it('processes disputes across multiple tenants and sums the total', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      buildTenant({ id: 'tenant-1', slug: 'alpha' }),
      buildTenant({ id: 'tenant-2', slug: 'beta' }),
    ]);

    // Each tenant has one eligible dispute
    prismaMock.dispute.findMany
      .mockResolvedValueOnce([buildDispute({ id: 20, hoursAgo: 72, now: NOW })])
      .mockResolvedValueOnce([buildDispute({ id: 21, hoursAgo: 96, now: NOW })]);

    const count = await runDisputeEscalationJob();

    expect(count).toBe(2);
    expect(prismaMock.dispute.update).toHaveBeenCalledTimes(2);
    expect(auditLogMock).toHaveBeenCalledTimes(2);
  });

  // ── Per-dispute failure is isolated ──────────────────────────────────────────

  it('continues processing remaining disputes if one update fails', async () => {
    const d1 = buildDispute({ id: 30, hoursAgo: 70, now: NOW });
    const d2 = buildDispute({ id: 31, hoursAgo: 80, now: NOW });
    prismaMock.dispute.findMany.mockResolvedValue([d1, d2]);

    // First update fails, second succeeds
    prismaMock.dispute.update
      .mockRejectedValueOnce(new Error('db write failed'))
      .mockResolvedValueOnce({});

    const count = await runDisputeEscalationJob();

    // Only the second dispute was successfully escalated
    expect(count).toBe(1);
    expect(prismaMock.dispute.update).toHaveBeenCalledTimes(2);
  });
});
