/**
 * Prisma Client Singleton with Connection Pooling and Monitoring
 *
 * Reuses a single PrismaClient instance across the app to avoid
 * exhausting the DB connection pool on hot reloads.
 */

import { PrismaClient } from '@prisma/client';
import { attachConnectionMonitoring, startConnectionMonitoring } from './connectionMonitor.js';
import { attachRetryMiddleware } from './retryUtils.js';
import { DEFAULT_TENANT_ID, getCurrentTenantId, isTenantScopeBypassed } from './tenantContext.js';

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '500', 10);

const globalForPrisma = globalThis;

const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Escrow',
  'Milestone',
  'ReputationRecord',
  'Dispute',
  'DisputeEvidence',
  'DisputeAppeal',
  'UserProfile',
  'ContractEvent',
  'Payment',
  'KycVerification',
  'WebhookSubscription',
  'WebhookDelivery',
  'AdminAuditLog',
  'AuditLog',
]);

const READ_MANY_ACTIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

// Single-record write/delete operations addressed by a unique `where` clause.
// Without tenant-scoping these too, a caller holding another tenant's record ID
// (guessed, leaked, or from a stale reference) could update or delete it directly,
// bypassing the isolation this extension exists to enforce.
const WHERE_SCOPED_SINGLE_ACTIONS = new Set(['update', 'delete']);

// Exported for direct unit testing — see tests/prismaTenantScope.test.js.
// `where` may need to keep a unique identifying field (e.g. `id`) at the top
// level: Prisma's extended-where-unique validation for findUnique/update/delete
// requires it there, not nested only inside `AND`.
export function mergeTenantWhere(where, tenantId) {
  if (!tenantId) return where;
  if (!where || Object.keys(where).length === 0) return { tenantId };
  if (where.tenantId === tenantId) return where;

  const { AND, ...rest } = where;
  const extraAnd = Array.isArray(AND) ? AND : AND ? [AND] : [];
  return { ...rest, AND: [...extraAnd, { tenantId }] };
}

/**
 * The tenant-scoping query interceptor shared by every model's `$allOperations`.
 * Exported so tests can exercise the exact scoping decisions without needing a
 * real Prisma client — the `@prisma/client` jest mock stubs `$extends` as a
 * no-op, so this logic is otherwise never invoked under test.
 */
export async function applyTenantScope({ model, operation, args, query }) {
  const tenantId = getCurrentTenantId();

  if (!tenantId || isTenantScopeBypassed() || !TENANT_SCOPED_MODELS.has(model)) {
    return query(args);
  }

  args ??= {};

  if (
    READ_MANY_ACTIONS.has(operation) ||
    operation === 'findUnique' ||
    operation === 'findUniqueOrThrow' ||
    WHERE_SCOPED_SINGLE_ACTIONS.has(operation) ||
    operation === 'upsert'
  ) {
    args.where = mergeTenantWhere(args.where, tenantId);
  }

  if (operation === 'create') {
    args.data = {
      ...args.data,
      tenantId: args.data?.tenantId ?? tenantId ?? DEFAULT_TENANT_ID,
    };
  }

  if (operation === 'createMany' && Array.isArray(args.data)) {
    args.data = args.data.map((entry) => ({
      ...entry,
      tenantId: entry.tenantId ?? tenantId ?? DEFAULT_TENANT_ID,
    }));
  }

  if (operation === 'upsert') {
    args.create = {
      ...args.create,
      tenantId: args.create?.tenantId ?? tenantId ?? DEFAULT_TENANT_ID,
    };
  }

  return query(args);
}

function createPrismaClient() {
  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
        : ['error'],
    errorFormat: 'minimal',
  });

  if (process.env.NODE_ENV === 'development') {
    base.$on('query', (e) => {
      if (e.duration > SLOW_QUERY_MS) {
        console.warn(`[Prisma] Slow query (${e.duration}ms): ${e.query}`);
      }
    });
  }

  // Replace deprecated $use middleware with $extends query extension (Prisma 5+)
  return base.$extends({
    query: {
      $allModels: {
        $allOperations: applyTenantScope,
      },
    },
  });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Attach connection monitoring and retry middleware
attachConnectionMonitoring(prisma);
attachRetryMiddleware(prisma);

export { startConnectionMonitoring };
export default prisma;
