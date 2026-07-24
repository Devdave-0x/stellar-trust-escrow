/**
 * Migration: Soft-delete / PII anonymisation columns for account deletion
 * Version:   20260724000006_account_deletion
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS deleted_at             TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS anonymised_at          TIMESTAMPTZ;
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS users_deletion_requested_at_idx ON users (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS users_deletion_requested_at_idx;`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS deletion_requested_at,
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS anonymised_at;
  `);
}
