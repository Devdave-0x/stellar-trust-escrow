/**
 * Migration: Onboarding checklist, system config, and escrow templates
 * Version:   20260726000000_onboarding_config_templates
 *
 * Adds:
 *   - onboarding_checklists  — per-user onboarding step tracking (#216)
 *   - system_configs         — platform-wide configuration key/value store (#217)
 *   - escrow_templates       — reusable escrow configuration templates (#219)
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  // ── Issue #216: Onboarding checklist ────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TYPE IF NOT EXISTS onboarding_step AS ENUM (
      'verify_email',
      'connect_wallet',
      'create_first_escrow',
      'complete_profile',
      'invite_counterparty'
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS onboarding_checklists (
      id           SERIAL PRIMARY KEY,
      user_address TEXT NOT NULL,
      tenant_id    TEXT NOT NULL REFERENCES tenants(id),
      step         onboarding_step NOT NULL,
      completed_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_address, tenant_id, step)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_onboarding_user_tenant
    ON onboarding_checklists (user_address, tenant_id)
  `);

  // ── Issue #217: System configuration ────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS system_configs (
      key          TEXT PRIMARY KEY,
      value        TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'string',
      description  TEXT,
      updated_by   TEXT,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed default config values
  await prisma.$executeRawUnsafe(`
    INSERT INTO system_configs (key, value, type, description) VALUES
      ('platform_fee_percent',        '2.5',  'number',  'Platform fee percentage applied to each escrow'),
      ('max_escrow_amount',           '1000000', 'number', 'Maximum allowed escrow amount in USD'),
      ('min_escrow_amount',           '10',   'number',  'Minimum allowed escrow amount in USD'),
      ('max_milestones_per_escrow',   '20',   'number',  'Maximum number of milestones per escrow'),
      ('dispute_window_days',         '14',   'number',  'Days after milestone approval that a dispute can be raised'),
      ('kyc_required',                'false','boolean', 'Whether KYC verification is required before creating escrows'),
      ('maintenance_mode',            'false','boolean', 'Puts the platform in read-only maintenance mode'),
      ('allowed_currencies',          'XLM,USDC', 'string', 'Comma-separated list of allowed escrow currencies'),
      ('max_templates_per_user',      '50',   'number',  'Maximum saved escrow templates per user')
    ON CONFLICT (key) DO NOTHING
  `);

  // ── Issue #219: Escrow templates ─────────────────────────────────────────────
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS escrow_templates (
      id           SERIAL PRIMARY KEY,
      user_address TEXT NOT NULL,
      tenant_id    TEXT NOT NULL REFERENCES tenants(id),
      name         TEXT NOT NULL,
      config       JSONB NOT NULL DEFAULT '{}',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_escrow_templates_user_tenant
    ON escrow_templates (user_address, tenant_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS escrow_templates`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS system_configs`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS onboarding_checklists`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS onboarding_step`);
}
