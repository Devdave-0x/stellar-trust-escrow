/**
 * Escrow Service Helpers
 *
 * Reusable validation and logging utilities for escrowService operations.
 */

/**
 * Asserts that an escrow object matches an expected status or set of allowed statuses.
 * Throws a domain error with assigned statusCode if the status check fails.
 *
 * @param {object} escrow - Escrow record object containing status
 * @param {string|string[]} allowedStatuses - Expected status name(s)
 * @param {string} errorMessage - Exception error message
 * @param {number} [statusCode=409] - Mapped HTTP status code
 */
export function assertEscrowStatus(escrow, allowedStatuses, errorMessage, statusCode = 409) {
  const allowed = Array.isArray(allowedStatuses) ? allowedStatuses : [allowedStatuses];
  if (!escrow || !allowed.includes(escrow.status)) {
    throw Object.assign(new Error(errorMessage), { statusCode });
  }
}

/**
 * Creates an admin audit log entry within a Prisma transaction context.
 *
 * @param {object} tx - Prisma transaction client
 * @param {object} params
 * @param {string} params.action - Audit action name
 * @param {string} params.targetAddress - Target Stellar address
 * @param {string} params.reason - Detailed log description/reason
 * @param {string} params.performedBy - Actor address performing the operation
 * @returns {Promise<object>}
 */
export function createAdminAuditLog(tx, { action, targetAddress, reason, performedBy }) {
  return tx.adminAuditLog.create({
    data: {
      action,
      targetAddress,
      reason,
      performedBy,
      performedAt: new Date(),
    },
  });
}

export default {
  assertEscrowStatus,
  createAdminAuditLog,
};
