/**
 * Escrow Controller Helpers
 *
 * Extracted reusable utilities for request validation, ID parsing,
 * access control, and query parameter filtering in escrowController.
 */

/**
 * Safely parses an HTTP route parameter or string into a BigInt escrow ID.
 * Throws a HTTP 400 Bad Request error if parsing fails.
 *
 * @param {string|number} idParam - Route parameter value
 * @returns {bigint} Parsed BigInt escrow ID
 */
export function parseEscrowId(idParam) {
  try {
    return BigInt(idParam);
  } catch (err) {
    throw Object.assign(new Error('Invalid escrow id'), { statusCode: 400, originalError: err });
  }
}

/**
 * Verifies if the requesting user has permission to access an escrow resource.
 * Admin users or direct escrow parties (client, freelancer, optional owner/arbiter) are permitted.
 *
 * @param {object} user - Authenticated user object from req.user
 * @param {object} escrow - Escrow record containing participant addresses
 * @param {object} [options]
 * @param {boolean} [options.allowOwner=false] - Whether ownerId is accepted as party
 * @param {boolean} [options.allowArbiter=false] - Whether arbiterAddress is accepted as party
 * @returns {{ allowed: boolean, statusCode?: number, error?: string }}
 */
export function checkEscrowPartyAccess(user, escrow, options = {}) {
  const callerAddress = user?.address;
  const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin');

  if (isAdmin) {
    return { allowed: true };
  }

  if (!callerAddress || !escrow) {
    return {
      allowed: false,
      statusCode: 403,
      error: 'Access denied: not a party to this escrow',
    };
  }

  const parties = [escrow.clientAddress, escrow.freelancerAddress];
  if (options.allowOwner && escrow.ownerId) {
    parties.push(escrow.ownerId);
  }
  if (options.allowArbiter && escrow.arbiterAddress) {
    parties.push(escrow.arbiterAddress);
  }

  if (parties.includes(callerAddress)) {
    return { allowed: true };
  }

  const defaultError = options.allowArbiter
    ? 'Access denied: not a participant in this escrow'
    : 'Access denied: not a party to this escrow';

  return {
    allowed: false,
    statusCode: 403,
    error: defaultError,
  };
}

/**
 * Builds a Prisma createdAt date range filter object from date parameters.
 *
 * @param {string|Date} dateFrom - Start date
 * @param {string|Date} dateTo - End date
 * @returns {object|null} Prisma date filter object { gte?, lte? } or null
 */
export function buildDateRangeFilter(dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return null;

  const filter = {};
  if (dateFrom) {
    filter.gte = new Date(dateFrom);
  }
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    filter.lte = end;
  }
  return filter;
}

export default {
  parseEscrowId,
  checkEscrowPartyAccess,
  buildDateRangeFilter,
};
