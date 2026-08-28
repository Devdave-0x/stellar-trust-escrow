import { jest, describe, expect, it, beforeEach } from '@jest/globals';

const prismaMock = {
  milestoneStatusHistory: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const {
  recordStatusChange,
  getMilestoneStatusHistory,
  getLastStatusChange,
  getLastStatusChangeBatch,
  formatStatusChange,
} = await import('../services/milestoneHistoryService.js');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('milestoneHistoryService', () => {
  describe('recordStatusChange', () => {
    it('writes a history row with the given fields', async () => {
      prismaMock.milestoneStatusHistory.create.mockResolvedValue({ id: 1n });

      await recordStatusChange({
        milestoneId: 5,
        escrowId: 1,
        fromStatus: 'Pending',
        toStatus: 'Submitted',
        changedBy: 'GFREELANCER1',
        reason: 'submitted work',
      });

      expect(prismaMock.milestoneStatusHistory.create).toHaveBeenCalledWith({
        data: {
          milestoneId: 5,
          escrowId: 1n,
          fromStatus: 'Pending',
          toStatus: 'Submitted',
          changedBy: 'GFREELANCER1',
          reason: 'submitted work',
        },
      });
    });

    it('never throws — returns null when the write fails', async () => {
      prismaMock.milestoneStatusHistory.create.mockRejectedValue(new Error('DB down'));

      const result = await recordStatusChange({
        milestoneId: 5,
        escrowId: 1,
        toStatus: 'Submitted',
        changedBy: 'GFREELANCER1',
      });

      expect(result).toBeNull();
    });

    it('returns null for malformed escrow ids on the unhappy path', async () => {
      const result = await recordStatusChange({
        milestoneId: 5,
        escrowId: 'not-a-number',
        toStatus: 'Submitted',
        changedBy: 'GFREELANCER1',
      });

      expect(result).toBeNull();
      expect(prismaMock.milestoneStatusHistory.create).not.toHaveBeenCalled();
    });
  });

  describe('getMilestoneStatusHistory', () => {
    it('orders oldest first by default', async () => {
      prismaMock.milestoneStatusHistory.findMany.mockResolvedValue([]);

      await getMilestoneStatusHistory(5, {});

      expect(prismaMock.milestoneStatusHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { milestoneId: 5 },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        }),
      );
    });

    it('returns a cursor-paginated envelope', async () => {
      const rows = [
        { id: 1n, milestoneId: 5, fromStatus: null, toStatus: 'Pending', createdAt: new Date('2026-01-01') },
      ];
      prismaMock.milestoneStatusHistory.findMany.mockResolvedValue(rows);

      const result = await getMilestoneStatusHistory(5, {});

      expect(result).toEqual({ data: rows, next_cursor: null, has_more: false });
    });

    it('falls back cleanly when the cursor token is malformed', async () => {
      prismaMock.milestoneStatusHistory.findMany.mockResolvedValue([]);

      await getMilestoneStatusHistory(5, { cursor: 'not-base64', sortOrder: 'desc' });

      expect(prismaMock.milestoneStatusHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { milestoneId: 5 },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
    });
  });

  describe('getLastStatusChange', () => {
    it('queries for the most recent row by createdAt desc', async () => {
      prismaMock.milestoneStatusHistory.findFirst.mockResolvedValue(null);

      await getLastStatusChange(5);

      expect(prismaMock.milestoneStatusHistory.findFirst).toHaveBeenCalledWith({
        where: { milestoneId: 5 },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getLastStatusChangeBatch', () => {
    it('returns an empty map for an empty input', async () => {
      const result = await getLastStatusChangeBatch([]);
      expect(result).toEqual(new Map());
      expect(prismaMock.milestoneStatusHistory.findMany).not.toHaveBeenCalled();
    });

    it('maps each milestoneId to its latest row', async () => {
      const rows = [
        { id: 2n, milestoneId: 5, toStatus: 'Submitted' },
        { id: 4n, milestoneId: 6, toStatus: 'Approved' },
      ];
      prismaMock.milestoneStatusHistory.findMany.mockResolvedValue(rows);

      const result = await getLastStatusChangeBatch([5, 6]);

      expect(result.get(5)).toEqual(rows[0]);
      expect(result.get(6)).toEqual(rows[1]);
    });

    it('keeps only the latest row when duplicate milestone ids are returned', async () => {
      const rows = [
        { id: 2n, milestoneId: 5, toStatus: 'Submitted' },
        { id: 3n, milestoneId: 5, toStatus: 'Approved' },
      ];
      prismaMock.milestoneStatusHistory.findMany.mockResolvedValue(rows);

      const result = await getLastStatusChangeBatch([5]);

      expect(result.get(5)).toEqual(rows[1]);
    });
  });

  describe('formatStatusChange', () => {
    it('returns null for a null row', () => {
      expect(formatStatusChange(null)).toBeNull();
    });

    it('shapes a row into the public response fields', () => {
      const createdAt = new Date('2026-01-01');
      expect(
        formatStatusChange({
          fromStatus: 'Pending',
          toStatus: 'Submitted',
          changedBy: 'GFREELANCER1',
          reason: 'submitted work',
          createdAt,
        }),
      ).toEqual({
        fromStatus: 'Pending',
        toStatus: 'Submitted',
        changedBy: 'GFREELANCER1',
        reason: 'submitted work',
        createdAt,
      });
    });
  });
});
