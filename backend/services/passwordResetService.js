import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { createId } from '@paralleldrive/cuid2';
import prisma from '../lib/prisma.js';
import { deliverEmail } from './emailProviders.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('passwordResetService');

const TOKEN_TTL_HOURS = 1;
const BCRYPT_ROUNDS = 12;

function generateToken() {
  return randomBytes(32).toString('hex');
}

/**
 * Request a password reset — invalidates any existing token and sends a new one.
 * Always returns without revealing whether the email exists (timing-safe).
 *
 * @param {string} email
 */
export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    logger.info({ email }, 'Password reset requested for unknown email — silently ignored');
    return;
  }

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { id: createId(), userId: user.id, token, expiresAt },
  });

  const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

  await deliverEmail({
    to: user.email,
    subject: 'Reset your password',
    html: `<p>You requested a password reset. Click the link below — it expires in ${TOKEN_TTL_HOURS} hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in ${TOKEN_TTL_HOURS} hour. If you did not request this, ignore this email.`,
  });

  logger.info({ userId: user.id }, 'Password reset email sent');
}

/**
 * Consume a reset token and update the user's password.
 *
 * @param {string} token
 * @param {string} newPassword  Plain-text password (already strength-validated by middleware)
 * @returns {Promise<{ userId: number, email: string }>}
 */
export async function resetPassword(token, newPassword) {
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });

  if (!record)
    throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400 });
  if (record.usedAt)
    throw Object.assign(new Error('Reset token has already been used'), { statusCode: 400 });
  if (record.expiresAt < new Date())
    throw Object.assign(new Error('Reset token has expired'), { statusCode: 410 });

  const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const user = await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return tx.user.update({
      where: { id: record.userId },
      data: { password: hashed },
      select: { id: true, email: true },
    });
  });

  logger.info({ userId: user.id }, 'Password reset successfully');
  return { userId: user.id, email: user.email };
}
