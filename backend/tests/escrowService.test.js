import { jest, describe, expect, it, beforeEach } from '@jest/globals';

function buildTx() {
  return {
    escrow: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(async (args) => ({ ...args.data })),
      create: jest.fn(),
    },
    milestone: {
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(async (args) => ({ ...args.data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    adminAuditLog: {
      create: jest.fn(async () => ({})),
    },
    dispute: {
      create: jest.fn(async () => ({})),
      update: jest.fn(async () => ({})),
    },
    milestoneStatusHistory: {
      create: jest.fn(async (args) => ({ id: 1n, ...args.data })),
    },
  };
}

const prismaMock = {
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { releaseMilestone, raiseDispute } = await import('../services/escrowService.js');

let tx;

beforeEach(() => {
  jest.clearAllMocks();
  tx = buildTx();
  prismaMock.$transaction.mockImplementation(async (fn) => fn(tx));
});

describe('escrowService — milestone status history', () => {
  describe('releaseMilestone', () => {
    it('records a history row from the milestone previous status to Approved', async () => {
      tx.escrow.findUniqueOrThrow.mockResolvedValue({ remainingBalance: '500', status: 'Active' });
      tx.milestone.findUniqueOrThrow.mockResolvedValue({ id: 7, status: 'Submitted' });

      await releaseMilestone({
        escrowId: 1,
        milestoneIndex: 0,
        amount: '500',
        callerAddress: 'GCLIENT1',
      });

      expect(tx.milestoneStatusHistory.create).toHaveBeenCalledWith({
        data: {
          milestoneId: 7,
          escrowId: 1n,
          fromStatus: 'Submitted',
          toStatus: 'Approved',
          changedBy: 'GCLIENT1',
          reason: 'Milestone released',
        },
      });
    });
  });

  describe('raiseDispute', () => {
    it('records a history row from the milestone previous status to Rejected', async () => {
      tx.escrow.findUniqueOrThrow.mockResolvedValue({ status: 'Active' });
      tx.milestone.findFirst.mockResolvedValue({ id: 9, status: 'Submitted' });

      await raiseDispute({ escrowId: 1, raisedByAddress: 'GFREELANCER1', milestoneIndex: 2 });

      expect(tx.milestoneStatusHistory.create).toHaveBeenCalledWith({
        data: {
          milestoneId: 9,
          escrowId: 1n,
          fromStatus: 'Submitted',
          toStatus: 'Rejected',
          changedBy: 'GFREELANCER1',
          reason: 'Dispute raised',
        },
      });
    });

    it('does not write history when the dispute targets no specific milestone', async () => {
      tx.escrow.findUniqueOrThrow.mockResolvedValue({ status: 'Active' });

      await raiseDispute({ escrowId: 1, raisedByAddress: 'GFREELANCER1' });

      expect(tx.milestoneStatusHistory.create).not.toHaveBeenCalled();
    });

    it('does not write history when the targeted milestone cannot be found', async () => {
      tx.escrow.findUniqueOrThrow.mockResolvedValue({ status: 'Active' });
      tx.milestone.findFirst.mockResolvedValue(null);

      await raiseDispute({ escrowId: 1, raisedByAddress: 'GFREELANCER1', milestoneIndex: 2 });

      expect(tx.milestoneStatusHistory.create).not.toHaveBeenCalled();
    });
  });
});
