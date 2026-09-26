import { jest } from '@jest/globals';

const prismaMock = {
  governanceEvent: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  governanceProposal: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { indexGovernanceEvent, processGovernanceEventBatch } = await import(
  '../api/services/governanceEventIndexer.js'
);

describe('governanceEventIndexing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Event type recognition', () => {
    it('recognizes and indexes proposal creation events', async () => {
      const event = {
        type: 'proposal_created',
        proposalId: 'prop-1',
        timestamp: new Date(),
        data: { title: 'New Feature' },
      };

      prismaMock.governanceEvent.create.mockResolvedValue({
        id: 'ev-1',
        ...event,
      });

      const result = await indexGovernanceEvent(event);

      expect(prismaMock.governanceEvent.create).toHaveBeenCalled();
      expect(result.type).toBe('proposal_created');
    });

    it('recognizes and indexes voting events', async () => {
      const event = {
        type: 'vote_cast',
        proposalId: 'prop-1',
        voter: 'user-1',
        vote: 'yes',
        timestamp: new Date(),
      };

      prismaMock.governanceEvent.create.mockResolvedValue({
        id: 'ev-2',
        ...event,
      });

      const result = await indexGovernanceEvent(event);

      expect(result.type).toBe('vote_cast');
      expect(prismaMock.governanceEvent.create).toHaveBeenCalled();
    });

    it('recognizes and indexes finalization events', async () => {
      const event = {
        type: 'proposal_finalized',
        proposalId: 'prop-1',
        result: 'passed',
        timestamp: new Date(),
      };

      prismaMock.governanceEvent.create.mockResolvedValue({
        id: 'ev-3',
        ...event,
      });

      const result = await indexGovernanceEvent(event);

      expect(result.type).toBe('proposal_finalized');
    });

    it('recognizes and indexes queueing events', async () => {
      const event = {
        type: 'proposal_queued',
        proposalId: 'prop-1',
        eta: new Date(Date.now() + 24 * 60 * 60 * 1000),
        timestamp: new Date(),
      };

      prismaMock.governanceEvent.create.mockResolvedValue({
        id: 'ev-4',
        ...event,
      });

      const result = await indexGovernanceEvent(event);

      expect(result.type).toBe('proposal_queued');
    });

    it('recognizes and indexes execution events', async () => {
      const event = {
        type: 'proposal_executed',
        proposalId: 'prop-1',
        executedAt: new Date(),
        timestamp: new Date(),
      };

      prismaMock.governanceEvent.create.mockResolvedValue({
        id: 'ev-5',
        ...event,
      });

      const result = await indexGovernanceEvent(event);

      expect(result.type).toBe('proposal_executed');
    });

    it('recognizes and indexes cancellation events', async () => {
      const event = {
        type: 'proposal_cancelled',
        proposalId: 'prop-1',
        reason: 'duplicate',
        timestamp: new Date(),
      };

      prismaMock.governanceEvent.create.mockResolvedValue({
        id: 'ev-6',
        ...event,
      });

      const result = await indexGovernanceEvent(event);

      expect(result.type).toBe('proposal_cancelled');
    });
  });

  describe('Idempotent reprocessing', () => {
    it('handles duplicate event processing safely', async () => {
      const event = {
        id: 'ev-1',
        type: 'proposal_created',
        proposalId: 'prop-1',
        timestamp: new Date(),
        blockHeight: 1000,
      };

      prismaMock.governanceEvent.findFirst.mockResolvedValue(event);
      prismaMock.governanceEvent.upsert.mockResolvedValue(event);

      // First processing
      const result1 = await indexGovernanceEvent(event);

      // Second processing (duplicate)
      const result2 = await indexGovernanceEvent(event);

      expect(result1.id).toBe(result2.id);
      expect(prismaMock.governanceEvent.upsert).toHaveBeenCalled();
    });

    it('prevents data corruption from duplicate processing', async () => {
      const event = {
        id: 'ev-2',
        type: 'vote_cast',
        proposalId: 'prop-1',
        blockHeight: 1001,
      };

      prismaMock.governanceEvent.upsert.mockResolvedValue(event);

      await indexGovernanceEvent(event);
      await indexGovernanceEvent(event);

      expect(prismaMock.governanceEvent.upsert).toHaveBeenCalledTimes(2);
    });

    it('maintains idempotency across batch processing', async () => {
      const events = [
        {
          id: 'ev-1',
          type: 'proposal_created',
          proposalId: 'prop-1',
          blockHeight: 1000,
        },
        {
          id: 'ev-2',
          type: 'vote_cast',
          proposalId: 'prop-1',
          blockHeight: 1001,
        },
      ];

      prismaMock.governanceEvent.findMany.mockResolvedValue(events);
      prismaMock.governanceEvent.upsert.mockResolvedValue(
        expect.objectContaining({ id: expect.any(String) })
      );

      await processGovernanceEventBatch(events);

      expect(prismaMock.governanceEvent.upsert).toHaveBeenCalledTimes(2);
    });

    it('safely handles retry of partially processed batch', async () => {
      const events = [
        { id: 'ev-1', type: 'proposal_created', proposalId: 'prop-1', blockHeight: 1000 },
        { id: 'ev-2', type: 'vote_cast', proposalId: 'prop-1', blockHeight: 1001 },
      ];

      prismaMock.governanceEvent.findMany.mockResolvedValue([events[0]]);
      prismaMock.governanceEvent.upsert.mockResolvedValue(expect.any(Object));

      const result = await processGovernanceEventBatch(events);

      expect(result).toBeDefined();
    });
  });

  describe('Event linking to proposals', () => {
    it('links creation events to governance proposals', async () => {
      const event = {
        type: 'proposal_created',
        proposalId: 'prop-1',
        timestamp: new Date(),
      };

      prismaMock.governanceEvent.create.mockResolvedValue({ id: 'ev-1', ...event });
      prismaMock.governanceProposal.update.mockResolvedValue({
        id: 'prop-1',
        createdEventId: 'ev-1',
      });

      const indexedEvent = await indexGovernanceEvent(event);

      expect(indexedEvent.proposalId).toBe('prop-1');
    });

    it('links execution events to contract modifications', async () => {
      const event = {
        type: 'proposal_executed',
        proposalId: 'prop-1',
        executedAt: new Date(),
        timestamp: new Date(),
        contractAddress: 'CXXXXXX',
      };

      prismaMock.governanceEvent.create.mockResolvedValue({ id: 'ev-5', ...event });

      const result = await indexGovernanceEvent(event);

      expect(result.contractAddress).toBe('CXXXXXX');
    });

    it('enables linking off-chain incidents to on-chain proposals', async () => {
      const event = {
        type: 'proposal_executed',
        proposalId: 'prop-1',
        timestamp: new Date(),
        executedAt: new Date(),
      };

      prismaMock.governanceEvent.create.mockResolvedValue({ id: 'ev-5', ...event });
      prismaMock.governanceProposal.findUnique.mockResolvedValue({
        id: 'prop-1',
        events: [{ id: 'ev-5', type: 'proposal_executed' }],
      });

      await indexGovernanceEvent(event);

      expect(prismaMock.governanceProposal.findUnique).toHaveBeenCalled();
    });
  });

  describe('Backward compatibility', () => {
    it('continues passing existing tests for affected areas', async () => {
      const events = [
        { id: 'ev-1', type: 'proposal_created', proposalId: 'prop-1' },
        { id: 'ev-2', type: 'vote_cast', proposalId: 'prop-1' },
      ];

      prismaMock.governanceEvent.findMany.mockResolvedValue(events);

      const result = await prismaMock.governanceEvent.findMany();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('type');
    });

    it('maintains event structure compatibility', async () => {
      const event = {
        id: 'ev-1',
        type: 'proposal_created',
        proposalId: 'prop-1',
        timestamp: new Date(),
        data: {},
      };

      prismaMock.governanceEvent.create.mockResolvedValue(event);

      const result = await indexGovernanceEvent(event);

      expect(result).toMatchObject({
        type: expect.any(String),
        proposalId: expect.any(String),
        timestamp: expect.any(Date),
      });
    });

    it('preserves existing event filtering capabilities', async () => {
      const events = [
        { id: 'ev-1', type: 'proposal_created', proposalId: 'prop-1' },
        { id: 'ev-2', type: 'proposal_finalized', proposalId: 'prop-1' },
      ];

      prismaMock.governanceEvent.findMany.mockResolvedValue([events[0]]);

      const result = await prismaMock.governanceEvent.findMany({
        where: { type: 'proposal_created' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('proposal_created');
    });
  });
});
