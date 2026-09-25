import { z } from 'zod';

// Shared shape of the escrow share-link API, used by the backend to validate
// what it sends and by clients to validate what they receive.
// TypeScript consumers that cannot bundle zod (mobile) use the matching
// interfaces in shared/types/shareLink.d.ts; a backend test keeps them in sync.

// Dates are Date objects on the server and ISO 8601 strings on the wire.
const timestamp = z.union([z.date(), z.iso.datetime({ offset: true })]);

// Amounts are stroop counts serialized as strings (BigInt-safe).
const amount = z.string().regex(/^\d+$/, 'Amount must be a non-negative integer string');

export const SHARE_LINK_ESCROW_STATUSES = ['Draft', 'Active', 'Completed', 'Disputed', 'Cancelled'];
export const SHARE_LINK_MILESTONE_STATUSES = ['Pending', 'Submitted', 'Approved', 'Rejected'];

export const sharedMilestoneSchema = z.object({
  id: z.number().int().nonnegative(),
  title: z.string(),
  amount,
  status: z.enum(SHARE_LINK_MILESTONE_STATUSES),
});

export const sharedEscrowSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Escrow id must be a numeric string'),
  status: z.enum(SHARE_LINK_ESCROW_STATUSES),
  totalAmount: amount,
  remainingBalance: amount,
  deadline: timestamp.nullable(),
  createdAt: timestamp,
  milestones: z.array(sharedMilestoneSchema),
});

/** Response of the public `GET /api/share/:token`. */
export const shareLinkResolveResponseSchema = z.object({
  escrow: sharedEscrowSchema,
  sharedAt: timestamp,
  expiresAt: timestamp.nullable(),
});

/** Response of `POST /api/escrows/:id/share`. */
export const shareLinkCreateResponseSchema = z.object({
  token: z.string().min(1),
  shareUrl: z.string().url(),
  expiresAt: timestamp.nullable(),
  createdAt: timestamp,
});
