import { z } from 'zod';

export const certificateStatusSchema = z.enum(['valid', 'revoked', 'expired', 'unknown']);

export const certificateVerificationResponseSchema = z.object({
  status: certificateStatusSchema,
  certificateId: z.string().min(1),
  subjectAddress: z.string().optional(),
  issuedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  revokedAt: z.string().datetime().nullable().optional(),
  issuer: z.string().optional(),
  reason: z.string().optional(),
});
