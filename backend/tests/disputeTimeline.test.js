import { jest } from '@jest/globals';

const prismaMock = {
  dispute: { findFirst: jest.fn() },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { getDisputeTimeline } = await import('../services/disputeTimelineService.js');
const { default: disputeController } = await import('../api/controllers/disputeController.js');

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
}

const CLIENT = 'GCLIENT0000000000000000000000000000000000000000000000000';
const FREELANCER = 'GFREELANCER00000000000000000000000000000000000000000000';
const ARBITER = 'GARBITER0000000000000000000000000000000000000000000000000';

const day = (n) => new Date(Date.UTC(2026, 0, n));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('disputeTimelineService.getDisputeTimeline', () => {
  it('returns null when the dispute does not exist', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue(null);

    const events = await getDisputeTimeline(999, 'tenant-1');

    expect(events).toBeNull();
  });

  it('returns just the "filed" event for a freshly-filed dispute with no other activity', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue({
      id: 1,
      escrowId: 42n,
      raisedByAddress: CLIENT,
      raisedAt: day(2),
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      resolutionType: null,
      autoResolved: false,
      escrow: { arbiterAddress: null, createdAt: day(1) },
      evidence: [],
      appeals: [],
    });

    const events = await getDisputeTimeline(1, 'tenant-1');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'filed', actor: CLIENT });
  });

  it('orders a full lifecycle timeline ascending by timestamp', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue({
      id: 2,
      escrowId: 7n,
      raisedByAddress: CLIENT,
      raisedAt: day(2),
      resolvedAt: day(6),
      resolvedBy: ARBITER,
      resolution: 'Split 50/50',
      resolutionType: 'MANUAL',
      autoResolved: false,
      escrow: { arbiterAddress: ARBITER, createdAt: day(1) },
      evidence: [
        { id: 10, submittedBy: CLIENT, submittedAt: day(3), evidenceType: 'text', role: 'client' },
        {
          id: 11,
          submittedBy: FREELANCER,
          submittedAt: day(4),
          evidenceType: 'file',
          role: 'freelancer',
        },
      ],
      appeals: [
        { id: 20, appealedBy: FREELANCER, createdAt: day(5), reason: 'unfair', status: 'pending' },
      ],
    });

    const events = await getDisputeTimeline(2, 'tenant-1');

    expect(events.map((e) => e.event_type)).toEqual([
      'arbiter_assigned',
      'filed',
      'evidence_submitted',
      'evidence_submitted',
      'appeal_filed',
      'arbiter_ruling',
      'resolved',
    ]);

    // strictly ascending timestamps (with a stable tie-break at day(6))
    const timestamps = events.map((e) => new Date(e.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it('identifies the correct actor for each event type', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue({
      id: 3,
      escrowId: 8n,
      raisedByAddress: CLIENT,
      raisedAt: day(2),
      resolvedAt: day(5),
      resolvedBy: ARBITER,
      resolution: 'Favor freelancer',
      resolutionType: 'MANUAL',
      autoResolved: false,
      escrow: { arbiterAddress: ARBITER, createdAt: day(1) },
      evidence: [
        {
          id: 30,
          submittedBy: FREELANCER,
          submittedAt: day(3),
          evidenceType: 'image',
          role: 'freelancer',
        },
      ],
      appeals: [
        { id: 40, appealedBy: CLIENT, createdAt: day(4), reason: 'reason', status: 'pending' },
      ],
    });

    const events = await getDisputeTimeline(3, 'tenant-1');
    const byType = Object.fromEntries(events.map((e) => [e.event_type, e]));

    expect(byType.filed.actor).toBe(CLIENT);
    expect(byType.arbiter_assigned.actor).toBe(ARBITER);
    expect(byType.evidence_submitted.actor).toBe(FREELANCER);
    expect(byType.appeal_filed.actor).toBe(CLIENT);
    expect(byType.arbiter_ruling.actor).toBe(ARBITER);
    expect(byType.resolved.actor).toBe(ARBITER);
  });

  it('does not emit an arbiter_ruling event for auto-resolved disputes', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue({
      id: 4,
      escrowId: 9n,
      raisedByAddress: CLIENT,
      raisedAt: day(2),
      resolvedAt: day(3),
      resolvedBy: 'system',
      resolution: 'Auto-resolved',
      resolutionType: 'AUTO',
      autoResolved: true,
      escrow: { arbiterAddress: null, createdAt: day(1) },
      evidence: [],
      appeals: [],
    });

    const events = await getDisputeTimeline(4, 'tenant-1');

    expect(events.map((e) => e.event_type)).toEqual(['filed', 'resolved']);
    expect(events.find((e) => e.event_type === 'resolved').actor).toBe('system');
  });
});

describe('disputeController.getTimeline', () => {
  it('returns 404 when the dispute does not exist', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue(null);

    const req = { params: { id: '999' }, tenant: { id: 'tenant-1' } };
    const res = createMockRes();

    await disputeController.getTimeline(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for a non-numeric dispute id', async () => {
    const req = { params: { id: 'abc' }, tenant: { id: 'tenant-1' } };
    const res = createMockRes();

    await disputeController.getTimeline(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns the ordered events wrapped in the success envelope', async () => {
    prismaMock.dispute.findFirst.mockResolvedValue({
      id: 5,
      escrowId: 1n,
      raisedByAddress: CLIENT,
      raisedAt: day(1),
      resolvedAt: null,
      resolvedBy: null,
      resolution: null,
      resolutionType: null,
      autoResolved: false,
      escrow: { arbiterAddress: null, createdAt: day(1) },
      evidence: [],
      appeals: [],
    });

    const req = { params: { id: '5' }, tenant: { id: 'tenant-1' } };
    const res = createMockRes();

    await disputeController.getTimeline(req, res);

    expect(res.body.data.events).toHaveLength(1);
    expect(res.body.data.events[0].event_type).toBe('filed');
  });
});
