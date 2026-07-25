/**
 * Escrow Audit Service
 *
 * Append-only helper for writing and querying the EscrowAuditLog table.
 * Every escrow state transition must call logTransition() so there is a
 * complete, tamper-evident record of who changed what and when.
 *
 * The table is protected at the database layer (PostgreSQL rules block
 * UPDATE and DELETE), so no update/delete operations are exposed here.
 *
 * @module services/escrowAuditService
 */

import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import {
  parseCursorPagination,
  buildPrismaFindArgs,
  buildCursorResponse,
} from '../lib/pagination.js';

const log = createModuleLogger('escrowAuditService');

// ── Action constants ──────────────────────────────────────────────────────────

export const EscrowAuditAction = Object.freeze({
  CREATE: 'CREATE',
  FUND: 'FUND',
  RELEASE: 'RELEASE',
  RAISE_DISPUTE: 'RAISE_DISPUTE',
  RESOLVE_DISPUTE: 'RESOLVE_DISPUTE',
  CANCEL: 'CANCEL',
  MILESTONE_SUBMITTED: 'MILESTONE_SUBMITTED',
  MILESTONE_APPROVED: 'MILESTONE_APPROVED',
  MILESTONE_REJECTED: 'MILESTONE_REJECTED',
  STATE_CHANGE: 'STATE_CHANGE',
});

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Log a single escrow state transition.
 *
 * Never throws — a logging failure must never abort the main request flow.
 * If writing fails, the error is logged to stderr.
 *
 * @param {object} entry
 * @param {string|bigint} entry.escrowId   — escrow primary key
 * @param {string}        entry.tenantId   — tenant cuid
 * @param {string}        entry.actorId    — Stellar address of the actor
 * @param {string}        [entry.actorIp]  — client IP
 * @param {string}        entry.action     — EscrowAuditAction value
 * @param {string|null}   [entry.fromState] — previous EscrowStatus (null for CREATE)
 * @param {string}        entry.toState    — new EscrowStatus
 * @param {object}        [entry.metadata] — arbitrary JSON context
 * @returns {Promise<object|null>} created record, or null on failure
 */
export async function logTransition(entry) {
  try {
    const record = await prisma.escrowAuditLog.create({
      data: {
        escrowId: BigInt(entry.escrowId),
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        actorIp: entry.actorIp ?? null,
        action: entry.action,
        fromState: entry.fromState ?? null,
        toState: entry.toState,
        metadata: entry.metadata ?? undefined,
      },
    });
    return record;
  } catch (err) {
    log.error({
      message: 'escrow_audit_write_failed',
      escrowId: String(entry.escrowId),
      action: entry.action,
      error: err.message,
      stack: err.stack,
    });
    return null;
  }
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Fetch the audit trail for a single escrow, cursor-paginated.
 *
 * @param {string|bigint} escrowId
 * @param {string}        tenantId
 * @param {object}        query    — Express req.query (cursor, limit, sortOrder)
 * @returns {{ data, next_cursor, has_more }}
 */
export async function getEscrowAuditLog(escrowId, tenantId, query = {}) {
  const { take, parsedCursor, sortDir } = parseCursorPagination(query, 'createdAt', 'desc');

  const findArgs = buildPrismaFindArgs({
    parsedCursor: parsedCursor
      ? { ...parsedCursor, id: BigInt(parsedCursor.id) }
      : null,
    take,
    sortField: 'createdAt',
    sortDir,
    idField: 'id',
  });

  const rows = await prisma.escrowAuditLog.findMany({
    where: {
      escrowId: BigInt(escrowId),
      tenantId,
    },
    ...findArgs,
  });

  return buildCursorResponse(rows, take, 'id', 'createdAt', sortDir);
}

/**
 * Express middleware that automatically logs a state transition from the
 * request context. Attaches to PATCH/POST routes that change escrow state.
 *
 * The route handler must set res.locals.auditEntry before calling next() or
 * before sending the response, e.g.:
 *
 *   res.locals.auditEntry = {
 *     escrowId: req.params.id,
 *     action: EscrowAuditAction.RELEASE,
 *     fromState: 'Active',
 *     toState: 'Completed',
 *     metadata: { txHash: '...', amount: '1000' },
 *   };
 *
 * @returns {import('express').RequestHandler}
 */
export function auditTransitionMiddleware() {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = async (body) => {
      // Fire-and-forget after the response is sent
      if (res.statusCode >= 200 && res.statusCode < 300 && res.locals.auditEntry) {
        const entry = res.locals.auditEntry;
        const actorId =
          req.user?.address ||
          req.user?.walletAddress ||
          req.body?.address ||
          'system';
        const actorIp = req.ip || req.headers['x-forwarded-for'] || null;
        const tenantId = req.tenant?.id ?? entry.tenantId ?? 'unknown';

        logTransition({
          escrowId: entry.escrowId ?? req.params.id,
          tenantId,
          actorId,
          actorIp,
          action: entry.action,
          fromState: entry.fromState ?? null,
          toState: entry.toState,
          metadata: entry.metadata ?? null,
        }).catch((err) => log.error({ message: 'audit_transition_fire_forget_failed', error: err.message }));
      }

      return originalJson(body);
    };

    next();
  };
}

export default {
  logTransition,
  getEscrowAuditLog,
  auditTransitionMiddleware,
  EscrowAuditAction,
};
