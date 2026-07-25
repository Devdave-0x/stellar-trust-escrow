/**
 * Dispute Timeline Service
 *
 * Aggregates a chronological timeline of a dispute's lifecycle from the
 * existing dispute/evidence/appeal/escrow tables — no dedicated table needed.
 *
 * Event types: filed, evidence_submitted, arbiter_assigned, arbiter_ruling,
 * appeal_filed, resolved.
 */

import prisma from '../lib/prisma.js';

// Tie-breaker for events that land on the exact same timestamp (e.g. an
// arbiter ruling and the dispute's resolution are both stamped at resolvedAt).
const EVENT_ORDER = {
  filed: 0,
  evidence_submitted: 1,
  arbiter_assigned: 2,
  arbiter_ruling: 3,
  appeal_filed: 4,
  resolved: 5,
};

/**
 * Build the ordered timeline for a single dispute.
 *
 * @param {number} disputeId
 * @param {string} tenantId
 * @returns {Promise<Array|null>} ordered events, or null if the dispute doesn't exist
 */
export async function getDisputeTimeline(disputeId, tenantId) {
  const dispute = await prisma.dispute.findFirst({
    where: { id: disputeId, tenantId },
    include: {
      escrow: { select: { arbiterAddress: true, createdAt: true } },
      evidence: {
        select: { id: true, submittedBy: true, submittedAt: true, evidenceType: true, role: true },
      },
      appeals: {
        select: { id: true, appealedBy: true, createdAt: true, reason: true, status: true },
      },
    },
  });

  if (!dispute) return null;

  const events = [];

  events.push({
    event_type: 'filed',
    actor: dispute.raisedByAddress,
    timestamp: dispute.raisedAt,
    metadata: { disputeId: dispute.id, escrowId: dispute.escrowId.toString() },
  });

  for (const evidence of dispute.evidence) {
    events.push({
      event_type: 'evidence_submitted',
      actor: evidence.submittedBy,
      timestamp: evidence.submittedAt,
      metadata: {
        evidenceId: evidence.id,
        evidenceType: evidence.evidenceType,
        role: evidence.role,
      },
    });
  }

  // The arbiter is fixed on the escrow at creation time (there's no separate
  // "assignment" action in this system), so that's the event's timestamp.
  if (dispute.escrow?.arbiterAddress) {
    events.push({
      event_type: 'arbiter_assigned',
      actor: dispute.escrow.arbiterAddress,
      timestamp: dispute.escrow.createdAt,
      metadata: { arbiterAddress: dispute.escrow.arbiterAddress },
    });
  }

  for (const appeal of dispute.appeals) {
    events.push({
      event_type: 'appeal_filed',
      actor: appeal.appealedBy,
      timestamp: appeal.createdAt,
      metadata: { appealId: appeal.id, reason: appeal.reason, status: appeal.status },
    });
  }

  if (dispute.resolvedAt) {
    // A human ruling (as opposed to auto-resolution) gets its own event in
    // addition to the terminal "resolved" event below.
    if (dispute.resolvedBy && dispute.resolvedBy !== 'system') {
      events.push({
        event_type: 'arbiter_ruling',
        actor: dispute.resolvedBy,
        timestamp: dispute.resolvedAt,
        metadata: { resolutionType: dispute.resolutionType, resolution: dispute.resolution },
      });
    }

    events.push({
      event_type: 'resolved',
      actor: dispute.resolvedBy ?? 'system',
      timestamp: dispute.resolvedAt,
      metadata: {
        resolution: dispute.resolution,
        resolutionType: dispute.resolutionType,
        autoResolved: dispute.autoResolved,
        clientAmount: dispute.clientAmount,
        freelancerAmount: dispute.freelancerAmount,
      },
    });
  }

  events.sort((a, b) => {
    const delta = new Date(a.timestamp) - new Date(b.timestamp);
    return delta !== 0 ? delta : EVENT_ORDER[a.event_type] - EVENT_ORDER[b.event_type];
  });

  return events;
}

export default { getDisputeTimeline };
