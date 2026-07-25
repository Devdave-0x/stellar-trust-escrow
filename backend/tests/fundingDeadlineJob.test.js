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

const emailServiceMock = {
  notifyEscrowStatusChange: jest.fn(async () => ({ queued: 1 })),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/emailService.js', () => ({ default: emailServiceMock }));

const { cancelExpiredDraftEscrows } = await import('../workers/fundingDeadlineJob.js');

describe('cancelExpiredDraftEscrows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      where: { status: 'Draft', fundingDeadline: { lt: now } },
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
    expect(result).toEqual({ checked: 1, cancelled: 1 });
  });

  it('does nothing when there are no expired Draft escrows', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    const result = await cancelExpiredDraftEscrows(new Date('2026-07-25T12:00:00Z'));

    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
    expect(emailServiceMock.notifyEscrowStatusChange).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, cancelled: 0 });
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
    expect(result).toEqual({ checked: 1, cancelled: 1 });
  });
});
