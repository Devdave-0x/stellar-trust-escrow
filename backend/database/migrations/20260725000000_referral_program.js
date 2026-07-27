/**
 * Migration: Referral code generation and tracking
 * Version:   20260725000000_referral_program
 *
 * Adds:
 *   - referral_code column on user_profiles (unique, nullable — generated
 *     lazily on first request; this app identifies users by Stellar wallet
 *     address, not a `users` row — see api/middleware/auth.js)
 *   - referrals table, keyed by referrer/referred wallet address
 */

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS referral_code TEXT
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_referral_code_unique
    ON user_profiles (referral_code)
    WHERE referral_code IS NOT NULL
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS referrals (
      id                SERIAL PRIMARY KEY,
      tenant_id         TEXT NOT NULL REFERENCES tenants(id),
      referrer_address  TEXT NOT NULL,
      referred_address  TEXT NOT NULL UNIQUE,
      code_used         TEXT NOT NULL,
      rewarded_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_referrals_tenant_referrer
    ON referrals (tenant_id, referrer_address)
  `);
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function down(prisma) {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS referrals`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS idx_user_profiles_referral_code_unique`);
  await prisma.$executeRawUnsafe(`ALTER TABLE user_profiles DROP COLUMN IF EXISTS referral_code`);
}
