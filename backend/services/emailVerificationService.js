import { randomBytes } from 'crypto';
import { createId } from '@paralleldrive/cuid2';
import prisma from '../lib/prisma.js';
import { deliverEmail } from './emailProviders.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('emailVerificationService');

const TOKEN_TTL_HOURS = 24;

function generateToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Create a verification token for a user and send the verification email.
 * Any existing unused tokens for the same user are replaced.
 *
 * @param {number} userId
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendVerificationEmail(userId, email) {
  // Invalidate previous tokens for this user
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: { id: createId(), userId, token, expiresAt },
  });

  const verifyUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/verify-email?token=${token}`;

  await deliverEmail({
    to: email,
    subject: 'Verify your email address',
    html: `<p>Click the link below to verify your email. It expires in ${TOKEN_TTL_HOURS} hours.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    text: `Verify your email: ${verifyUrl} (expires in ${TOKEN_TTL_HOURS} hours)`,
  });

  logger.info({ userId, email }, 'Verification email sent');
}

/**
 * Verify a token and mark the user's email as verified.
 *
 * @param {string} token
 * @returns {Promise<{ userId: number, email: string }>}
 */
export async function verifyEmailToken(token) {
  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });

  if (!record) throw Object.assign(new Error('Invalid verification token'), { statusCode: 400 });
  if (record.expiresAt < new Date())
    throw Object.assign(new Error('Verification token has expired'), { statusCode: 410 });

  const user = await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.delete({ where: { id: record.id } });
    return tx.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
      select: { id: true, email: true },
    });
  });

  logger.info({ userId: user.id }, 'Email verified successfully');
  return { userId: user.id, email: user.email };
}
