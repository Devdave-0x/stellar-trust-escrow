/**
 * Migration: User onboarding checklist
 * Version:   20260725000003_onboarding_checklist
 *
 * Adds:
 *   - wallet_address column on users (needed to hook the connect_wallet step)
 *   - onboarding_checklist table
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS wallet_address TEXT
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_wallet_address_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboardingstep') THEN
        CREATE TYPE "OnboardingStep" AS ENUM (
          'verify_email', 'connect_wallet', 'create_first_escrow', 'complete_profile', 'invite_counterparty'
        );
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS onboarding_checklist (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id),
      step         "OnboardingStep" NOT NULL,
      completed_at TIMESTAMPTZ,
      UNIQUE (user_id, step)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_onboarding_checklist_user_id ON onboarding_checklist (user_id)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS onboarding_checklist`);
  await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "OnboardingStep"`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
      DROP CONSTRAINT IF EXISTS users_wallet_address_key,
      DROP COLUMN IF EXISTS wallet_address
  `);
}
