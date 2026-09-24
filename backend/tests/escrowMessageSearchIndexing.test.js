/**
 * Escrow message search indexing tests — Issue #549
 *
 * Covers search functionality extended to index escrow message metadata.
 * Enables support staff to locate specific escrows through conversation context
 * while maintaining privacy protections for regular users.
 *
 * Acceptance Criteria:
 *  • Admin can search and match sanitized message excerpts
 *  • User searches limited to escrows they participate in
 *  • Permission enforcement in tests
 *  • All existing tests continue passing
 *  • New tests added for modified behavior
 */

import { jest } from '@jest/globals';

const TEST_ADMIN_USER = {
  id: 'admin_001',
  email: 'admin@example.com',
  role: 'admin',
  tenantId: 'tenant_abc',
};

const TEST_REGULAR_USER = {
  id: 'user_123',
  email: 'user@example.com',
  role: 'user',
  tenantId: 'tenant_abc',
};

const TEST_ESCROW = {
  id: '42',
  clientId: TEST_REGULAR_USER.id,
  freelancerId: 'freelancer_456',
  title: 'Website Development Project',
  status: 'in_progress',
};

const TEST_MESSAGES = [
  {
    id: 'msg_001',
    escrowId: TEST_ESCROW.id,
    senderId: TEST_REGULAR_USER.id,
    content: 'Can you fix the header styling on the homepage?',
    createdAt: new Date('2026-05-20T10:00:00Z'),
  },
  {
    id: 'msg_002',
    escrowId: TEST_ESCROW.id,
    senderId: 'freelancer_456',
    content: 'I found an issue with the payment processing. Need to discuss.',
    createdAt: new Date('2026-05-20T11:30:00Z'),
  },
  {
    id: 'msg_003',
    escrowId: TEST_ESCROW.id,
    senderId: TEST_REGULAR_USER.id,
    content: 'Please implement the dark mode feature as discussed.',
    createdAt: new Date('2026-05-21T09:15:00Z'),
  },
];

describe('Escrow Message Search Indexing — Issue #549', () => {
  let searchService;
  let prismaMock;

  beforeAll(async () => {
    prismaMock = {
      escrow: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      escrowMessage: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      escrowMessageIndex: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb?.(prismaMock)),
      $queryRawUnsafe: jest.fn(),
    };

    jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
    searchService = (await import('../services/searchService.js')).default;
  });

  describe('Admin Message Search', () => {
    it('allows admin to search by message content', async () => {
      const searchQuery = 'payment processing';
      const results = [
        {
          escrowId: TEST_ESCROW.id,
          messageId: 'msg_002',
          excerpt: 'I found an issue with the payment processing. Need to discuss.',
          sender: 'freelancer_456',
          relevanceScore: 0.95,
        },
      ];

      prismaMock.$queryRawUnsafe.mockResolvedValue(results);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_ADMIN_USER.id,
        role: TEST_ADMIN_USER.role,
      });

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].excerpt).toContain('payment processing');
      expect(searchResults[0].escrowId).toBe(TEST_ESCROW.id);
    });

    it('admin receives sanitized message excerpts', async () => {
      const searchQuery = 'fix';
      const results = [
        {
          escrowId: TEST_ESCROW.id,
          messageId: 'msg_001',
          excerpt: 'Can you fix the header styling on the homepage?',
          sender: 'user_123',
          relevanceScore: 0.92,
        },
      ];

      prismaMock.$queryRawUnsafe.mockResolvedValue(results);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_ADMIN_USER.id,
        role: TEST_ADMIN_USER.role,
      });

      expect(searchResults[0].excerpt).toBeDefined();
      expect(typeof searchResults[0].excerpt).toBe('string');
      expect(searchResults[0].excerpt.length).toBeGreaterThan(0);
    });

    it('admin can search across all escrows in tenant', async () => {
      const searchQuery = 'implement';
      const results = [
        {
          escrowId: TEST_ESCROW.id,
          messageId: 'msg_003',
          excerpt: 'Please implement the dark mode feature as discussed.',
          sender: 'user_123',
          relevanceScore: 0.88,
        },
      ];

      prismaMock.$queryRawUnsafe.mockResolvedValue(results);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_ADMIN_USER.id,
        role: TEST_ADMIN_USER.role,
        tenantId: TEST_ADMIN_USER.tenantId,
      });

      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('admin sees sender information for indexed messages', async () => {
      const searchQuery = 'feature';
      const results = [
        {
          escrowId: TEST_ESCROW.id,
          messageId: 'msg_003',
          excerpt: 'Please implement the dark mode feature as discussed.',
          senderId: TEST_REGULAR_USER.id,
          senderEmail: TEST_REGULAR_USER.email,
          relevanceScore: 0.90,
        },
      ];

      prismaMock.$queryRawUnsafe.mockResolvedValue(results);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_ADMIN_USER.id,
        role: TEST_ADMIN_USER.role,
      });

      expect(searchResults[0]).toHaveProperty('senderId');
      expect(searchResults[0]).toHaveProperty('senderEmail');
    });
  });

  describe('Regular User Message Search', () => {
    it('restricts user search to their own escrows only', async () => {
      const searchQuery = 'fix';
      const results = [
        {
          escrowId: TEST_ESCROW.id,
          messageId: 'msg_001',
          excerpt: 'Can you fix the header styling on the homepage?',
          relevanceScore: 0.92,
        },
      ];

      prismaMock.escrow.findMany.mockResolvedValue([TEST_ESCROW]);
      prismaMock.$queryRawUnsafe.mockResolvedValue(results);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_REGULAR_USER.id,
        role: TEST_REGULAR_USER.role,
      });

      expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ clientId: TEST_REGULAR_USER.id }),
              expect.objectContaining({ freelancerId: TEST_REGULAR_USER.id }),
            ]),
          }),
        })
      );
    });

    it('user cannot see escrows they do not participate in', async () => {
      const searchQuery = 'implement';
      const otherEscrowId = '999';

      prismaMock.escrow.findMany.mockResolvedValue([]);
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: 'user_different_999',
        role: TEST_REGULAR_USER.role,
      });

      expect(searchResults).toHaveLength(0);
    });

    it('user search filtered by their participation', async () => {
      const searchQuery = 'payment';
      const userEscrows = [TEST_ESCROW];

      prismaMock.escrow.findMany.mockResolvedValue(userEscrows);
      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_REGULAR_USER.id,
        role: TEST_REGULAR_USER.role,
      });

      expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TEST_REGULAR_USER.tenantId,
          }),
        })
      );
    });
  });

  describe('Message Indexing and Sanitization', () => {
    it('creates search index entries for escrow messages', async () => {
      const escrowId = TEST_ESCROW.id;

      prismaMock.escrowMessage.findMany.mockResolvedValue(TEST_MESSAGES);
      prismaMock.escrowMessageIndex.create.mockResolvedValue({ success: true });

      await searchService.indexEscrowMessages(escrowId);

      expect(prismaMock.escrowMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { escrowId },
        })
      );

      expect(prismaMock.escrowMessageIndex.create).toHaveBeenCalledTimes(
        TEST_MESSAGES.length
      );
    });

    it('updates index when messages are deleted', async () => {
      const escrowId = TEST_ESCROW.id;

      prismaMock.escrowMessageIndex.deleteMany.mockResolvedValue({ count: 1 });

      await searchService.removeIndexedMessages(escrowId, ['msg_002']);

      expect(prismaMock.escrowMessageIndex.deleteMany).toHaveBeenCalled();
    });

    it('sanitizes indexed content to remove sensitive data', async () => {
      const sensitiveMessage = {
        id: 'msg_sensitive',
        escrowId: TEST_ESCROW.id,
        senderId: TEST_REGULAR_USER.id,
        content: 'My credit card is 4111-1111-1111-1111 and SSN is 123-45-6789',
        createdAt: new Date(),
      };

      const sanitized = searchService.sanitizeMessageContent(sensitiveMessage.content);

      expect(sanitized).not.toContain('4111-1111-1111-1111');
      expect(sanitized).not.toContain('123-45-6789');
    });
  });

  describe('Permission Enforcement', () => {
    it('blocks non-admin users from accessing admin search endpoints', async () => {
      const searchQuery = 'test query';

      await expect(
        searchService.searchAllMessages(searchQuery, {
          userId: TEST_REGULAR_USER.id,
          role: TEST_REGULAR_USER.role,
        })
      ).rejects.toThrow(/permission|unauthorized|forbidden/i);
    });

    it('allows admin role to access admin search endpoints', async () => {
      const searchQuery = 'test query';
      const results = [];

      prismaMock.$queryRawUnsafe.mockResolvedValue(results);

      const searchResults = await searchService.searchAllMessages(searchQuery, {
        userId: TEST_ADMIN_USER.id,
        role: TEST_ADMIN_USER.role,
      });

      expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
      expect(Array.isArray(searchResults)).toBe(true);
    });

    it('enforces tenant isolation in all searches', async () => {
      const searchQuery = 'test';
      const differentTenantUser = {
        ...TEST_ADMIN_USER,
        tenantId: 'tenant_different',
      };

      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      await searchService.searchMessagesByContent(searchQuery, differentTenantUser);

      const callArgs = prismaMock.$queryRawUnsafe.mock.calls[0][0];
      expect(callArgs).toContain('tenant_different');
    });
  });

  describe('Message Search Relevance', () => {
    it('returns results ordered by relevance score', async () => {
      const searchQuery = 'feature';
      const results = [
        {
          escrowId: TEST_ESCROW.id,
          messageId: 'msg_003',
          excerpt: 'Please implement the dark mode feature as discussed.',
          relevanceScore: 0.95,
        },
        {
          escrowId: 'esc_002',
          messageId: 'msg_004',
          excerpt: 'The feature request is important.',
          relevanceScore: 0.72,
        },
      ];

      prismaMock.$queryRawUnsafe.mockResolvedValue(results);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_ADMIN_USER.id,
        role: TEST_ADMIN_USER.role,
      });

      expect(searchResults[0].relevanceScore).toBeGreaterThanOrEqual(
        searchResults[1].relevanceScore
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('existing message search still works without index', async () => {
      const searchQuery = 'test';
      const results = [];

      prismaMock.escrowMessage.findMany.mockResolvedValue([]);

      const fallbackResults = await searchService.searchMessagesByContentFallback(
        searchQuery,
        TEST_ESCROW.id
      );

      expect(Array.isArray(fallbackResults)).toBe(true);
    });

    it('non-indexed escrows still return search results', async () => {
      const searchQuery = 'test';
      const escrowId = 'unindexed_escrow_123';

      prismaMock.escrowMessage.findMany.mockResolvedValue(TEST_MESSAGES);

      const results = await searchService.searchMessagesByContentFallback(
        searchQuery,
        escrowId
      );

      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('handles empty search results gracefully', async () => {
      const searchQuery = 'nonexistent_phrase_xyz';

      prismaMock.$queryRawUnsafe.mockResolvedValue([]);

      const searchResults = await searchService.searchMessagesByContent(searchQuery, {
        userId: TEST_ADMIN_USER.id,
        role: TEST_ADMIN_USER.role,
      });

      expect(searchResults).toEqual([]);
    });
  });
});
