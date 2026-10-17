import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: { tenant: { findFirst: jest.fn() } } }));
const { createTenantMiddleware } = await import('../api/middleware/tenant.js');
const { getCurrentTenantId } = await import('../lib/tenantContext.js');

function response() {
  return {
    locals: {},
    setHeader: jest.fn(),
    status: jest.fn(function status() { return this; }),
    json: jest.fn(),
  };
}

describe('tenant context propagation', () => {
  it('keeps overlapping tenant contexts isolated', async () => {
    const database = {
      tenant: {
        findFirst: jest.fn(({ where }) => {
          const id = where.OR[0].id;
          return Promise.resolve({ id, slug: id, status: 'active' });
        }),
      },
    };
    const middleware = createTenantMiddleware({ database, logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } });
    const observed = [];

    await Promise.all(
      ['tenant-a', 'tenant-b'].map((id) =>
        middleware({ headers: { 'x-tenant-id': id } }, response(), async () => {
          await Promise.resolve();
          observed.push(getCurrentTenantId());
        }),
      ),
    );
    expect(observed.sort()).toEqual(['tenant-a', 'tenant-b']);
  });

  it('propagates dependency failures without leaking request identifiers', async () => {
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const middleware = createTenantMiddleware({
      database: { tenant: { findFirst: jest.fn().mockRejectedValue(new Error('private db url')) } },
      logger,
    });
    const next = jest.fn();

    await middleware({ headers: { 'x-tenant-id': 'secret-tenant' } }, response(), next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret-tenant');
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private db url');
  });

  it('returns a stable not-found response for an unknown tenant', async () => {
    const middleware = createTenantMiddleware({
      database: { tenant: { findFirst: jest.fn().mockResolvedValue(null) } },
      logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    const res = response();
    await middleware({ headers: { 'x-tenant-id': 'missing' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
