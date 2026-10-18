import prisma from '../../lib/prisma.js';
import { DEFAULT_TENANT_SLUG, runWithTenantContext } from '../../lib/tenantContext.js';

const TENANT_LOOKUP_CACHE_TTL_MS = 5000;
const TENANT_LOOKUP_CACHE_MAX_ENTRIES = 500;
const tenantLookupCache = new Map();
const tenantLookupInFlight = new Map();

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

function buildLookupKey(req) {
  const tenantId = req.headers['x-tenant-id'];
  const tenantSlug = req.headers['x-tenant-slug'];
  const hostname = extractHostname(req);

  const normalizedId = typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : '';
  const normalizedSlug =
    typeof tenantSlug === 'string' && tenantSlug.trim() ? tenantSlug.trim().toLowerCase() : '';
  const normalizedHost =
    hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' ? hostname : '';

  return `${normalizedId}|${normalizedSlug}|${normalizedHost}`;
}

function readCachedTenant(key) {
  const entry = tenantLookupCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    tenantLookupCache.delete(key);
    return undefined;
  }
  return entry.tenant;
}

function writeCachedTenant(key, tenant) {
  if (tenantLookupCache.size >= TENANT_LOOKUP_CACHE_MAX_ENTRIES) {
    const oldestKey = tenantLookupCache.keys().next().value;
    if (oldestKey !== undefined) tenantLookupCache.delete(oldestKey);
  }
  tenantLookupCache.set(key, { tenant, expiresAt: Date.now() + TENANT_LOOKUP_CACHE_TTL_MS });
}

async function findTenant(req) {
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
    const matchedTenant = await prisma.tenant.findFirst({
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

  return prisma.tenant.findFirst({
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

async function resolveTenant(req) {
  const key = buildLookupKey(req);

  const cached = readCachedTenant(key);
  if (cached !== undefined) return cached;

  const inFlight = tenantLookupInFlight.get(key);
  if (inFlight) return inFlight;

  const lookup = findTenant(req)
    .then((tenant) => {
      writeCachedTenant(key, tenant);
      return tenant;
    })
    .finally(() => {
      tenantLookupInFlight.delete(key);
    });

  tenantLookupInFlight.set(key, lookup);
  return lookup;
}

export default async function tenantMiddleware(req, res, next) {
  try {
    const tenant = await resolveTenant(req);

    if (!tenant) {
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

    return runWithTenantContext(tenant, () => next());
  } catch (err) {
    return next(err);
  }
}
