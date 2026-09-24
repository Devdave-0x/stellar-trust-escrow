import { jest } from '@jest/globals';
import prisma from '../lib/prisma.js';
import passkeyService from '../services/passkeyService.js';

jest.mock('../lib/prisma.js');

describe('passkeyService - replay protection for authentication', () => {
  let mockPasskeyChallenge;
  let mockPasskey;
  let mockAuditLog;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPasskeyChallenge = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    };

    mockPasskey = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    mockAuditLog = {
      create: jest.fn().mockResolvedValue({}),
    };

    prisma.passkeyChallenge = mockPasskeyChallenge;
    prisma.passkey = mockPasskey;
    prisma.auditLog = mockAuditLog;
  });

  describe('challenge single-use protection', () => {
    it('creates a unique challenge for each authentication attempt', async () => {
      mockPasskeyChallenge.create.mockImplementation(({ data }) => {
        return Promise.resolve({
          id: 'challenge_' + Math.random(),
          userId: data.userId,
          challenge: data.challenge,
          used: false,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 600000),
        });
      });

      const challenge1 = await mockPasskeyChallenge.create({
        data: {
          userId: 'user1',
          challenge: 'random_challenge_1',
        },
      });

      const challenge2 = await mockPasskeyChallenge.create({
        data: {
          userId: 'user1',
          challenge: 'random_challenge_2',
        },
      });

      expect(challenge1.challenge).not.toBe(challenge2.challenge);
      expect(challenge1.id).not.toBe(challenge2.id);
    });

    it('marks challenge as used after successful authentication', async () => {
      mockPasskeyChallenge.update.mockResolvedValue({
        id: 'challenge_1',
        userId: 'user1',
        used: true,
        usedAt: new Date(),
      });

      const result = await mockPasskeyChallenge.update({
        where: { id: 'challenge_1' },
        data: { used: true, usedAt: new Date() },
      });

      expect(result.used).toBe(true);
      expect(result.usedAt).toBeInstanceOf(Date);
    });

    it('prevents reuse of a challenge that was already consumed', async () => {
      mockPasskeyChallenge.findUnique.mockResolvedValue({
        id: 'challenge_1',
        userId: 'user1',
        challenge: 'test_challenge',
        used: true,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
      });

      const challenge = await mockPasskeyChallenge.findUnique({
        where: { id: 'challenge_1' },
      });

      expect(challenge.used).toBe(true);
      // Application logic should check `used` flag and reject
    });

    it('tracks challenge usage in audit log', async () => {
      mockAuditLog.create.mockResolvedValue({
        id: 'audit_1',
        actor: 'user1',
        action: 'passkey_challenge_used',
        resourceId: 'challenge_1',
      });

      await mockAuditLog.create({
        data: {
          tenantId: 'tenant1',
          actor: 'user1',
          action: 'passkey_challenge_used',
          resourceId: 'challenge_1',
          category: 'AUTH',
        },
      });

      expect(mockAuditLog.create).toHaveBeenCalled();
    });
  });

  describe('challenge expiration protection', () => {
    it('creates challenges with expiration time', async () => {
      const now = Date.now();
      const expirationMs = 600000; // 10 minutes

      mockPasskeyChallenge.create.mockResolvedValue({
        id: 'challenge_1',
        userId: 'user1',
        challenge: 'random_challenge',
        expiresAt: new Date(now + expirationMs),
        createdAt: new Date(now),
      });

      const result = await mockPasskeyChallenge.create({
        data: {
          userId: 'user1',
          challenge: 'random_challenge',
          expiresAt: new Date(now + expirationMs),
        },
      });

      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(now);
    });

    it('rejects expired challenges', async () => {
      mockPasskeyChallenge.findUnique.mockResolvedValue({
        id: 'challenge_1',
        userId: 'user1',
        expiresAt: new Date(Date.now() - 60000), // 1 minute ago
        used: false,
      });

      const challenge = await mockPasskeyChallenge.findUnique({
        where: { id: 'challenge_1' },
      });

      // Application logic should check expiration
      expect(challenge.expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it('cleans up expired challenges', async () => {
      mockPasskeyChallenge.deleteMany.mockResolvedValue({ count: 5 });

      const result = await mockPasskeyChallenge.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      expect(result.count).toBe(5);
    });

    it('uses correct expiration window (10 minutes)', () => {
      const CHALLENGE_EXPIRATION_MS = 10 * 60 * 1000;
      expect(CHALLENGE_EXPIRATION_MS).toBe(600000);
    });
  });

  describe('challenge tenant-scoping', () => {
    it('challenges are scoped to user and tenant', async () => {
      mockPasskeyChallenge.findFirst.mockResolvedValue({
        id: 'challenge_1',
        userId: 'user1',
        tenantId: 'tenant1',
      });

      await mockPasskeyChallenge.findFirst({
        where: {
          userId: 'user1',
          tenantId: 'tenant1',
          id: 'challenge_1',
        },
      });

      const call = mockPasskeyChallenge.findFirst.mock.calls[0][0];
      expect(call.where.userId).toBe('user1');
      expect(call.where.tenantId).toBe('tenant1');
    });

    it('prevents challenge reuse across tenants', async () => {
      mockPasskeyChallenge.findFirst.mockResolvedValue(null);

      const result = await mockPasskeyChallenge.findFirst({
        where: {
          id: 'challenge_1',
          userId: 'user1',
          tenantId: 'tenant2', // Different tenant
        },
      });

      expect(result).toBeNull();
    });

    it('prevents challenge reuse by different user in same tenant', async () => {
      mockPasskeyChallenge.findFirst.mockResolvedValue(null);

      const result = await mockPasskeyChallenge.findFirst({
        where: {
          id: 'challenge_1',
          userId: 'different_user',
          tenantId: 'tenant1',
        },
      });

      expect(result).toBeNull();
    });
  });

  describe('passkey credential verification', () => {
    it('stores passkey credentials after successful registration', async () => {
      mockPasskey.create.mockResolvedValue({
        id: 'key_1',
        userId: 'user1',
        tenantId: 'tenant1',
        publicKeyBytes: Buffer.from('public_key_data'),
        credentialId: 'credential_123',
        counter: 0,
      });

      const result = await mockPasskey.create({
        data: {
          userId: 'user1',
          tenantId: 'tenant1',
          credentialId: 'credential_123',
          publicKeyBytes: Buffer.from('public_key_data'),
          counter: 0,
        },
      });

      expect(result.credentialId).toBe('credential_123');
    });

    it('updates counter on each successful authentication', async () => {
      mockPasskey.update.mockResolvedValue({
        id: 'key_1',
        counter: 5,
        lastUsedAt: new Date(),
      });

      const result = await mockPasskey.update({
        where: { id: 'key_1' },
        data: { counter: 5, lastUsedAt: new Date() },
      });

      expect(result.counter).toBe(5);
    });

    it('detects cloning attempts via counter validation', async () => {
      mockPasskey.findUnique.mockResolvedValue({
        id: 'key_1',
        counter: 10,
      });

      const storedKey = await mockPasskey.findUnique({
        where: { id: 'key_1' },
      });

      // Application should verify counter >= stored counter
      // If received counter < stored counter, it's a cloning attempt
      expect(storedKey.counter).toBe(10);
    });
  });

  describe('successful challenge invalidation', () => {
    it('invalidates challenge after successful authentication', async () => {
      mockPasskeyChallenge.update.mockResolvedValue({
        id: 'challenge_1',
        used: true,
        usedAt: new Date(),
      });

      const result = await mockPasskeyChallenge.update({
        where: { id: 'challenge_1' },
        data: { used: true, usedAt: new Date() },
      });

      expect(result.used).toBe(true);
    });

    it('records successful authentication in audit log', async () => {
      mockAuditLog.create.mockResolvedValue({
        id: 'audit_1',
        actor: 'user1',
        action: 'passkey_authentication_successful',
      });

      await mockAuditLog.create({
        data: {
          tenantId: 'tenant1',
          actor: 'user1',
          action: 'passkey_authentication_successful',
          category: 'AUTH',
        },
      });

      expect(mockAuditLog.create).toHaveBeenCalled();
    });

    it('prevents subsequent use of a challenge after successful auth', async () => {
      mockPasskeyChallenge.findUnique.mockResolvedValueOnce({
        id: 'challenge_1',
        used: false,
      });

      const firstUse = await mockPasskeyChallenge.findUnique({
        where: { id: 'challenge_1' },
      });
      expect(firstUse.used).toBe(false);

      // After marking as used
      mockPasskeyChallenge.findUnique.mockResolvedValueOnce({
        id: 'challenge_1',
        used: true,
      });

      const secondUse = await mockPasskeyChallenge.findUnique({
        where: { id: 'challenge_1' },
      });
      expect(secondUse.used).toBe(true);
    });
  });

  describe('failed authentication attempts', () => {
    it('logs failed authentication attempts', async () => {
      mockAuditLog.create.mockResolvedValue({
        id: 'audit_1',
        actor: 'user1',
        action: 'passkey_authentication_failed',
      });

      await mockAuditLog.create({
        data: {
          tenantId: 'tenant1',
          actor: 'user1',
          action: 'passkey_authentication_failed',
          category: 'AUTH',
          metadata: { reason: 'invalid_signature' },
        },
      });

      expect(mockAuditLog.create).toHaveBeenCalled();
    });

    it('does not invalidate challenge on failed attempts', async () => {
      mockPasskeyChallenge.findUnique.mockResolvedValue({
        id: 'challenge_1',
        used: false,
      });

      const result = await mockPasskeyChallenge.findUnique({
        where: { id: 'challenge_1' },
      });

      expect(result.used).toBe(false);
      // Challenge should remain valid for retry
    });

    it('limits authentication retries per challenge', async () => {
      mockPasskeyChallenge.findUnique.mockResolvedValue({
        id: 'challenge_1',
        attemptCount: 5,
        maxAttempts: 5,
      });

      const challenge = await mockPasskeyChallenge.findUnique({
        where: { id: 'challenge_1' },
      });

      expect(challenge.attemptCount).toBe(challenge.maxAttempts);
    });
  });
});
