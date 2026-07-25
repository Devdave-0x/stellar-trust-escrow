/**
 * Migration: Add plan/limits/suspension fields to tenants
 * Version:   20260725000005_tenant_plan_management
 *
 * Supports the admin tenant management API: plan tier, per-tenant limits,
 * and suspend/unsuspend tracking. Suspension itself is enforced via the
 * existing `status` column (tenantMiddleware already 403s non-active
 * tenants) — suspended_at/suspend_reason are metadata for the admin UI.
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS max_users INTEGER,
      ADD COLUMN IF NOT EXISTS max_escrows_per_month INTEGER,
      ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS tenants_plan_idx ON tenants (plan);`);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS tenants_plan_idx;`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE tenants
      DROP COLUMN IF EXISTS plan,
      DROP COLUMN IF EXISTS max_users,
      DROP COLUMN IF EXISTS max_escrows_per_month,
      DROP COLUMN IF EXISTS suspended_at,
      DROP COLUMN IF EXISTS suspend_reason;
  `);
}
