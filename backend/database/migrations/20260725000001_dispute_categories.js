/**
 * Migration: Dispute categories
 * Version:   20260725000001_dispute_categories
 *
 * Adds:
 *   - dispute_categories table, seeded with 5 default categories
 *   - category_id / assigned_arbiter_pool_id columns on disputes
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dispute_categories (
      id                       SERIAL PRIMARY KEY,
      name                     TEXT NOT NULL UNIQUE,
      description              TEXT,
      default_arbiter_pool_id  TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES dispute_categories(id),
      ADD COLUMN IF NOT EXISTS assigned_arbiter_pool_id TEXT
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_disputes_category_id ON disputes (category_id)
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO dispute_categories (name, description, default_arbiter_pool_id) VALUES
      ('Non-Delivery', 'Freelancer did not deliver the agreed work.', 'pool_general'),
      ('Quality Issue', 'Delivered work does not meet the agreed quality or scope.', 'pool_general'),
      ('Scope Dispute', 'Disagreement over what was included in the original scope.', 'pool_senior'),
      ('Payment Delay', 'Client has delayed or withheld payment past the agreed terms.', 'pool_payments'),
      ('Other', 'Any dispute that does not fit the above categories.', 'pool_general')
    ON CONFLICT (name) DO NOTHING
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE disputes
      DROP COLUMN IF EXISTS category_id,
      DROP COLUMN IF EXISTS assigned_arbiter_pool_id
  `);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS dispute_categories`);
}
