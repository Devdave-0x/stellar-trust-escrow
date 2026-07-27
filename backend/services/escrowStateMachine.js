/**
 * Escrow State Machine — Milestone States
 *
 * Encodes the valid milestone status transitions documented in
 * docs/milestone-state-machine.md and mirrored by the Soroban contract
 * (contracts/escrow_contract/src/types.rs — MilestoneStatus).
 *
 * States
 * ──────
 *   Pending   — initial state; milestone created, no work submitted yet
 *   Submitted — freelancer submitted work; awaiting client review
 *   Approved  — client approved; funds released to freelancer (terminal)
 *   Rejected  — client rejected; freelancer may resubmit
 *   Disputed  — dispute raised; funds frozen (terminal)
 *
 * Transition table
 * ────────────────
 *   Pending   → Submitted  (submit_milestone  — freelancer)
 *   Pending   → Disputed   (raise_dispute     — client or freelancer)
 *   Submitted → Approved   (approve_milestone — client)
 *   Submitted → Rejected   (reject_milestone  — client)
 *   Submitted → Disputed   (raise_dispute     — client or freelancer)
 *   Rejected  → Submitted  (submit_milestone  — freelancer, resubmit)
 *
 * @module services/escrowStateMachine
 */

import auditService from './auditService.js';

// ── States ────────────────────────────────────────────────────────────────────

export const MILESTONE_STATES = Object.freeze({
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  DISPUTED: 'Disputed',
});

// ── Transition table ──────────────────────────────────────────────────────────
// Maps each state to the set of states it may legally transition into.

export const TRANSITIONS = Object.freeze({
  [MILESTONE_STATES.PENDING]: Object.freeze([
    MILESTONE_STATES.SUBMITTED,
    MILESTONE_STATES.DISPUTED,
  ]),
  [MILESTONE_STATES.SUBMITTED]: Object.freeze([
    MILESTONE_STATES.APPROVED,
    MILESTONE_STATES.REJECTED,
    MILESTONE_STATES.DISPUTED,
  ]),
  [MILESTONE_STATES.APPROVED]: Object.freeze([]),  // terminal
  [MILESTONE_STATES.REJECTED]: Object.freeze([
    MILESTONE_STATES.SUBMITTED,                     // resubmit
  ]),
  [MILESTONE_STATES.DISPUTED]: Object.freeze([]),  // terminal
});

// ── Terminal states ───────────────────────────────────────────────────────────

export const TERMINAL_STATES = Object.freeze(
  new Set([MILESTONE_STATES.APPROVED, MILESTONE_STATES.DISPUTED]),
);

// ── Guard ─────────────────────────────────────────────────────────────────────

/**
 * Returns true when transitioning from `from` to `to` is a valid move
 * according to the TRANSITIONS table, false otherwise.
 *
 * @param {string} from - current milestone state
 * @param {string} to   - desired target state
 * @returns {boolean}
 */
export function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ── Transition ────────────────────────────────────────────────────────────────

/**
 * Attempt to transition a milestone from `from` to `to`.
 *
 * On success:
 *  - Returns the new state string.
 *  - Emits an audit log entry via auditService.log().
 *
 * On failure:
 *  - Throws an Error with a descriptive message and attaches
 *    `{ statusCode: 422 }` so callers can surface it as HTTP 422.
 *
 * @param {string} from         - current milestone state
 * @param {string} to           - desired target state
 * @param {object} [context={}] - optional metadata forwarded to the audit log
 * @param {string} [context.actor]       - who performed the transition
 * @param {string} [context.escrowId]    - escrow identifier
 * @param {string} [context.milestoneId] - milestone identifier
 * @returns {Promise<string>} the new state
 * @throws {Error} when the transition is not permitted
 */
export async function transition(from, to, context = {}) {
  if (!canTransition(from, to)) {
    const err = new Error(
      `Invalid milestone state transition: ${from} → ${to}. ` +
        `Allowed transitions from '${from}': [${(TRANSITIONS[from] ?? []).join(', ') || 'none'}]`,
    );
    err.statusCode = 422;
    throw err;
  }

  // Fire-and-forget audit log — never let an audit failure block the transition.
  auditService
    .log({
      category: auditService.AuditCategory?.MILESTONE ?? 'MILESTONE',
      action: `MILESTONE_TRANSITION_${from.toUpperCase()}_TO_${to.toUpperCase()}`,
      actor: context.actor ?? 'system',
      resourceId: context.milestoneId ?? context.escrowId ?? null,
      metadata: {
        from,
        to,
        escrowId: context.escrowId ?? null,
        milestoneId: context.milestoneId ?? null,
      },
    })
    .catch(() => {
      // audit failures are non-fatal
    });

  return to;
}

export default {
  MILESTONE_STATES,
  TRANSITIONS,
  TERMINAL_STATES,
  canTransition,
  transition,
};
