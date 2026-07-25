import { jest } from '@jest/globals';

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
};

const prismaMock = {
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
  disputeCategory: {
    findUnique: jest.fn(),
  },
  escrow: {
    findUnique: jest.fn(),
  },
  dispute: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  disputeEvidence: {
    findMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: disputeController } = await import('../api/controllers/disputeController.js');

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
  cacheMock.get.mockResolvedValue(null);
  prismaMock.dispute.findUnique.mockResolvedValue(null);
});

describe('disputeController.createDispute', () => {
  it('rejects a dispute without categoryId', async () => {
    const req = { body: { escrowId: '1', raisedByAddress: 'GABC' } };
    const res = createMockRes();

    await disputeController.createDispute(req, res);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it('returns 404 when the category does not exist', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue(null);
    const req = { body: { escrowId: '1', raisedByAddress: 'GABC', categoryId: 99 } };
    const res = createMockRes();

    await disputeController.createDispute(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('auto-assigns the arbiter pool from the category default', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue({
      id: 2,
      name: 'Payment Delay',
      defaultArbiterPoolId: 'pool_payments',
    });
    prismaMock.escrow.findUnique.mockResolvedValue({ id: 1n });
    const created = {
      id: 5,
      escrowId: 1n,
      categoryId: 2,
      assignedArbiterPoolId: 'pool_payments',
    };
    prismaMock.dispute.create.mockResolvedValue(created);

    const req = { body: { escrowId: '1', raisedByAddress: 'GABC', categoryId: 2 } };
    const res = createMockRes();

    await disputeController.createDispute(req, res);

    expect(prismaMock.dispute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: 2,
          assignedArbiterPoolId: 'pool_payments',
        }),
      }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(created);
  });

  it('returns 409 if the escrow already has a dispute', async () => {
    prismaMock.disputeCategory.findUnique.mockResolvedValue({ id: 2, defaultArbiterPoolId: 'pool_general' });
    prismaMock.escrow.findUnique.mockResolvedValue({ id: 1n });
    prismaMock.dispute.findUnique.mockResolvedValue({ id: 1, escrowId: 1n });

    const req = { body: { escrowId: '1', raisedByAddress: 'GABC', categoryId: 2 } };
    const res = createMockRes();

    await disputeController.createDispute(req, res);

    expect(res.statusCode).toBe(409);
  });
});
