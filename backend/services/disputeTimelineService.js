/**
 * Dispute Timeline Service
 *
 * Aggregates a chronological timeline of a dispute's lifecycle from the
 * existing dispute/evidence/appeal/escrow tables — no dedicated table needed.
 *
 * Event types: filed, evidence_submitted, arbiter_assigned, arbiter_ruling,
 * appeal_filed, resolved.
 *
 * Validates that events occur in logically consistent order to detect
 * data inconsistencies or scheduler issues.
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

// Validation rules: logical dependencies between events.
// Format: { first: event that must occur first, second: event that must occur second }
const EVENT_DEPENDENCIES = [
  // filed must come before resolved
  { first: 'filed', second: 'resolved' },
  // filed must come before appeal_filed
  { first: 'filed', second: 'appeal_filed' },
  // filed must come before arbiter_ruling
  { first: 'filed', second: 'arbiter_ruling' },
];

/**
 * Validates a timeline for logical consistency.
 * Flags and returns diagnostics for invalid event sequences.
 *
 * @param {Array} events — ordered events from the timeline
 * @returns {object} { isValid: boolean, violations: Array<{event, rule, diagnostics}> }
 */
export function validateTimelineSequence(events) {
  const violations = [];

  if (!events || events.length === 0) {
    return { isValid: true, violations: [] };
  }

  const eventMap = new Map(events.map((e) => [e.event_type, e]));

  for (const dep of EVENT_DEPENDENCIES) {
    const firstEvent = eventMap.get(dep.first);
    const secondEvent = eventMap.get(dep.second);

    if (firstEvent && secondEvent) {
      const firstTime = new Date(firstEvent.timestamp).getTime();
      const secondTime = new Date(secondEvent.timestamp).getTime();

      if (secondTime < firstTime) {
        violations.push({
          event: dep.second,
          rule: `${dep.second} must occur after ${dep.first}`,
          diagnostics: {
            invalidEvent: dep.second,
            invalidTimestamp: secondEvent.timestamp,
            dependentEvent: dep.first,
            dependentTimestamp: firstEvent.timestamp,
            timeDifference: secondTime - firstTime,
          },
        });
      }
    }
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

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

  const validation = validateTimelineSequence(events);
  if (!validation.isValid) {
    console.warn(
      `[DisputeTimelineService] Timeline inconsistencies detected for dispute ${disputeId}:`,
      validation.violations,
    );
  }

  return events;
}

export default { getDisputeTimeline, validateTimelineSequence };
