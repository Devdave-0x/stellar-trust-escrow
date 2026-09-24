/**
 * Webhook signing secret rotation workflow tests — Issue #546
 *
 * Covers the dual-secret rotation workflow that allows integrations to rotate
 * webhook secrets without delivery downtime.
 *
 * Acceptance Criteria:
 *  • Webhook deliveries support both current and next secret simultaneously
 *  • Older secret expires after a specified deadline
 *  • All existing tests continue passing
 *  • New tests added for modified behavior
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';

const TEST_SECRET_CURRENT = 'current-secret-xyz123';
const TEST_SECRET_NEXT = 'next-secret-abc456';
const TEST_EXPIRATION = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
const TEST_PAYLOAD = {
  eventType: 'esc_crt',
  deliveryId: 'delivery_webhook_001',
  timestamp: '2026-05-28T12:34:56.789Z',
  data: {
    ledger: '123456',
    escrowId: '42',
    txHash: 'aabbccdd',
  },
};

function computeHmac(secret, timestamp, payloadObj) {
  const signingInput = `${timestamp}.${JSON.stringify(payloadObj)}`;
  return `sha256=${crypto.createHmac('sha256', secret).update(signingInput).digest('hex')}`;
}

describe('Webhook Secret Rotation — Issue #546', () => {
  let webhookService;
  let prismaMock;

  beforeAll(async () => {
    prismaMock = {
      webhookSubscription: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      webhookSecret: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb?.(prismaMock)),
    };

    jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
    webhookService = (await import('../services/webhookService.js')).default;
  });

  describe('rotateSecret', () => {
    it('creates a new next_secret and sets expiration timestamp', async () => {
      const subscriptionId = 'sub_123';
      const newSecret = 'rotated-secret-new-xyz789';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      prismaMock.webhookSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: null,
        next_secret_expires_at: null,
      });

      prismaMock.webhookSubscription.update.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: newSecret,
        next_secret_expires_at: expiresAt,
      });

      const result = await webhookService.rotateSecret(subscriptionId, newSecret, expiresAt);

      expect(result.next_secret).toBe(newSecret);
      expect(result.next_secret_expires_at).toEqual(expiresAt);
      expect(prismaMock.webhookSubscription.update).toHaveBeenCalled();
    });

    it('replaces old current_secret with next_secret when expiration is reached', async () => {
      const subscriptionId = 'sub_456';
      const pastExpiresAt = new Date(Date.now() - 1000);

      prismaMock.webhookSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: TEST_SECRET_NEXT,
        next_secret_expires_at: pastExpiresAt,
      });

      prismaMock.webhookSubscription.update.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_NEXT,
        next_secret: null,
        next_secret_expires_at: null,
      });

      const result = await webhookService.promoteNextSecret(subscriptionId);

      expect(result.current_secret).toBe(TEST_SECRET_NEXT);
      expect(result.next_secret).toBeNull();
    });
  });

  describe('verifyWebhookSignature with dual-secret support', () => {
    it('accepts signature with current_secret', async () => {
      const subscriptionId = 'sub_789';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = computeHmac(TEST_SECRET_CURRENT, timestamp, TEST_PAYLOAD);

      prismaMock.webhookSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: TEST_SECRET_NEXT,
        next_secret_expires_at: new Date(Date.now() + 3600000),
      });

      const isValid = await webhookService.verifyWebhookSignature(
        subscriptionId,
        signature,
        timestamp,
        TEST_PAYLOAD
      );

      expect(isValid).toBe(true);
    });

    it('accepts signature with next_secret before expiration', async () => {
      const subscriptionId = 'sub_790';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = computeHmac(TEST_SECRET_NEXT, timestamp, TEST_PAYLOAD);

      prismaMock.webhookSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: TEST_SECRET_NEXT,
        next_secret_expires_at: new Date(Date.now() + 3600000),
      });

      const isValid = await webhookService.verifyWebhookSignature(
        subscriptionId,
        signature,
        timestamp,
        TEST_PAYLOAD
      );

      expect(isValid).toBe(true);
    });

    it('rejects signature with next_secret after expiration', async () => {
      const subscriptionId = 'sub_791';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = computeHmac(TEST_SECRET_NEXT, timestamp, TEST_PAYLOAD);
      const pastExpiration = new Date(Date.now() - 1000);

      prismaMock.webhookSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: TEST_SECRET_NEXT,
        next_secret_expires_at: pastExpiration,
      });

      const isValid = await webhookService.verifyWebhookSignature(
        subscriptionId,
        signature,
        timestamp,
        TEST_PAYLOAD
      );

      expect(isValid).toBe(false);
    });

    it('rejects invalid signature', async () => {
      const subscriptionId = 'sub_792';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const invalidSignature = 'sha256=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

      prismaMock.webhookSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: null,
        next_secret_expires_at: null,
      });

      const isValid = await webhookService.verifyWebhookSignature(
        subscriptionId,
        invalidSignature,
        timestamp,
        TEST_PAYLOAD
      );

      expect(isValid).toBe(false);
    });
  });

  describe('cleanupExpiredSecrets', () => {
    it('removes expired next_secret entries', async () => {
      const expiredSubscriptions = [
        {
          id: 'sub_exp_1',
          next_secret: TEST_SECRET_NEXT,
          next_secret_expires_at: new Date(Date.now() - 1000),
        },
        {
          id: 'sub_exp_2',
          next_secret: TEST_SECRET_NEXT,
          next_secret_expires_at: new Date(Date.now() - 2000),
        },
      ];

      prismaMock.webhookSubscription.findMany.mockResolvedValue(expiredSubscriptions);

      for (const sub of expiredSubscriptions) {
        prismaMock.webhookSubscription.update.mockResolvedValueOnce({
          ...sub,
          next_secret: null,
          next_secret_expires_at: null,
        });
      }

      await webhookService.cleanupExpiredSecrets();

      expect(prismaMock.webhookSubscription.findMany).toHaveBeenCalled();
      expect(prismaMock.webhookSubscription.update).toHaveBeenCalledTimes(expiredSubscriptions.length);
    });
  });

  describe('Backward compatibility', () => {
    it('existing tests with single current_secret still pass', async () => {
      const subscriptionId = 'sub_compat_1';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = computeHmac(TEST_SECRET_CURRENT, timestamp, TEST_PAYLOAD);

      prismaMock.webhookSubscription.findUnique.mockResolvedValue({
        id: subscriptionId,
        current_secret: TEST_SECRET_CURRENT,
        next_secret: null,
        next_secret_expires_at: null,
      });

      const isValid = await webhookService.verifyWebhookSignature(
        subscriptionId,
        signature,
        timestamp,
        TEST_PAYLOAD
      );

      expect(isValid).toBe(true);
    });
  });
});
