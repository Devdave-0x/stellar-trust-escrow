/**
 * Migration: Email verification — add email_verified to users, create email_verification_tokens
 * Version:   20260724000004_email_verification
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id         TEXT        NOT NULL PRIMARY KEY,
      user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT        NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS email_verification_tokens_token_idx ON email_verification_tokens (token);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens (user_id);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS email_verification_tokens;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE users DROP COLUMN IF EXISTS email_verified;`);
}
