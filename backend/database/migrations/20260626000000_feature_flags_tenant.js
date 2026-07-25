/**
 * Migration: Add tenant_id to feature_flags for per-tenant flag support
 * Version:   20260626000000_feature_flags_tenant
 */

/** @param {import('@prisma/client').PrismaClient} prisma */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE feature_flags
    ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT NULL
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant_id ON feature_flags (tenant_id)
  `);
}

/** @param {import('@prisma/client').PrismaClient} prisma */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_feature_flags_tenant_id`);
  await prisma.$executeRawUnsafe(`ALTER TABLE feature_flags DROP COLUMN IF EXISTS tenant_id`);
}
