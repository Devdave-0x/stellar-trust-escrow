/**
 * Migration: Add notifications and notification_preferences tables
 * Version:   20260625000000_notifications
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TYPE IF NOT EXISTS "NotificationEvent" AS ENUM (
      'escrow_funded',
      'release_requested',
      'dispute_raised',
      'dispute_resolved',
      'escrow_expiring',
      'milestone_completed',
      'escrow_status_changed'
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id INT NOT NULL,
      event "NotificationEvent" NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_notification_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
      ON notifications(user_id, read, created_at DESC)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS notifications_tenant_user_idx
      ON notifications(tenant_id, user_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      preferences JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_notif_pref_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      CONSTRAINT fk_notif_pref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS notification_preferences_tenant_user_idx
      ON notification_preferences(tenant_id, user_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS notification_preferences`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS notifications`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "NotificationEvent"`);
}
