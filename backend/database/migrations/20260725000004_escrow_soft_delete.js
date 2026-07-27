/**
 * Migration: Add deleted_at to escrows (soft delete)
 * Version:   20260725000004_escrow_soft_delete
 *
 * DELETE /api/escrows/:id sets deleted_at instead of removing the row, so
 * audit history is preserved. Admins can view/restore soft-deleted escrows.
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrows_deleted_at_idx ON escrows (deleted_at);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrows_tenant_deleted_at_idx ON escrows (tenant_id, deleted_at);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS escrows_tenant_deleted_at_idx;`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS escrows_deleted_at_idx;`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows
      DROP COLUMN IF EXISTS deleted_at;
  `);
}
