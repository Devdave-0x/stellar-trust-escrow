/**
 * Migration: login_history table + users.locked_until
 *
 *  - login_history records every login attempt (success and failure)
 *  - users.locked_until — set for 15 minutes after 5 consecutive failed
 *    attempts for the same account; checked on each login
 */

export const version = '20260401000003';
export const name = 'login_history';

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS login_history (
      id             SERIAL PRIMARY KEY,
      tenant_id      TEXT NOT NULL REFERENCES tenants(id),
      user_id        INTEGER REFERENCES users(id),
      ip_address     TEXT,
      user_agent     TEXT,
      success        BOOLEAN NOT NULL,
      failure_reason TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS login_history_tenant_user_created_idx
      ON login_history (tenant_id, user_id, created_at DESC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS login_history_user_success_created_idx
      ON login_history (user_id, success, created_at DESC)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS login_history`);
  await prisma.$executeRawUnsafe(`ALTER TABLE users DROP COLUMN IF EXISTS locked_until`);
}
