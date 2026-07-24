/**
 * Migration: Escrow notes / comments table
 * Version:   20260724000007_escrow_notes
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS escrow_notes (
      id             TEXT        NOT NULL PRIMARY KEY,
      escrow_id      BIGINT      NOT NULL REFERENCES escrows(id) ON DELETE CASCADE,
      tenant_id      TEXT        NOT NULL,
      author_address TEXT        NOT NULL,
      body           TEXT        NOT NULL,
      edited_at      TIMESTAMPTZ,
      deleted_at     TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_notes_escrow_id_created_at_idx ON escrow_notes (escrow_id, created_at DESC);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_notes_tenant_escrow_idx ON escrow_notes (tenant_id, escrow_id);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_notes_author_idx ON escrow_notes (author_address);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS escrow_notes;`);
}
