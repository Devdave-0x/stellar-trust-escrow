/**
 * Add fine-grained scopes to API keys.
 */
export async function up(prisma) {
  await prisma.$executeRawUnsafe(
    "ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[];",
  );
}

export async function down(prisma) {
  await prisma.$executeRawUnsafe('ALTER TABLE api_keys DROP COLUMN IF EXISTS scopes;');
}
