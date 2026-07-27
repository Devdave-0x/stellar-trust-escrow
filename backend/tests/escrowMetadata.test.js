import { jest } from '@jest/globals';

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

const prismaMock = {
  $transaction: jest.fn(async (operations) => operations),
  $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  escrow: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  milestone: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
};

const submitTransactionMock = jest.fn();

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../services/stellarService.js', () => ({
  submitTransaction: submitTransactionMock,
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
}));
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  xdr: { ScVal: { fromXDR: jest.fn(() => ({ type: 'u64', value: () => 42n })) } },
  scValToNative: jest.fn(() => 42n),
  SorobanRpc: {},
  Transaction: jest.fn(),
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
    PUBLIC: 'Public Global Stellar Network ; September 2015',
  },
}));

const { default: escrowController } = await import('../api/controllers/escrowController.js');

function createMockRes() {
  return {
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
}

const CLIENT = 'GCLIENT0000000000000000000000000000000000000000000000000';
const FREELANCER = 'GFREELANCER00000000000000000000000000000000000000000000';
const STRANGER = 'GSTRANGER000000000000000000000000000000000000000000000';

beforeEach(() => {
  jest.clearAllMocks();
  cacheMock.get.mockReturnValue(null);
  prismaMock.escrow.upsert.mockResolvedValue({});
  prismaMock.escrow.findMany.mockResolvedValue([]);
  prismaMock.escrow.count.mockResolvedValue(0);
});

describe('escrow metadata — creation (broadcastCreateEscrow)', () => {
  beforeEach(() => {
    submitTransactionMock.mockResolvedValue({
      hash: 'abc123',
      status: 'SUCCESS',
      returnValue: null,
    });
  });

  it('rejects metadata with more than 20 keys', async () => {
    const metadata = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']));
    const req = { body: { signedXdr: 'AAAA...', metadata } };
    const res = createMockRes();

    await escrowController.broadcastCreateEscrow(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prismaMock.escrow.upsert).not.toHaveBeenCalled();
  });

  it('rejects metadata values that are not string/number/boolean', async () => {
    const req = { body: { signedXdr: 'AAAA...', metadata: { nested: { a: 1 } } } };
    const res = createMockRes();

    await escrowController.broadcastCreateEscrow(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prismaMock.escrow.upsert).not.toHaveBeenCalled();
  });

  it('saves valid metadata on the created escrow row', async () => {
    submitTransactionMock.mockResolvedValue({
      hash: 'abc123',
      status: 'SUCCESS',
      returnValue: 'AAAAAA==',
    });
    const metadata = { propertyType: 'condo', bedrooms: 2, furnished: true };
    const req = { body: { signedXdr: 'AAAA...', metadata } };
    const res = createMockRes();

    await escrowController.broadcastCreateEscrow(req, res);

    expect(res.statusCode).toBe(200);
    expect(prismaMock.escrow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ metadata }),
      }),
    );
  });
});

describe('escrow metadata — PATCH /:id/metadata (merge update)', () => {
  it('merges new keys into existing metadata rather than replacing it', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue({
      metadata: { propertyType: 'condo', bedrooms: 2 },
      clientAddress: CLIENT,
      freelancerAddress: FREELANCER,
    });
    prismaMock.escrow.update.mockImplementation(async ({ data }) => ({ id: 1n, ...data }));

    const req = {
      params: { id: '1' },
      body: { metadata: { bedrooms: 3, furnished: true } },
      user: { address: CLIENT },
    };
    const res = createMockRes();

    await escrowController.updateEscrowMetadata(req, res);

    expect(prismaMock.escrow.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { metadata: { propertyType: 'condo', bedrooms: 3, furnished: true } },
    });
    expect(res.body.metadata).toEqual({ propertyType: 'condo', bedrooms: 3, furnished: true });
  });

  it('rejects a merge that would push the total over 20 keys', async () => {
    const existing = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [`k${i}`, 'v']));
    prismaMock.escrow.findUnique.mockResolvedValue({
      metadata: existing,
      clientAddress: CLIENT,
      freelancerAddress: FREELANCER,
    });

    const req = {
      params: { id: '1' },
      body: { metadata: { newA: 'x', newB: 'y' } },
      user: { address: CLIENT },
    };
    const res = createMockRes();

    await escrowController.updateEscrowMetadata(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
  });

  it('rejects invalid value types in the patch', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue({
      metadata: {},
      clientAddress: CLIENT,
      freelancerAddress: FREELANCER,
    });

    const req = {
      params: { id: '1' },
      body: { metadata: { tags: ['a', 'b'] } },
      user: { address: CLIENT },
    };
    const res = createMockRes();

    await escrowController.updateEscrowMetadata(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent escrow', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue(null);

    const req = { params: { id: '1' }, body: { metadata: { a: 'b' } }, user: { address: CLIENT } };
    const res = createMockRes();

    await escrowController.updateEscrowMetadata(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 for a caller who is not a party to the escrow', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue({
      metadata: {},
      clientAddress: CLIENT,
      freelancerAddress: FREELANCER,
    });

    const req = {
      params: { id: '1' },
      body: { metadata: { a: 'b' } },
      user: { address: STRANGER },
    };
    const res = createMockRes();

    await escrowController.updateEscrowMetadata(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(prismaMock.escrow.update).not.toHaveBeenCalled();
  });
});

describe('escrow metadata — GET /escrows metadata[key]=value filter', () => {
  it('builds a Prisma JSON path filter from metadata query params', async () => {
    const req = { query: { metadata: { propertyType: 'condo' } } };
    const res = createMockRes();

    await escrowController.listEscrows(req, res);

    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ metadata: { path: ['propertyType'], equals: 'condo' } }]),
        }),
      }),
    );
  });

  it('combines multiple metadata filters with existing filters', async () => {
    const req = { query: { status: 'Active', metadata: { propertyType: 'condo', bedrooms: '2' } } };
    const res = createMockRes();

    await escrowController.listEscrows(req, res);

    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'Active',
          AND: expect.arrayContaining([
            { metadata: { path: ['propertyType'], equals: 'condo' } },
            { metadata: { path: ['bedrooms'], equals: '2' } },
          ]),
        }),
      }),
    );
  });
});
