/**
 * Migration: Password reset tokens
 * Version:   20260724000005_password_reset
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         TEXT        NOT NULL PRIMARY KEY,
      user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT        NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens (token);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS password_reset_tokens;`);
}
