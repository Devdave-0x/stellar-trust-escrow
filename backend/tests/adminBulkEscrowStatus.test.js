import { jest } from '@jest/globals';

// keyRotationService.js is referenced by adminController.js but doesn't exist
// in this checkout (pre-existing gap, unrelated to bulk-status) — stub it so
// this suite can import the controller in isolation.
jest.unstable_mockModule('../services/keyRotationService.js', () => ({
  default: { rotateKey: jest.fn(), getValidPublicKeys: jest.fn(), getCurrentSigningKey: jest.fn() },
}));

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
};

const prismaMock = {
  escrow: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  adminAuditLog: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: adminController } = await import('../api/controllers/adminController.js');

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

function buildReq(body) {
  return { body, tenant: { id: 'tenant_default' } };
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn) => fn(prismaMock));
});

describe('adminController.bulkUpdateEscrowStatus', () => {
  it('updates all escrows when every transition is valid', async () => {
    prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => ({
      id: where.id,
      status: 'Active',
    }));

    const req = buildReq({
      escrow_ids: ['1', '2', '3'],
      status: 'Cancelled',
      reason: 'tenant suspended',
    });
    const res = createMockRes();

    await adminController.bulkUpdateEscrowStatus(req, res);

    expect(res.body.updated).toBe(3);
    expect(res.body.failed).toEqual([]);
    expect(prismaMock.escrow.update).toHaveBeenCalledTimes(3);
    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledTimes(3);
    expect(cacheMock.invalidatePrefix).toHaveBeenCalledWith('escrows');
  });

  it('reports partial failures without rolling back successful updates', async () => {
    prismaMock.escrow.findFirst.mockImplementation(async ({ where }) => {
      if (where.id === 1n) return { id: 1n, status: 'Active' }; // will succeed
      if (where.id === 2n) return null; // not found
      if (where.id === 3n) return { id: 3n, status: 'Completed' }; // terminal, invalid transition
      return null;
    });

    const req = buildReq({ escrow_ids: ['1', '2', '3'], status: 'Cancelled' });
    const res = createMockRes();

    await adminController.bulkUpdateEscrowStatus(req, res);

    expect(res.body.updated).toBe(1);
    expect(res.body.failed).toEqual([
      { escrow_id: '2', reason: 'Escrow not found' },
      { escrow_id: '3', reason: 'Invalid transition: Completed -> Cancelled' },
    ]);
    expect(prismaMock.escrow.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a specific invalid transition (Completed -> Active)', async () => {
    prismaMock.escrow.findFirst.mockResolvedValue({ id: 5n, status: 'Completed' });

    const req = buildReq({ escrow_ids: ['5'], status: 'Active' });
    const res = createMockRes();

    await adminController.bulkUpdateEscrowStatus(req, res);

    expect(res.body.updated).toBe(0);
    expect(res.body.failed).toEqual([
      { escrow_id: '5', reason: 'Invalid transition: Completed -> Active' },
    ]);
    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
  });

  it('rejects requests with more than 50 escrow_ids', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => String(i + 1));
    const req = buildReq({ escrow_ids: ids, status: 'Cancelled' });
    const res = createMockRes();

    await adminController.bulkUpdateEscrowStatus(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/maximum of 50/i);
    expect(prismaMock.escrow.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an empty escrow_ids array', async () => {
    const req = buildReq({ escrow_ids: [], status: 'Cancelled' });
    const res = createMockRes();

    await adminController.bulkUpdateEscrowStatus(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid target status', async () => {
    const req = buildReq({ escrow_ids: ['1'], status: 'NotARealStatus' });
    const res = createMockRes();

    await adminController.bulkUpdateEscrowStatus(req, res);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.escrow.findFirst).not.toHaveBeenCalled();
  });
});
