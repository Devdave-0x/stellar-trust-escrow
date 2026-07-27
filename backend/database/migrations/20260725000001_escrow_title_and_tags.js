/**
 * Migration: Tags table
 * Version:   20260725000001_escrow_title_and_tags
 *
 * Adds:
 *   - tags table (used by search suggestions)
 *
 * Note: escrows.title/description are added by
 * 20260725000003_escrow_clone_support.js — not duplicated here.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tags (
      id         SERIAL PRIMARY KEY,
      tenant_id  TEXT NOT NULL REFERENCES tenants(id),
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, name)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_tags_tenant_name
    ON tags (tenant_id, name)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS tags`);
}
