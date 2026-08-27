import { jest } from '@jest/globals';

const prismaMock = {
  adminAuditLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: adminController } = await import('../api/controllers/adminController.js');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    written: [],
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
    write(chunk) {
      this.written.push(chunk);
      return true;
    },
    end() {
      this.ended = true;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAuditLogs filtering', () => {
  it('rejects requests without actor_id or resource_id', async () => {
    const res = createResponse();
    await adminController.getAuditLogs({ query: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/actor_id or resource_id/);
    expect(prismaMock.adminAuditLog.findMany).not.toHaveBeenCalled();
  });

  it('filters by actor_id', async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValue([{ id: 1, performedBy: 'admin-1' }]);
    prismaMock.adminAuditLog.count.mockResolvedValue(1);

    const res = createResponse();
    await adminController.getAuditLogs({ query: { actor_id: 'admin-1' } }, res);

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { performedBy: 'admin-1' } }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.logs).toHaveLength(1);
  });

  it('filters by resource_type and resource_id', async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValue([{ id: 2, targetAddress: 'GABC' }]);
    prismaMock.adminAuditLog.count.mockResolvedValue(1);

    const res = createResponse();
    await adminController.getAuditLogs(
      { query: { resource_id: 'GABC', resource_type: 'user' } },
      res,
    );

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetAddress: 'GABC', resourceType: 'user' },
      }),
    );
  });

  it('combines actor, action, and date range filters', async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValue([]);
    prismaMock.adminAuditLog.count.mockResolvedValue(0);

    const res = createResponse();
    await adminController.getAuditLogs(
      {
        query: {
          actor_id: 'admin-1',
          action: 'BAN_USER',
          from: '2026-01-01',
          to: '2026-01-31',
        },
      },
      res,
    );

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          performedBy: 'admin-1',
          action: 'BAN_USER',
          performedAt: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        },
      }),
    );
  });

  it('rejects an invalid "from" date', async () => {
    const res = createResponse();
    await adminController.getAuditLogs({ query: { actor_id: 'admin-1', from: 'not-a-date' } }, res);

    expect(res.statusCode).toBe(400);
  });
});

describe('exportAuditLogsCsv', () => {
  it('requires actor_id or resource_id', async () => {
    const res = createResponse();
    await adminController.exportAuditLogsCsv({ query: {} }, res);

    expect(res.statusCode).toBe(400);
    expect(prismaMock.adminAuditLog.findMany).not.toHaveBeenCalled();
  });

  it('streams CSV rows for a filtered export', async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValue([
      {
        id: 1,
        action: 'BAN_USER',
        targetAddress: 'GABC',
        resourceType: 'user',
        reason: 'spam, abuse',
        performedBy: 'admin-1',
        performedAt: new Date('2026-01-05T00:00:00.000Z'),
      },
    ]);

    const res = createResponse();
    await adminController.exportAuditLogsCsv({ query: { actor_id: 'admin-1' } }, res);

    expect(res.headers['Content-Type']).toMatch(/text\/csv/);
    expect(res.ended).toBe(true);

    const csv = res.written.join('');
    expect(csv).toContain('id,action,targetAddress,resourceType,reason,performedBy,performedAt');
    // Reason field containing a comma must be quoted per RFC 4180
    expect(csv).toContain('"spam, abuse"');
    expect(csv).toContain('GABC');
  });

  it('caps export at 10,000 rows', async () => {
    prismaMock.adminAuditLog.findMany.mockResolvedValue([]);

    const res = createResponse();
    await adminController.exportAuditLogsCsv({ query: { actor_id: 'admin-1' } }, res);

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10000 }),
    );
  });
});

describe('getSettings', () => {
  it('preserves explicit zero-like env values instead of falling back', async () => {
    const originalFee = process.env.PLATFORM_FEE_PERCENT;
    process.env.PLATFORM_FEE_PERCENT = '0';

    const res = createResponse();
    await adminController.getSettings({}, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.platformFeePercent).toBe('0');

    process.env.PLATFORM_FEE_PERCENT = originalFee;
  });
});
