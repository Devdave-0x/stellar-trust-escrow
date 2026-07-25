/**
 * Migration: Add title/description/owner_id to escrows, 'Draft' status, and
 *            a synthetic ID sequence for escrows that don't exist on-chain yet.
 * Version:   20260725000003_escrow_clone_support
 *
 * Supports the escrow clone endpoint: clones are Draft rows with no
 * on-chain counterpart until broadcast. Escrow.id has no default (it's the
 * on-chain contract-assigned ID for real escrows), so Draft rows are given
 * a synthetic *negative* ID pulled from escrow_draft_id_seq — real on-chain
 * IDs are always non-negative, so collisions are impossible.
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows
      ADD COLUMN IF NOT EXISTS title TEXT,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS owner_id TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS escrows_owner_id_idx ON escrows (owner_id);
  `);

  // Postgres enums can only gain values via ALTER TYPE — never lose them.
  await prisma.$executeRawUnsafe(`ALTER TYPE "EscrowStatus" ADD VALUE IF NOT EXISTS 'Draft';`);

  await prisma.$executeRawUnsafe(`
    CREATE SEQUENCE IF NOT EXISTS escrow_draft_id_seq START WITH 1 INCREMENT BY 1;
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS escrow_draft_id_seq;`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS escrows_owner_id_idx;`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows
      DROP COLUMN IF EXISTS title,
      DROP COLUMN IF EXISTS description,
      DROP COLUMN IF EXISTS owner_id;
  `);
  // Note: Postgres cannot remove a value from an enum type, so 'Draft'
  // remains in EscrowStatus after rollback — a forward-only enum addition,
  // same limitation the existing migration set already accepts elsewhere.
}
