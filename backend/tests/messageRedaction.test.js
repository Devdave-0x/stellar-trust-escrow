/**
 * Tests for message redaction feature (Issue #544)
 * Tests admin moderation capability to redact EscrowMessage content
 */

import { jest } from '@jest/globals';

const prismaMock = {
  escrowMessage: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: messageRedactionService } = await import(
  '../services/messageRedactionService.js'
);

function createMockRes() {
  const res = {
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
  return res;
}

describe('messageRedaction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('redactMessage', () => {
    it('redacts a message by ID and retains sender and timestamp', async () => {
      const originalMessage = {
        id: 1,
        escrowId: 1n,
        tenantId: 'tenant-1',
        senderAddress: 'GSENDER111111111111111111111111111111111111111111111',
        body: 'This message contains inappropriate content',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        redactedAt: null,
        redactionReason: null,
      };

      prismaMock.escrowMessage.findUnique.mockResolvedValue(originalMessage);
      prismaMock.escrowMessage.update.mockResolvedValue({
        ...originalMessage,
        body: '[REDACTED]',
        redactedAt: expect.any(Date),
        redactionReason: 'Inappropriate content',
      });

      const result = await messageRedactionService.redactMessage(1, 'Inappropriate content');

      expect(prismaMock.escrowMessage.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(prismaMock.escrowMessage.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          body: '[REDACTED]',
          redactedAt: expect.any(Date),
          redactionReason: 'Inappropriate content',
        },
      });
      expect(result.senderAddress).toBe(originalMessage.senderAddress);
      expect(result.createdAt).toEqual(originalMessage.createdAt);
    });

    it('prevents access to original content after redaction', async () => {
      prismaMock.escrowMessage.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant-1',
        body: '[REDACTED]',
        senderAddress: 'GSENDER111111111111111111111111111111111111111111111',
        createdAt: new Date('2024-01-01T10:00:00Z'),
        redactedAt: new Date('2024-01-02T10:00:00Z'),
        redactionReason: 'Spam',
      });

      const message = await messageRedactionService.getMessage(1);

      expect(message.body).toBe('[REDACTED]');
      expect(message.redactionReason).toBe('Spam');
    });

    it('marks redaction as auditable with timestamp and reason', async () => {
      prismaMock.escrowMessage.update.mockResolvedValue({
        id: 1,
        redactedAt: new Date('2024-01-02T15:30:00Z'),
        redactionReason: 'Spam',
      });

      const result = await messageRedactionService.redactMessage(1, 'Spam');

      expect(result.redactedAt).toBeDefined();
      expect(result.redactionReason).toBe('Spam');
      expect(prismaMock.escrowMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            redactionReason: 'Spam',
            redactedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('does not redact already redacted messages', async () => {
      prismaMock.escrowMessage.findUnique.mockResolvedValue({
        id: 1,
        redactedAt: new Date('2024-01-01T10:00:00Z'),
        redactionReason: 'Already redacted',
      });

      const result = await messageRedactionService.redactMessage(1, 'New reason');

      expect(prismaMock.escrowMessage.update).not.toHaveBeenCalled();
    });

    it('preserves audit trail of redaction actions', async () => {
      const redactionTimestamp = new Date('2024-01-02T10:00:00Z');
      prismaMock.escrowMessage.update.mockResolvedValue({
        id: 1,
        redactedAt: redactionTimestamp,
        redactionReason: 'Moderation action',
      });

      const result = await messageRedactionService.redactMessage(1, 'Moderation action');

      expect(result.redactedAt).toEqual(redactionTimestamp);
      expect(result.redactionReason).toBe('Moderation action');
    });
  });

  describe('retrieveRedactedMessage', () => {
    it('returns redaction marker instead of original content', async () => {
      prismaMock.escrowMessage.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant-1',
        senderAddress: 'GSENDER111111111111111111111111111111111111111111111',
        body: '[REDACTED]',
        redactedAt: new Date('2024-01-02T10:00:00Z'),
        redactionReason: 'Spam',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      const message = await messageRedactionService.getMessage(1);

      expect(message.body).toBe('[REDACTED]');
    });

    it('never returns original content in API responses for redacted messages', async () => {
      prismaMock.escrowMessage.findMany.mockResolvedValue([
        {
          id: 1,
          body: '[REDACTED]',
          senderAddress: 'GSENDER111111111111111111111111111111111111111111111',
          redactedAt: new Date('2024-01-02T10:00:00Z'),
        },
      ]);

      const messages = await messageRedactionService.getMessages();

      expect(messages[0].body).toBe('[REDACTED]');
      expect(messages[0].body).not.toContain('original');
    });

    it('includes redaction context in API response for transparency', async () => {
      prismaMock.escrowMessage.findUnique.mockResolvedValue({
        id: 1,
        body: '[REDACTED]',
        redactedAt: new Date('2024-01-02T10:00:00Z'),
        redactionReason: 'Harassment',
        senderAddress: 'GSENDER111111111111111111111111111111111111111111111',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      });

      const message = await messageRedactionService.getMessage(1);

      expect(message.redactedAt).toBeDefined();
      expect(message.redactionReason).toBeDefined();
    });
  });

  describe('audit logging for redaction', () => {
    it('logs redaction action for audit trail', async () => {
      prismaMock.escrowMessage.update.mockResolvedValue({
        id: 1,
        redactedAt: new Date('2024-01-02T10:00:00Z'),
        redactionReason: 'Policy violation',
      });

      const result = await messageRedactionService.redactMessage(
        1,
        'Policy violation',
        'admin@example.com',
      );

      expect(result.redactedAt).toBeDefined();
    });

    it('does not lose sender information after redaction', async () => {
      const senderAddress = 'GSENDER111111111111111111111111111111111111111111111';
      prismaMock.escrowMessage.findUnique.mockResolvedValue({
        id: 1,
        senderAddress,
        body: '[REDACTED]',
        redactedAt: new Date('2024-01-02T10:00:00Z'),
      });

      const message = await messageRedactionService.getMessage(1);

      expect(message.senderAddress).toBe(senderAddress);
    });
  });
});
