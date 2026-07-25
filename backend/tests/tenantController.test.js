import { jest } from '@jest/globals';

const prismaMock = {
  escrow: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  attachment: {
    aggregate: jest.fn(),
  },
};

const redisMock = {
  get: jest.fn(),
  incr: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../lib/redis.js', () => ({ default: redisMock }));

const { default: tenantController } = await import('../api/controllers/tenantController.js');
const {
  default: apiUsageCounter,
  usageCounterKey,
  currentYearMonth,
} = await import('../api/middleware/apiUsageCounter.js');
const { resetUsageCounters } = await import('../lib/jobs/resetUsageCounters.js');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/tenants/me/usage', () => {
  const tenant = {
    id: 5,
    apiCallLimit: 100000,
    escrowLimit: 1000,
    storageLimitBytes: 5368709120n,
    userLimit: 50,
  };

  it('requires a resolved tenant', async () => {
    const res = createResponse();
    await tenantController.getUsage({}, res);

    expect(res.statusCode).toBe(401);
  });

  it('populates all usage fields with correct plan limits', async () => {
    redisMock.get.mockResolvedValue('42');
    prismaMock.escrow.count.mockResolvedValueOnce(120).mockResolvedValueOnce(8);
    prismaMock.attachment.aggregate.mockResolvedValue({ _sum: { sizeBytes: 2048 } });
    prismaMock.escrow.findMany.mockResolvedValue([
      { clientAddress: 'GAAA', freelancerAddress: 'GBBB' },
      { clientAddress: 'GAAA', freelancerAddress: 'GCCC' },
    ]);

    const req = { tenant };
    const res = createResponse();
    await tenantController.getUsage(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      api_calls_this_month: 42,
      escrows_total: 120,
      escrows_this_month: 8,
      storage_bytes_used: 2048,
      active_users: 3,
      plan_limits: {
        api_calls: 100000,
        escrows: 1000,
        storage_bytes: 5368709120,
        users: 50,
      },
    });
  });

  it('defaults api_calls_this_month to 0 when no counter exists yet', async () => {
    redisMock.get.mockResolvedValue(null);
    prismaMock.escrow.count.mockResolvedValue(0);
    prismaMock.attachment.aggregate.mockResolvedValue({ _sum: { sizeBytes: null } });
    prismaMock.escrow.findMany.mockResolvedValue([]);

    const res = createResponse();
    await tenantController.getUsage({ tenant }, res);

    expect(res.body.api_calls_this_month).toBe(0);
    expect(res.body.storage_bytes_used).toBe(0);
  });
});

describe('apiUsageCounter middleware', () => {
  it('increments the tenant month key when a tenant is resolved', async () => {
    const next = jest.fn();
    const req = { tenant: { id: 5 } };

    await apiUsageCounter(req, {}, next);

    expect(redisMock.incr).toHaveBeenCalledWith(usageCounterKey(5, currentYearMonth()));
    expect(next).toHaveBeenCalled();
  });

  it('does not touch redis when no tenant is resolved', async () => {
    const next = jest.fn();
    await apiUsageCounter({}, {}, next);

    expect(redisMock.incr).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('never blocks the request even if redis fails', async () => {
    redisMock.incr.mockRejectedValue(new Error('redis down'));
    const next = jest.fn();

    await apiUsageCounter({ tenant: { id: 5 } }, {}, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('resetUsageCounters monthly job', () => {
  it('deletes only stale prior-month keys', async () => {
    const current = currentYearMonth();
    redisMock.keys.mockResolvedValue([
      `tenant:5:api_calls:${current}`,
      'tenant:5:api_calls:202501',
      'tenant:7:api_calls:202412',
    ]);

    const deletedCount = await resetUsageCounters();

    expect(redisMock.del).toHaveBeenCalledWith(
      'tenant:5:api_calls:202501',
      'tenant:7:api_calls:202412',
    );
    expect(deletedCount).toBe(2);
  });

  it('does nothing when there are no stale keys', async () => {
    const current = currentYearMonth();
    redisMock.keys.mockResolvedValue([`tenant:5:api_calls:${current}`]);

    const deletedCount = await resetUsageCounters();

    expect(redisMock.del).not.toHaveBeenCalled();
    expect(deletedCount).toBe(0);
  });
});
