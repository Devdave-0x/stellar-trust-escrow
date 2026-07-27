/**
 * Migration: escrow_messages table
 *
 * In-context messaging between escrow participants.
 *  - read_by is a JSONB array of User ids that have read the message
 */

export const version = '20260401000001';
export const name = 'escrow_messages';

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS escrow_messages (
      id         SERIAL PRIMARY KEY,
      tenant_id  TEXT NOT NULL REFERENCES tenants(id),
      escrow_id  BIGINT NOT NULL REFERENCES escrows(id),
      sender_id  INTEGER NOT NULL REFERENCES users(id),
      body       TEXT NOT NULL,
      read_by    JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS escrow_messages_tenant_escrow_created_idx
      ON escrow_messages (tenant_id, escrow_id, created_at DESC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS escrow_messages_escrow_idx
      ON escrow_messages (escrow_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS escrow_messages_sender_idx
      ON escrow_messages (sender_id)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS escrow_messages`);
}
