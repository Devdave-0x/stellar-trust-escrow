/**
 * Milestone Status History Service
 *
 * Append-only helper for writing and querying the MilestoneStatusHistory
 * table so there is a complete audit trail of every milestone status
 * transition, for dispute evidence and participant visibility.
 *
 * @module services/milestoneHistoryService
 */

import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import {
  parseCursorPagination,
  buildPrismaFindArgs,
  buildCursorResponse,
} from '../lib/pagination.js';

const log = createModuleLogger('milestoneHistoryService');

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Record a single milestone status transition.
 *
 * Never throws — a logging failure must never abort the caller's request
 * flow when invoked outside of a DB transaction (e.g. from the indexer).
 * Callers that need the write to be atomic with the status change itself
 * (e.g. escrowService) should write via `tx.milestoneStatusHistory.create`
 * directly inside their transaction instead of calling this helper.
 *
 * @param {object} entry
 * @param {number}        entry.milestoneId — Milestone.id (not the on-chain index)
 * @param {string|bigint} entry.escrowId
 * @param {string|null}   [entry.fromStatus]
 * @param {string}        entry.toStatus
 * @param {string}        entry.changedBy   — Stellar address or 'system:indexer'
 * @param {string}        [entry.reason]
 * @returns {Promise<object|null>} created record, or null on failure
 */
export async function recordStatusChange(entry) {
  try {
    return await prisma.milestoneStatusHistory.create({
      data: {
        milestoneId: entry.milestoneId,
        escrowId: BigInt(entry.escrowId),
        fromStatus: entry.fromStatus ?? null,
        toStatus: entry.toStatus,
        changedBy: entry.changedBy,
        reason: entry.reason ?? null,
      },
    });
  } catch (err) {
    log.error({
      message: 'milestone_status_history_write_failed',
      milestoneId: entry.milestoneId,
      toStatus: entry.toStatus,
      error: err.message,
      stack: err.stack,
    });
    return null;
  }
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the status-change history for a single milestone, cursor-paginated,
 * oldest first by default.
 *
 * @param {number} milestoneId — Milestone.id
 * @param {object} query       — Express req.query (cursor, limit, sortOrder)
 * @returns {{ data, next_cursor, has_more }}
 */
export async function getMilestoneStatusHistory(milestoneId, query = {}) {
  const { take, parsedCursor, sortDir } = parseCursorPagination(query, 'createdAt', 'asc');

  const findArgs = buildPrismaFindArgs({
    parsedCursor: parsedCursor ? { ...parsedCursor, id: BigInt(parsedCursor.id) } : null,
    take,
    sortField: 'createdAt',
    sortDir,
    idField: 'id',
  });

  const rows = await prisma.milestoneStatusHistory.findMany({
    where: { milestoneId },
    ...findArgs,
  });

  return buildCursorResponse(rows, take, 'id', 'createdAt', sortDir);
}

/**
 * Fetch the most recent status-change row for a single milestone.
 *
 * @param {number} milestoneId — Milestone.id
 * @returns {Promise<object|null>}
 */
export async function getLastStatusChange(milestoneId) {
  return prisma.milestoneStatusHistory.findFirst({
    where: { milestoneId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Fetch the most recent status-change row for each of several milestones.
 * Used to enrich list responses without an N+1 query per milestone.
 *
 * @param {number[]} milestoneIds — Milestone.id values
 * @returns {Promise<Map<number, object>>} milestoneId -> latest history row
 */
export async function getLastStatusChangeBatch(milestoneIds) {
  if (!milestoneIds.length) return new Map();

  const rows = await prisma.milestoneStatusHistory.findMany({
    where: { milestoneId: { in: milestoneIds } },
    orderBy: [{ milestoneId: 'asc' }, { createdAt: 'desc' }],
    distinct: ['milestoneId'],
  });

  return new Map(rows.map((row) => [row.milestoneId, row]));
}

/** Shape a MilestoneStatusHistory row for inclusion in a milestone response. */
export function formatStatusChange(row) {
  if (!row) return null;
  return {
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedBy: row.changedBy,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

export default {
  recordStatusChange,
  getMilestoneStatusHistory,
  getLastStatusChange,
  getLastStatusChangeBatch,
  formatStatusChange,
};
