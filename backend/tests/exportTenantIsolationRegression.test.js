import { describe, expect, it } from '@jest/globals';
import { assertTenantFromAuthenticatedContext, resolveAuthenticatedTenantId } from '../api/middleware/tenant.js';

describe('export/search tenant isolation — issue 908', () => {
  it('rejects spoofed tenant headers when auth tenant is set', () => {
    const req = { user: { tenantId: 'tenant-a' }, headers: { 'x-tenant-id': 'tenant-b' } };
    const res = {
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
    expect(assertTenantFromAuthenticatedContext(req, res)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(resolveAuthenticatedTenantId(req)).toBe('tenant-a');
  });
});