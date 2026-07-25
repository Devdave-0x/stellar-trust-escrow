/**
 * Referral Service
 *
 * Generates unique referral codes for users.
 *
 * @module services/referralService
 */

import crypto from 'crypto';

const CODE_LENGTH = 8;
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_GENERATION_ATTEMPTS = 10;

function generateReferralCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/**
 * Generates a referral code guaranteed unique against user profiles.
 * Retries on collision (astronomically unlikely with 36^8 possibilities).
 *
 * @param {import('@prisma/client').PrismaClient} tx
 * @returns {Promise<string>}
 */
async function createUniqueReferralCode(tx) {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = generateReferralCode();
    const existing = await tx.userProfile.findUnique({
      where: { referralCode: code },
      select: { address: true },
    });
    if (!existing) return code;
  }
  throw new Error('Failed to generate a unique referral code');
}

export default { generateReferralCode, createUniqueReferralCode };
