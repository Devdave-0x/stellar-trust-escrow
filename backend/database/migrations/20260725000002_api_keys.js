/**
 * Migration: Create api_keys table
 * Version:   20260725000002_api_keys
 *
 * Programmatic API keys with optional CIDR-based IP allowlisting.
 * allowed_ips empty = allow all.
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id           TEXT        NOT NULL PRIMARY KEY,
      tenant_id    TEXT        NOT NULL,
      user_id      TEXT        NOT NULL,
      name         TEXT        NOT NULL,
      key_prefix   TEXT        NOT NULL,
      key_hash     TEXT        NOT NULL UNIQUE,
      allowed_ips  TEXT[]      NOT NULL DEFAULT '{}',
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS api_keys_tenant_user_idx ON api_keys (tenant_id, user_id);`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys (key_hash);`,
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS api_keys;`);
}
