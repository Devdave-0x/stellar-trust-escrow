/**
 * Migration: Add metadata JSONB column to escrows
 * Version:   20260725000001_escrow_metadata
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows ADD COLUMN IF NOT EXISTS metadata JSONB;
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrows_metadata_gin_idx ON escrows USING GIN (metadata);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS escrows_metadata_gin_idx;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE escrows DROP COLUMN IF EXISTS metadata;`);
}
