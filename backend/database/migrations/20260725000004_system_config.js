/**
 * Migration: System configuration
 * Version:   20260725000004_system_config
 *
 * Adds the system_config table, seeded with platform defaults.
 * Values are stored as text; ConfigService validates/casts per key type.
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS system_config (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      description TEXT,
      updated_by  TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO system_config (key, value, description) VALUES
      ('platform_fee_percent', '1.5', 'Platform fee percentage charged on completed escrows'),
      ('min_escrow_amount', '10', 'Minimum allowed escrow amount'),
      ('max_escrow_amount', '1000000', 'Maximum allowed escrow amount'),
      ('maintenance_mode', 'false', 'When true, the platform shows a maintenance banner and blocks writes'),
      ('kyc_required', 'true', 'Whether KYC verification is required before creating an escrow')
    ON CONFLICT (key) DO NOTHING
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS system_config`);
}
