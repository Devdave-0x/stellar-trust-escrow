// Wire types for the escrow share-link API, mirroring the zod schemas in
// shared/schemas/shareLink.js for TypeScript consumers that cannot bundle zod
// (the mobile app imports these with `import type`). Dates arrive as ISO 8601
// strings. backend/tests/shareLinkSchema.test.js fails if these field lists
// drift from the schemas.

export type SharedEscrowStatus = 'Draft' | 'Active' | 'Completed' | 'Disputed' | 'Cancelled';

export type SharedMilestoneStatus = 'Pending' | 'Submitted' | 'Approved' | 'Rejected';

export interface SharedMilestone {
  id: number;
  title: string;
  /** Stroops, as an integer string. */
  amount: string;
  status: SharedMilestoneStatus;
}

export interface SharedEscrow {
  /** Numeric escrow id, as a string. */
  id: string;
  status: SharedEscrowStatus;
  /** Stroops, as an integer string. */
  totalAmount: string;
  /** Stroops, as an integer string. */
  remainingBalance: string;
  deadline: string | null;
  createdAt: string;
  milestones: SharedMilestone[];
}

/** Response of the public `GET /api/share/:token`. */
export interface ShareLinkResolveResponse {
  escrow: SharedEscrow;
  sharedAt: string;
  expiresAt: string | null;
}

/** Response of `POST /api/escrows/:id/share`. */
export interface ShareLinkCreateResponse {
  token: string;
  shareUrl: string;
  expiresAt: string | null;
  createdAt: string;
}
