import { z } from 'zod';
import { stellarAddressSchema } from './address.js';

export const userAddressParamSchema = z.object({
  address: stellarAddressSchema,
});

export const importDataSchema = z.object({
  data: z.record(z.unknown()),
  mode: z.enum(['merge', 'replace']),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});
