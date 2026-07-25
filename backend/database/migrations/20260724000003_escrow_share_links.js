/**
 * Migration: Create escrow_share_links table
 * Version:   20260724000003_escrow_share_links
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS escrow_share_links (
      id         TEXT        NOT NULL PRIMARY KEY,
      token      TEXT        NOT NULL UNIQUE,
      escrow_id  BIGINT      NOT NULL,
      created_by TEXT        NOT NULL,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_share_links_token_idx ON escrow_share_links (token);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_share_links_escrow_id_idx ON escrow_share_links (escrow_id);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS escrow_share_links_created_by_idx ON escrow_share_links (created_by);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS escrow_share_links;`);
}
