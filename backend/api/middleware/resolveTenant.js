/**
 * Tenant Resolution Middleware
 *
 * Reads the `x-tenant-id` header and, if it references a known tenant,
 * attaches it to `req.tenant`. Non-blocking: requests without a valid
 * tenant header simply proceed without `req.tenant` set — routes that
 * require a tenant (e.g. GET /api/tenants/me/usage) check for it themselves.
 *
 * @module middleware/resolveTenant
 */

import prisma from '../../lib/prisma.js';

const resolveTenant = async (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];

  if (!tenantId || !/^\d+$/.test(tenantId)) {
    return next();
  }

  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: parseInt(tenantId) } });
    if (tenant) req.tenant = tenant;
  } catch (err) {
    console.error('[resolveTenant] lookup failed:', err.message);
  }

  next();
};

export default resolveTenant;
