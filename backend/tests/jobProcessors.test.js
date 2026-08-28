/**
 * Unit tests for BullMQ job processors — Issue #1
 *
 * Covers:
 *  - cancelExpiredDraftEscrows  (workers/fundingDeadlineJob.js)
 *  - processWebhookJob          (workers/webhookWorker.js)
 *
 * External dependencies (Prisma, emailService, fetch / Horizon) are fully
 * stubbed so no real network or database calls are made.
 */

import { jest } from '@jest/globals';

// ─── Shared Prisma mock ───────────────────────────────────────────────────────

const prismaMock = {
  escrow: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  webhookDelivery: {
    update: jest.fn(),
  },
};

// ─── Email service mock ───────────────────────────────────────────────────────

const emailServiceMock = {
  notifyEscrowStatusChange: jest.fn().mockResolvedValue({ queued: 1 }),
};

// ─── Module mocks must be declared before any dynamic imports ─────────────────

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/emailService.js', () => ({
  default: emailServiceMock,
}));

// ─── Import the modules under test (after mocks are declared) ─────────────────

const { cancelExpiredDraftEscrows } = await import('../workers/fundingDeadlineJob.js');
const { processWebhookJob } = await import('../workers/webhookWorker.js');

// ─────────────────────────────────────────────────────────────────────────────
// cancelExpiredDraftEscrows
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelExpiredDraftEscrows — expiry job processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Happy-path: escrow past deadline → Cancelled + notification ────────────

  it('sets status to Cancelled for a Draft escrow past its funding deadline', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const expiredEscrow = {
      id: 10n,
      status: 'Draft',
      fundingDeadline: new Date('2026-08-01T08:00:00Z'),
      clientAddress: 'GCLIENT111',
      freelancerAddress: 'GFREELANCER111',
    };

    prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...expiredEscrow, status: 'Cancelled' });
    prismaMock.user.findMany.mockResolvedValue([
      { walletAddress: 'GCLIENT111', email: 'client@example.com' },
      { walletAddress: 'GFREELANCER111', email: 'freelancer@example.com' },
    ]);

    const result = await cancelExpiredDraftEscrows(now);

    // Correct query scope
    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith({
      where: { status: 'Draft', fundingDeadline: { lt: now } },
    });

    // Status updated to Cancelled
    expect(prismaMock.escrow.update).toHaveBeenCalledWith({
      where: { id: 10n },
      data: { status: 'Cancelled' },
    });

    // Return value reflects what was processed
    expect(result).toEqual({ checked: 1, cancelled: 1 });
  });

  it('sends a status-change notification to both parties after cancellation', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const expiredEscrow = {
      id: 20n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-31T23:59:00Z'),
      clientAddress: 'GCLIENT222',
      freelancerAddress: 'GFREELANCER222',
    };

    prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...expiredEscrow, status: 'Cancelled' });
    prismaMock.user.findMany.mockResolvedValue([
      { walletAddress: 'GCLIENT222', email: 'c@test.com' },
      { walletAddress: 'GFREELANCER222', email: 'f@test.com' },
    ]);

    await cancelExpiredDraftEscrows(now);

    expect(emailServiceMock.notifyEscrowStatusChange).toHaveBeenCalledTimes(1);

    const payload = emailServiceMock.notifyEscrowStatusChange.mock.calls[0][0];
    expect(payload.escrowId).toBe('20');
    expect(payload.previousStatus).toBe('Draft');
    expect(payload.status).toBe('Cancelled');
    expect(payload.recipients).toHaveLength(2);
    expect(payload.recipients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'c@test.com', address: 'GCLIENT222' }),
        expect.objectContaining({ email: 'f@test.com', address: 'GFREELANCER222' }),
      ]),
    );
  });

  // ── No-op when there are no expired escrows ────────────────────────────────

  it('returns { checked: 0, cancelled: 0 } when no escrows are past their deadline', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    const result = await cancelExpiredDraftEscrows(new Date('2026-08-01T12:00:00Z'));

    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    expect(emailServiceMock.notifyEscrowStatusChange).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, cancelled: 0 });
  });

  // ── Multiple expired escrows ───────────────────────────────────────────────

  it('cancels every expired escrow in a single run', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const expired = [
      {
        id: 1n,
        status: 'Draft',
        fundingDeadline: new Date('2026-07-30T00:00:00Z'),
        clientAddress: 'GA',
        freelancerAddress: 'GB',
      },
      {
        id: 2n,
        status: 'Draft',
        fundingDeadline: new Date('2026-07-29T00:00:00Z'),
        clientAddress: 'GC',
        freelancerAddress: 'GD',
      },
    ];

    prismaMock.escrow.findMany.mockResolvedValue(expired);
    prismaMock.escrow.update.mockResolvedValue({});
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await cancelExpiredDraftEscrows(now);

    expect(prismaMock.escrow.update).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ checked: 2, cancelled: 2 });
  });

  // ── Notification failure does not prevent cancellation ────────────────────

  it('cancels the escrow even when the notification email call throws', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const expiredEscrow = {
      id: 99n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-31T00:00:00Z'),
      clientAddress: 'GCLIENT999',
      freelancerAddress: 'GFREELANCER999',
    };

    prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...expiredEscrow, status: 'Cancelled' });
    // Simulate email provider failure (mocked Horizon / email call)
    prismaMock.user.findMany.mockRejectedValue(new Error('email provider down'));

    const result = await cancelExpiredDraftEscrows(now);

    // Cancellation must still happen
    expect(prismaMock.escrow.update).toHaveBeenCalledWith({
      where: { id: 99n },
      data: { status: 'Cancelled' },
    });
    expect(result).toEqual({ checked: 1, cancelled: 1 });
  });

  // ── Escrows without email addresses are silently skipped ──────────────────

  it('skips notification when no users have an email address', async () => {
    const now = new Date('2026-08-01T12:00:00Z');
    const expiredEscrow = {
      id: 55n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-31T00:00:00Z'),
      clientAddress: 'GCLIENT555',
      freelancerAddress: null,
    };

    prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...expiredEscrow, status: 'Cancelled' });
    // Users have no email field set
    prismaMock.user.findMany.mockResolvedValue([
      { walletAddress: 'GCLIENT555', email: null },
    ]);

    const result = await cancelExpiredDraftEscrows(now);

    expect(emailServiceMock.notifyEscrowStatusChange).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, cancelled: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// processWebhookJob
// ─────────────────────────────────────────────────────────────────────────────

describe('processWebhookJob — webhook retry processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Successful delivery ────────────────────────────────────────────────────

  it('marks delivery as "success" when the remote endpoint returns 2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(''),
    });
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const job = {
      data: {
        deliveryId: 'del-001',
        url: 'https://example.com/hook',
        payload: { event: 'escrow.created' },
        headers: { 'X-Webhook-Signature': 'sha256=abc' },
      },
      attemptsMade: 0,
      opts: { attempts: 5 },
    };

    await expect(processWebhookJob(job)).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(job.data.payload),
      }),
    );

    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'del-001' },
      data: expect.objectContaining({
        status: 'success',
        responseCode: 200,
        attempts: 1,
      }),
    });
  });

  it('records the attempt count correctly on the first attempt', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, text: jest.fn() });
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const job = {
      data: { deliveryId: 'del-002', url: 'https://example.com/hook', payload: {}, headers: {} },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    await processWebhookJob(job);

    const { attempts } = prismaMock.webhookDelivery.update.mock.calls[0][0].data;
    expect(attempts).toBe(1); // attemptsMade(0) + 1
  });

  // ── Failed delivery — intermediate retry ──────────────────────────────────

  it('keeps delivery status as "pending" when a non-terminal attempt fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const job = {
      data: {
        deliveryId: 'del-003',
        url: 'https://example.com/hook',
        payload: {},
        headers: {},
      },
      attemptsMade: 1,   // second attempt of five — NOT the last
      opts: { attempts: 5 },
    };

    await expect(processWebhookJob(job)).rejects.toThrow('connection refused');

    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'del-003' },
      data: expect.objectContaining({
        status: 'pending',
        attempts: 2,
        errorMessage: expect.stringContaining('connection refused'),
      }),
    });
  });

  it('re-queues (throws) so BullMQ retries after a non-terminal failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const job = {
      data: { deliveryId: 'del-004', url: 'https://example.com/hook', payload: {}, headers: {} },
      attemptsMade: 0,
      opts: { attempts: 5 },
    };

    // processWebhookJob must rethrow so BullMQ schedules the next attempt
    await expect(processWebhookJob(job)).rejects.toThrow('timeout');
  });

  // ── Max retries reached → dead-letter ─────────────────────────────────────

  it('marks delivery as "failed" when the final allowed attempt exhausts the retry count', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const job = {
      data: {
        deliveryId: 'del-005',
        url: 'https://example.com/hook',
        payload: { event: 'escrow.funded' },
        headers: {},
      },
      attemptsMade: 4,   // five total attempts (0-indexed), max = 5 → terminal
      opts: { attempts: 5 },
    };

    await expect(processWebhookJob(job)).rejects.toThrow('network error');

    expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'del-005' },
      data: expect.objectContaining({
        status: 'failed',
        attempts: 5,
        errorMessage: expect.stringContaining('network error'),
      }),
    });
  });

  it('moves to dead-letter by marking "failed" on the very last retry', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('503 Service Unavailable'));
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    // attempts = 3 means three total attempts allowed; attemptsMade = 2 → third attempt
    const job = {
      data: { deliveryId: 'del-006', url: 'https://example.com/hook', payload: {}, headers: {} },
      attemptsMade: 2,
      opts: { attempts: 3 },
    };

    await expect(processWebhookJob(job)).rejects.toThrow();

    const updateCall = prismaMock.webhookDelivery.update.mock.calls[0][0];
    expect(updateCall.data.status).toBe('failed');
    expect(updateCall.data.attempts).toBe(3);
  });

  // ── HTTP error response (4xx / 5xx) ──────────────────────────────────────

  it('treats a non-ok HTTP response as a failure and throws so BullMQ retries', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    });
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const job = {
      data: { deliveryId: 'del-007', url: 'https://example.com/hook', payload: {}, headers: {} },
      attemptsMade: 0,
      opts: { attempts: 5 },
    };

    await expect(processWebhookJob(job)).rejects.toThrow('Webhook failed: 500');

    const updateData = prismaMock.webhookDelivery.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('pending'); // not the last attempt
    expect(updateData.errorMessage).toMatch(/500/);
  });

  // ── Delivery headers are forwarded ────────────────────────────────────────

  it('forwards custom headers (HMAC signature, delivery ID) to the remote endpoint', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: jest.fn() });
    prismaMock.webhookDelivery.update.mockResolvedValue({});

    const customHeaders = {
      'X-Webhook-Signature': 'sha256=deadbeef',
      'X-Webhook-Delivery-Id': 'del-008',
    };

    const job = {
      data: {
        deliveryId: 'del-008',
        url: 'https://example.com/hook',
        payload: {},
        headers: customHeaders,
      },
      attemptsMade: 0,
      opts: { attempts: 5 },
    };

    await processWebhookJob(job);

    const fetchOpts = global.fetch.mock.calls[0][1];
    expect(fetchOpts.headers).toMatchObject(customHeaders);
    expect(fetchOpts.headers['Content-Type']).toBe('application/json');
  });
});
