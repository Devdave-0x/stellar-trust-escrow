/**
 * Migration: escrow funding deadline + Draft status
 *
 * Changes:
 *  - EscrowStatus enum gains a `Draft` value (escrows awaiting on-chain funding)
 *  - escrows.funding_deadline (nullable timestamp) — deadline by which a Draft
 *    escrow must be funded before the hourly job auto-cancels it
 *  - composite index on (status, funding_deadline) to keep the hourly sweep cheap
 */

export const version = '20260401000000';
export const name = 'escrow_funding_deadline';

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TYPE "EscrowStatus" ADD VALUE IF NOT EXISTS 'Draft'
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE escrows
      ADD COLUMN IF NOT EXISTS funding_deadline TIMESTAMPTZ
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS escrows_status_funding_deadline_idx
      ON escrows (status, funding_deadline)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS escrows_status_funding_deadline_idx`);
  await prisma.$executeRawUnsafe(`ALTER TABLE escrows DROP COLUMN IF EXISTS funding_deadline`);
  // Postgres cannot drop a single enum value — the `Draft` value is left in place.
}
