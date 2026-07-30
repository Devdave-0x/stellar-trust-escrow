/**
 * Migration: Dispute categories
 * Version:   20260730000000_dispute_categories
 *
 * Adds:
 *   - dispute_categories       — typed categories with a default arbiter pool
 *   - category_id / arbiter_pool_id columns on disputes
 */

const SEED_CATEGORIES = [
  ['Non-Delivery', 'Work or goods were never delivered', 'pool-non-delivery'],
  ['Quality Issue', 'Delivered work does not meet agreed quality', 'pool-quality'],
  ['Scope Dispute', 'Disagreement over what the agreement covered', 'pool-scope'],
  ['Payment Delay', 'Funds were not released within the agreed window', 'pool-payment'],
  ['Other', 'Anything not covered by the other categories', 'pool-general'],
];

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dispute_categories (
      id                      SERIAL PRIMARY KEY,
      name                    TEXT NOT NULL UNIQUE,
      description             TEXT,
      default_arbiter_pool_id TEXT,
      active                  BOOLEAN NOT NULL DEFAULT TRUE,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const [name, description, poolId] of SEED_CATEGORIES) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO dispute_categories (name, description, default_arbiter_pool_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      name,
      description,
      poolId,
    );
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      ADD COLUMN IF NOT EXISTS category_id     INTEGER REFERENCES dispute_categories(id),
      ADD COLUMN IF NOT EXISTS arbiter_pool_id TEXT
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_disputes_category_id ON disputes (category_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      DROP COLUMN IF EXISTS category_id,
      DROP COLUMN IF EXISTS arbiter_pool_id
  `);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS dispute_categories`);
}
