/**
 * Migration: Add status, suspended_at, and suspend_reason columns to users
 * Version:   20260724000000_user_status_suspend
 *
 * Enables proper suspension management in the admin API.
 * Existing rows default to 'active'.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS users_status_idx;`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS suspended_at,
      DROP COLUMN IF EXISTS suspend_reason;
  `);
}
