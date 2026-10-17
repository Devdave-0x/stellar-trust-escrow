import { describe, expect, it, jest } from '@jest/globals';

const prisma = { tenant: { findFirst: jest.fn() } };
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prisma }));
const { default: tenantMiddleware, readTenantResolutionConfig } = await import(
  '../api/middleware/tenant.js'
);

function response() {
  return {
    locals: {},
    setHeader: jest.fn(),
    status: jest.fn(function status() { return this; }),
    json: jest.fn(),
  };
}

describe('tenant resolution degradation', () => {
  it('validates the failure mode', () => {
    expect(readTenantResolutionConfig({})).toMatchObject({ failureMode: 'fail_closed' });
    expect(() => readTenantResolutionConfig({ TENANT_RESOLUTION_FAILURE_MODE: 'unsafe' })).toThrow(
      'TENANT_RESOLUTION_FAILURE_MODE',
    );
  });

  it('fails closed by default when persistence is unavailable', async () => {
    delete process.env.TENANT_RESOLUTION_FAILURE_MODE;
    prisma.tenant.findFirst.mockRejectedValue(new Error('database unavailable'));
    const next = jest.fn();
    await tenantMiddleware({ headers: {} }, response(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('uses an explicit degraded default tenant when configured', async () => {
    process.env.TENANT_RESOLUTION_FAILURE_MODE = 'default_tenant';
    prisma.tenant.findFirst.mockRejectedValue(new Error('database unavailable'));
    const req = { headers: {} };
    const res = response();
    const next = jest.fn();
    await tenantMiddleware(req, res, next);
    expect(req.tenant).toMatchObject({ id: 'tenant_default', degraded: true });
    expect(res.setHeader).toHaveBeenCalledWith('X-Tenant-Resolution', 'degraded');
    delete process.env.TENANT_RESOLUTION_FAILURE_MODE;
  });
});
