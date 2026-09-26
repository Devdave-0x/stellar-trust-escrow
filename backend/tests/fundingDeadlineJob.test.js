import { jest } from '@jest/globals';

const prismaMock = {
  escrow: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

function resetMocks() {
  jest.clearAllMocks();
  prismaMock.escrow.findMany.mockResolvedValue([]);
  prismaMock.escrow.update.mockResolvedValue({});
  prismaMock.user.findMany.mockResolvedValue([]);
}

const emailServiceMock = {
  notifyEscrowStatusChange: jest.fn(async () => ({ queued: 1 })),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: emailServiceMock }));

const { cancelExpiredDraftEscrows } = await import('../workers/fundingDeadlineJob.js');

describe('cancelExpiredDraftEscrows', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('cancels Draft escrows past their funding deadline and notifies both parties', async () => {
    const now = new Date('2026-07-25T12:00:00Z');
    const expiredEscrow = {
      id: 42n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-25T10:00:00Z'),
      clientAddress: 'GCLIENT1',
      freelancerAddress: 'GFREELANCER1',
    };

    prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...expiredEscrow, status: 'Cancelled' });
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, walletAddress: 'GCLIENT1', email: 'client@example.com' },
      { id: 2, walletAddress: 'GFREELANCER1', email: 'freelancer@example.com' },
    ]);

    const result = await cancelExpiredDraftEscrows(now);

    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith({
      where: { fundingDeadline: { lt: now }, status: { in: ['Draft', 'Cancelled'] } },
    });
    expect(prismaMock.escrow.update).toHaveBeenCalledWith({
      where: { id: 42n },
      data: { status: 'Cancelled' },
    });
    expect(emailServiceMock.notifyEscrowStatusChange).toHaveBeenCalledTimes(1);
    const payload = emailServiceMock.notifyEscrowStatusChange.mock.calls[0][0];
    expect(payload.escrowId).toBe('42');
    expect(payload.status).toBe('Cancelled');
    expect(payload.recipients).toHaveLength(2);
    expect(result).toEqual({ checked: 1, cancelled: 1, newlyExpired: 1, alreadyExpired: 0, failed: 0 });
  });

  it('does nothing when there are no expired escrows', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    const result = await cancelExpiredDraftEscrows(new Date('2026-07-25T12:00:00Z'));

    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    expect(emailServiceMock.notifyEscrowStatusChange).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, cancelled: 0, newlyExpired: 0, alreadyExpired: 0, failed: 0 });
  });

  it('still cancels the escrow even if notification fails', async () => {
    const expiredEscrow = {
      id: 7n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-25T10:00:00Z'),
      clientAddress: 'GCLIENT1',
      freelancerAddress: 'GFREELANCER1',
    };
    prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...expiredEscrow, status: 'Cancelled' });
    prismaMock.user.findMany.mockRejectedValue(new Error('db down'));

    const result = await cancelExpiredDraftEscrows(new Date('2026-07-25T12:00:00Z'));

    expect(prismaMock.escrow.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ checked: 1, cancelled: 1, newlyExpired: 1, alreadyExpired: 0, failed: 1 });
  });

  it('detects already-expired escrows (scheduler drift)', async () => {
    const now = new Date('2026-07-25T12:00:00Z');
    const draftEscrow = {
      id: 1n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-25T10:00:00Z'),
      clientAddress: 'GCLIENT1',
      freelancerAddress: 'GFREELANCER1',
    };
    const cancelledEscrow = {
      id: 2n,
      status: 'Cancelled',
      fundingDeadline: new Date('2026-07-24T10:00:00Z'),
      clientAddress: 'GCLIENT2',
      freelancerAddress: 'GFREELANCER2',
    };

    prismaMock.escrow.findMany.mockResolvedValue([draftEscrow, cancelledEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...draftEscrow, status: 'Cancelled' });
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, walletAddress: 'GCLIENT1', email: 'client@example.com' },
    ]);

    const result = await cancelExpiredDraftEscrows(now);

    expect(result.checked).toBe(2);
    expect(result.newlyExpired).toBe(1);
    expect(result.alreadyExpired).toBe(1);
    expect(result.cancelled).toBe(1);
  });

  it('handles multiple Draft escrows mixed with already-Cancelled escrows', async () => {
    const now = new Date('2026-07-25T12:00:00Z');
    const draft1 = {
      id: 1n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-25T10:00:00Z'),
      clientAddress: 'GCLIENT1',
      freelancerAddress: 'GFREELANCER1',
    };
    const draft2 = {
      id: 2n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-24T10:00:00Z'),
      clientAddress: 'GCLIENT2',
      freelancerAddress: 'GFREELANCER2',
    };
    const cancelled = {
      id: 3n,
      status: 'Cancelled',
      fundingDeadline: new Date('2026-07-23T10:00:00Z'),
      clientAddress: 'GCLIENT3',
      freelancerAddress: 'GFREELANCER3',
    };

    prismaMock.escrow.findMany.mockResolvedValue([draft1, draft2, cancelled]);
    prismaMock.escrow.update.mockResolvedValue({ status: 'Cancelled' });
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, walletAddress: 'GCLIENT1', email: 'client@example.com' },
      { id: 2, walletAddress: 'GCLIENT2', email: 'client2@example.com' },
    ]);

    const result = await cancelExpiredDraftEscrows(now);

    expect(result.checked).toBe(3);
    expect(result.cancelled).toBe(2);
    expect(result.newlyExpired).toBe(2);
    expect(result.alreadyExpired).toBe(1);
  });

  it('is idempotent - running twice produces expected counts', async () => {
    const now = new Date('2026-07-25T12:00:00Z');
    const expiredEscrow = {
      id: 42n,
      status: 'Draft',
      fundingDeadline: new Date('2026-07-25T10:00:00Z'),
      clientAddress: 'GCLIENT1',
      freelancerAddress: 'GFREELANCER1',
    };

    prismaMock.escrow.findMany.mockResolvedValue([expiredEscrow]);
    prismaMock.escrow.update.mockResolvedValue({ ...expiredEscrow, status: 'Cancelled' });
    prismaMock.user.findMany.mockResolvedValue([
      { id: 1, walletAddress: 'GCLIENT1', email: 'client@example.com' },
    ]);

    const result1 = await cancelExpiredDraftEscrows(now);
    expect(result1.cancelled).toBe(1);
    expect(result1.newlyExpired).toBe(1);

    prismaMock.escrow.findMany.mockResolvedValue([{ ...expiredEscrow, status: 'Cancelled' }]);
    const result2 = await cancelExpiredDraftEscrows(now);
    expect(result2.cancelled).toBe(0);
    expect(result2.newlyExpired).toBe(0);
    expect(result2.alreadyExpired).toBe(1);
  });
});
