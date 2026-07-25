/**
 * Migration: announcements table
 *
 * Admin broadcast announcements, optionally targeted at a single tenant.
 *  - target: 'all' | 'tenant' — tenant_id is only set when target = 'tenant'
 *  - soft-delete via deleted_at
 */

export const version = '20260401000002';
export const name = 'announcements';

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "AnnouncementTarget" AS ENUM ('all', 'tenant');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS announcements (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      target     "AnnouncementTarget" NOT NULL DEFAULT 'all',
      tenant_id  TEXT REFERENCES tenants(id),
      starts_at  TIMESTAMPTZ NOT NULL,
      ends_at    TIMESTAMPTZ NOT NULL,
      created_by TEXT NOT NULL,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS announcements_target_tenant_window_idx
      ON announcements (target, tenant_id, starts_at, ends_at)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS announcements_deleted_at_idx
      ON announcements (deleted_at)
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS announcements`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "AnnouncementTarget"`);
}
