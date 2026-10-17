import prisma from '../../lib/prisma.js';
import { DEFAULT_TENANT_SLUG, runWithTenantContext } from '../../lib/tenantContext.js';
import { createModuleLogger } from '../../config/logger.js';

const log = createModuleLogger('tenantMiddleware');

function buildTenantEmptyState({ title, description, action }) {
  return {
    title,
    description,
    action,
  };
}

function extractHostname(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host;

  if (!rawHost) return null;

  return rawHost.split(',')[0].trim().split(':')[0].toLowerCase();
}

async function findTenant(req, database = prisma) {
  const tenantId = req.headers['x-tenant-id'];
  const tenantSlug = req.headers['x-tenant-slug'];
  const hostname = extractHostname(req);

  const or = [];
  if (typeof tenantId === 'string' && tenantId.trim()) {
    or.push({ id: tenantId.trim() });
  }
  if (typeof tenantSlug === 'string' && tenantSlug.trim()) {
    or.push({ slug: tenantSlug.trim().toLowerCase() });
  }
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    or.push({ domains: { has: hostname } });
  }

  if (or.length > 0) {
    const matchedTenant = await database.tenant.findFirst({
      where: { OR: or },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        domains: true,
        branding: true,
        configuration: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (matchedTenant) return matchedTenant;
    return null;
  }

  return database.tenant.findFirst({
    where: { slug: DEFAULT_TENANT_SLUG },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      domains: true,
      branding: true,
      configuration: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export function createTenantMiddleware({ database = prisma, logger = log } = {}) {
  return async function tenantMiddleware(req, res, next) {
  try {
    const tenant = await findTenant(req, database);

    if (!tenant) {
      logger.warn({ message: 'tenant_resolution_failed', outcome: 'not_found' });
      return res.status(404).json({
        error: 'Tenant not found',
        emptyState: buildTenantEmptyState({
          title: 'No tenant matched this request',
          description:
            'Check the tenant slug, tenant id, or request hostname and try again.',
          action: 'Provide a valid tenant identifier or configure the default tenant.',
        }),
      });
    }

    if (tenant.status !== 'active') {
      logger.warn({ message: 'tenant_resolution_failed', outcome: 'inactive' });
      const message = tenant.status === 'suspended' ? 'Tenant suspended' : 'Tenant is not active';
      return res.status(403).json({
        error: message,
        emptyState: buildTenantEmptyState({
          title: 'Tenant is unavailable',
          description:
            tenant.status === 'suspended'
              ? 'This tenant is suspended and cannot serve API requests right now.'
              : 'This tenant exists but is not currently active.',
          action: 'Reactivate the tenant or switch to an active tenant before retrying.',
        }),
      });
    }

    req.tenant = tenant;
    res.locals.tenant = tenant;
    res.setHeader('X-Tenant-Slug', tenant.slug);
    logger.debug({ message: 'tenant_context_started', outcome: 'active' });

    return runWithTenantContext(tenant, () => next());
  } catch (err) {
    logger.error({ message: 'tenant_resolution_failed', outcome: 'dependency_error', errorType: err.name || 'Error' });
    return next(err);
  }
  };
}

const tenantMiddleware = createTenantMiddleware();

export { findTenant };
export default tenantMiddleware;
