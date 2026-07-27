/**
 * Migration: Create escrow_bookmarks table
 * Version:   20260724000002_escrow_bookmarks
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS escrow_bookmarks (
      id           TEXT        NOT NULL PRIMARY KEY,
      user_address TEXT        NOT NULL,
      escrow_id    BIGINT      NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_address, escrow_id)
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_bookmarks_user_address_idx ON escrow_bookmarks (user_address);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_bookmarks_escrow_id_idx ON escrow_bookmarks (escrow_id);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS escrow_bookmarks;`);
}
