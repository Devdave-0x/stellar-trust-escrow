import { z } from 'zod';

export const stellarAddressSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address'));

export function normalizeStellarAddress(address) {
  return stellarAddressSchema.parse(address);
}

export function safeNormalizeStellarAddress(address) {
  const parsed = stellarAddressSchema.safeParse(address);
  return parsed.success ? parsed.data : null;
}
