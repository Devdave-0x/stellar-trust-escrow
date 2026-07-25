/**
 * Migration: Create user_sessions table
 * Version:   20260725000000_user_sessions
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id             TEXT        NOT NULL PRIMARY KEY,
      user_id        TEXT        NOT NULL,
      token_hash     TEXT        NOT NULL UNIQUE,
      device_name    TEXT,
      ip_address     TEXT,
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS user_sessions_user_id_last_active_idx ON user_sessions (user_id, last_active_at DESC);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS user_sessions;`);
}
