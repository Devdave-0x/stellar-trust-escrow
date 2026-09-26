/**
 * Drift test: docs/dispute-timeline-contract.md must describe the event types
 * and same-timestamp ordering that disputeTimelineService actually produces.
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const prismaMock = {
  dispute: { findFirst: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { getDisputeTimeline } = await import('../services/disputeTimelineService.js');

const DOC_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../docs/dispute-timeline-contract.md',
);

/** Parses the drift-marked event type table into [{ eventType, rank }] ordered by rank. */
function readDocumentedEventTypes() {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const section = doc.match(
    /<!-- drift:dispute-timeline-event-types:start -->([\s\S]*?)<!-- drift:dispute-timeline-event-types:end -->/,
  );
  if (!section) throw new Error('drift markers not found in dispute-timeline-contract.md');

  return section[1]
    .split('\n')
    .map((line) => line.match(/^\|\s*`([a-z_]+)`\s*\|\s*(\d+)\s*\|/))
    .filter(Boolean)
    .map(([, eventType, rank]) => ({ eventType, rank: Number(rank) }))
    .sort((a, b) => a.rank - b.rank);
}

// Every event type the service can emit, all stamped at the same instant so
// the output order is decided purely by the tie-break rank.
const SAME_INSTANT = new Date(Date.UTC(2026, 0, 1));

function disputeWithEveryEventAtSameInstant() {
  return {
    id: 1,
    escrowId: 42n,
    raisedByAddress: 'GCLIENT',
    raisedAt: SAME_INSTANT,
    resolvedAt: SAME_INSTANT,
    resolvedBy: 'GARBITER',
    resolution: 'split',
    resolutionType: 'MANUAL',
    autoResolved: false,
    clientAmount: '50',
    freelancerAmount: '50',
    escrow: { arbiterAddress: 'GARBITER', createdAt: SAME_INSTANT },
    evidence: [
      {
        id: 1,
        submittedBy: 'GCLIENT',
        submittedAt: SAME_INSTANT,
        evidenceType: 'text',
        role: 'client',
      },
    ],
    appeals: [
      {
        id: 1,
        appealedBy: 'GFREELANCER',
        createdAt: SAME_INSTANT,
        reason: 'r',
        status: 'pending',
      },
    ],
  };
}

describe('docs/dispute-timeline-contract.md drift', () => {
  it('documents a unique rank for every event type', () => {
    const documented = readDocumentedEventTypes();
    const ranks = documented.map((entry) => entry.rank);

    expect(documented.length).toBeGreaterThan(0);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('documents exactly the event types the service emits, in tie-break order', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue(disputeWithEveryEventAtSameInstant());

    const events = await getDisputeTimeline(1, 'tenant-1');
    const emitted = events.map((event) => event.event_type);
    const documented = readDocumentedEventTypes().map((entry) => entry.eventType);

    expect(emitted).toEqual(documented);
  });
});
