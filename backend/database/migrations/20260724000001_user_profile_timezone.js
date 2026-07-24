/**
 * Migration: Add timezone column to user_profiles
 * Version:   20260724000001_user_profile_timezone
 */

export async function up(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS timezone VARCHAR(64);
  `);
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE user_profiles DROP COLUMN IF EXISTS timezone;
  `);
}
