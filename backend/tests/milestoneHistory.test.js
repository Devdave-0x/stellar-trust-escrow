import { jest, describe, expect, it, beforeEach } from '@jest/globals';

const prismaMock = {
  escrow: {
    findUnique: jest.fn(),
  },
  milestone: {
    findUnique: jest.fn(),
  },
  milestoneStatusHistory: {
    findMany: jest.fn(),
  },
};

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
  invalidateTags: jest.fn(),
  analytics: jest.fn(() => ({
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
    hitRate: '0',
    backend: 'memory',
    memSize: 0,
  })),
  size: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../services/stellarService.js', () => ({
  submitTransaction: jest.fn(),
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  xdr: { ScVal: { fromXDR: jest.fn() } },
  scValToNative: jest.fn(),
  SorobanRpc: {},
  Transaction: jest.fn(),
  Networks: { TESTNET: 'Test SDF Network ; September 2015', PUBLIC: 'Public Global Stellar Network ; September 2015' },
}));

const { default: escrowController } = await import('../api/controllers/escrowController.js');

const ESCROW = {
  clientAddress: 'GCLIENT1',
  freelancerAddress: 'GFREELANCER1',
  arbiterAddress: 'GARBITER1',
};

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.escrow.findUnique.mockResolvedValue(ESCROW);
  prismaMock.milestone.findUnique.mockResolvedValue({ id: 5 });
  prismaMock.milestoneStatusHistory.findMany.mockResolvedValue([]);
});

describe('escrowController.getMilestoneHistory', () => {
  it('returns 404 when the escrow does not exist', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue(null);
    const req = { params: { id: '1', milestoneId: '0' }, query: {}, user: { address: 'GCLIENT1' } };
    const res = createMockRes();

    await escrowController.getMilestoneHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it.each([
    ['client', 'GCLIENT1'],
    ['freelancer', 'GFREELANCER1'],
    ['arbiter', 'GARBITER1'],
  ])('allows the %s to view history (200)', async (_label, address) => {
    const rows = [{ id: 1n, milestoneId: 5, fromStatus: 'Pending', toStatus: 'Submitted', createdAt: new Date() }];
    prismaMock.milestoneStatusHistory.findMany.mockResolvedValue(rows);

    const req = { params: { id: '1', milestoneId: '0' }, query: {}, user: { address } };
    const res = createMockRes();

    await escrowController.getMilestoneHistory(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ data: rows, next_cursor: null, has_more: false });
  });

  it('allows admins to view history (200)', async () => {
    const req = {
      params: { id: '1', milestoneId: '0' },
      query: {},
      user: { address: 'GSOMEONE_ELSE', role: 'admin' },
    };
    const res = createMockRes();

    await escrowController.getMilestoneHistory(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it('blocks a non-participant with 403', async () => {
    const req = { params: { id: '1', milestoneId: '0' }, query: {}, user: { address: 'GRANDOM' } };
    const res = createMockRes();

    await escrowController.getMilestoneHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prismaMock.milestoneStatusHistory.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the milestone does not exist', async () => {
    prismaMock.milestone.findUnique.mockResolvedValue(null);
    const req = { params: { id: '1', milestoneId: '99' }, query: {}, user: { address: 'GCLIENT1' } };
    const res = createMockRes();

    await escrowController.getMilestoneHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('queries history oldest-first (ascending createdAt) by default', async () => {
    const req = { params: { id: '1', milestoneId: '0' }, query: {}, user: { address: 'GCLIENT1' } };
    const res = createMockRes();

    await escrowController.getMilestoneHistory(req, res);

    expect(prismaMock.milestoneStatusHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { milestoneId: 5 },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns 400 for an invalid escrow id', async () => {
    const req = { params: { id: 'not-a-number', milestoneId: '0' }, query: {}, user: { address: 'GCLIENT1' } };
    const res = createMockRes();

    await escrowController.getMilestoneHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
