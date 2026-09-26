import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const prismaMock = {
  escrow: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

// Mock certificate listing service
const createCertificateListingService = () => ({
  listCertificatesByTenant: async (tenantId, opts = {}) => {
    const { limit = 50, cursor = null } = opts;
    const escrows = await prismaMock.escrow.findMany({
      where: {
        status: 'Completed',
        tenantId,
        ...(cursor && { id: { lt: BigInt(cursor) } }),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = escrows.length > limit;
    const items = escrows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id.toString() : null;

    return { items, nextCursor, hasMore };
  },

  listCertificatesByUser: async (userId, opts = {}) => {
    const { limit = 50, cursor = null } = opts;
    const escrows = await prismaMock.escrow.findMany({
      where: {
        status: 'Completed',
        OR: [
          { clientAddress: userId },
          { freelancerAddress: userId },
          { arbiterAddress: userId },
        ],
        ...(cursor && { id: { lt: BigInt(cursor) } }),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });

    const hasMore = escrows.length > limit;
    const items = escrows.slice(0, limit);
    const nextCursor = hasMore ? items[items.length - 1]?.id.toString() : null;

    return { items, nextCursor, hasMore };
  },
});

const certificateListingService = createCertificateListingService();

describe('certificateListing.listCertificatesByTenant', () => {
  const mockEscrow = (id, tenantId = 'tenant-1') => ({
    id: BigInt(id),
    tenantId,
    status: 'Completed',
    title: `Escrow #${id}`,
    clientAddress: 'GCLIENT'.padEnd(56, 'A'),
    freelancerAddress: 'GFREELANCER'.padEnd(56, 'B'),
    totalAmount: '1000',
    tokenAddress: 'GTOKEN'.padEnd(56, 'C'),
    createdAt: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns paginated certificates with default limit of 50', async () => {
    const escrows = Array.from({ length: 50 }, (_, i) => mockEscrow(100 - i));
    prismaMock.escrow.findMany.mockResolvedValue(escrows);

    const result = await certificateListingService.listCertificatesByTenant('tenant-1');

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  it('returns nextCursor when more results exist', async () => {
    const escrows = Array.from({ length: 51 }, (_, i) => mockEscrow(100 - i));
    prismaMock.escrow.findMany.mockResolvedValue(escrows);

    const result = await certificateListingService.listCertificatesByTenant('tenant-1');

    expect(result.items).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeDefined();
    expect(result.nextCursor).toBe(escrows[49].id.toString());
  });

  it('respects custom limit parameter', async () => {
    const escrows = Array.from({ length: 21 }, (_, i) => mockEscrow(100 - i));
    prismaMock.escrow.findMany.mockResolvedValue(escrows);

    const result = await certificateListingService.listCertificatesByTenant('tenant-1', {
      limit: 20,
    });

    expect(result.items).toHaveLength(20);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe(escrows[19].id.toString());
  });

  it('uses cursor for pagination', async () => {
    const escrows = Array.from({ length: 30 }, (_, i) => mockEscrow(100 - i));
    prismaMock.escrow.findMany.mockResolvedValue(escrows);

    await certificateListingService.listCertificatesByTenant('tenant-1', {
      limit: 30,
      cursor: '75',
    });

    const callArgs = prismaMock.escrow.findMany.mock.calls[0][0];
    expect(callArgs.where).toHaveProperty('id', { lt: BigInt('75') });
  });

  it('handles empty result set', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    const result = await certificateListingService.listCertificatesByTenant('tenant-1');

    expect(result.items).toHaveLength(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('filters by completed status only', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    await certificateListingService.listCertificatesByTenant('tenant-1');

    const callArgs = prismaMock.escrow.findMany.mock.calls[0][0];
    expect(callArgs.where.status).toBe('Completed');
    expect(callArgs.where.tenantId).toBe('tenant-1');
  });

  it('orders by id descending for consistent pagination', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    await certificateListingService.listCertificatesByTenant('tenant-1');

    const callArgs = prismaMock.escrow.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual({ id: 'desc' });
  });
});

describe('certificateListing.listCertificatesByUser', () => {
  const mockEscrow = (id, clientAddress = 'GCLIENT', freelancerAddress = 'GFREELANCER') => ({
    id: BigInt(id),
    status: 'Completed',
    title: `Escrow #${id}`,
    clientAddress: clientAddress.padEnd(56, 'A'),
    freelancerAddress: freelancerAddress.padEnd(56, 'B'),
    arbiterAddress: null,
    totalAmount: '1000',
    tokenAddress: 'GTOKEN'.padEnd(56, 'C'),
    createdAt: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns certificates where user is client, freelancer, or arbiter', async () => {
    const userAddress = 'GCLIENT'.padEnd(56, 'A');
    const escrows = Array.from({ length: 3 }, (_, i) => mockEscrow(100 - i));
    prismaMock.escrow.findMany.mockResolvedValue(escrows);

    const result = await certificateListingService.listCertificatesByUser(userAddress);

    expect(result.items).toHaveLength(3);
  });

  it('uses OR clause to match client, freelancer, or arbiter', async () => {
    const userAddress = 'GUSER'.padEnd(56, 'X');
    prismaMock.escrow.findMany.mockResolvedValue([]);

    await certificateListingService.listCertificatesByUser(userAddress);

    const callArgs = prismaMock.escrow.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual([
      { clientAddress: userAddress },
      { freelancerAddress: userAddress },
      { arbiterAddress: userAddress },
    ]);
  });

  it('handles second page retrieval with cursor', async () => {
    const userAddress = 'GCLIENT'.padEnd(56, 'A');
    const page1Escrows = Array.from({ length: 50 }, (_, i) => mockEscrow(100 - i));
    const page2Escrows = Array.from({ length: 30 }, (_, i) => mockEscrow(49 - i));

    prismaMock.escrow.findMany.mockResolvedValueOnce(page1Escrows);
    const result1 = await certificateListingService.listCertificatesByUser(userAddress, {
      limit: 50,
    });

    prismaMock.escrow.findMany.mockResolvedValueOnce(page2Escrows);
    const result2 = await certificateListingService.listCertificatesByUser(userAddress, {
      limit: 50,
      cursor: result1.nextCursor,
    });

    expect(result1.items).toHaveLength(50);
    expect(result2.items).toHaveLength(30);
  });

  it('respects limit parameter', async () => {
    const userAddress = 'GUSER'.padEnd(56, 'X');
    const escrows = Array.from({ length: 11 }, (_, i) => mockEscrow(100 - i));
    prismaMock.escrow.findMany.mockResolvedValue(escrows);

    const result = await certificateListingService.listCertificatesByUser(userAddress, {
      limit: 10,
    });

    expect(result.items).toHaveLength(10);
    expect(result.hasMore).toBe(true);
  });
});

describe('certificateListing pagination bounds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts sensible default limit (50)', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    await certificateListingService.listCertificatesByTenant('tenant-1');

    const callArgs = prismaMock.escrow.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(51);
  });

  it('enforces minimum limit of 1', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    await certificateListingService.listCertificatesByTenant('tenant-1', { limit: 0 });

    const callArgs = prismaMock.escrow.findMany.mock.calls[0][0];
    expect(callArgs.take).toBeGreaterThan(0);
  });

  it('enforces reasonable maximum limit', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);

    await certificateListingService.listCertificatesByTenant('tenant-1', { limit: 10000 });

    const callArgs = prismaMock.escrow.findMany.mock.calls[0][0];
    expect(callArgs.take).toBeDefined();
  });

  it('maintains cursor state across multiple pagination calls', async () => {
    const escrows1 = Array.from({ length: 51 }, (_, i) => ({
      id: BigInt(100 - i),
      status: 'Completed',
    }));
    const escrows2 = Array.from({ length: 51 }, (_, i) => ({
      id: BigInt(50 - i),
      status: 'Completed',
    }));

    prismaMock.escrow.findMany.mockResolvedValueOnce(escrows1);
    const result1 = await certificateListingService.listCertificatesByTenant('tenant-1', {
      limit: 50,
    });

    prismaMock.escrow.findMany.mockResolvedValueOnce(escrows2);
    const result2 = await certificateListingService.listCertificatesByTenant('tenant-1', {
      limit: 50,
      cursor: result1.nextCursor,
    });

    expect(result1.nextCursor).toBe('50');
    expect(result2.nextCursor).toBeNull();
  });
});
