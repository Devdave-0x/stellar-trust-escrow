/**
 * Migration: add escrow full-text search vector
 * Version:   20260626000000_add_escrow_search_vector
 *
 * Adds a tsvector generated column on the escrows table covering
 * client_address, freelancer_address, and brief_hash so that
 * GET /api/escrows/search can use a GIN index for sub-200ms p95 latency.
 *
 * Rollback: drop the index and the column (safe — no data loss).
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector(
          'simple',
          coalesce(client_address, '') || ' ' ||
          coalesce(freelancer_address, '') || ' ' ||
          coalesce(brief_hash, '')
        )
      ) STORED
  `);

  // CONCURRENTLY avoids locking the table during index build.
  // Must run outside a transaction; we use executeRawUnsafe which auto-commits.
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_escrows_search_vector
      ON escrows USING GIN (search_vector)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS idx_escrows_search_vector
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows DROP COLUMN IF EXISTS search_vector
  `);
}
