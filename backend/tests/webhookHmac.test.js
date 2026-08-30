/**
 * Webhook HMAC signature verification tests
 *
 * Covers the scheme documented in docs/webhook-delivery.md: signatures are
 * `sha256=` prefixed HMAC-SHA256 digests computed over `timestamp + "." + rawBody`.
 *
 *  Unit — signPayload / verifySignature utility
 *    • valid signature is accepted
 *    • invalid (tampered) signature is rejected
 *    • tampered timestamp is rejected (prevents replay across payloads)
 *    • empty / missing body is handled safely
 *    • wrong secret is rejected
 *    • timing-safe comparison is used (crypto.timingSafeEqual is called)
 *
 *  Integration — webhook delivery pipeline
 *    • correct signature computed during queueSubscriptionWebhook passes verification
 *    • tampered payload produces a rejected signature
 *    • X-Webhook-Signature header value matches the documented spec (sha256= prefix + hex)
 *    • SIGNATURE_HEADER constant equals 'X-Webhook-Signature'
 *    • buildWebhookPayload envelope matches the documented JSON structure
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------
const TEST_SECRET = 'super-secret-key-for-tests-1234';
const TEST_TIMESTAMP = '1780000000';
const TEST_PAYLOAD = {
  eventType: 'esc_crt',
  deliveryId: 'delivery_abc123',
  timestamp: '2026-05-28T12:34:56.789Z',
  data: {
    ledger: '123456',
    escrowId: '42',
    txHash: 'aabbccdd',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the reference HMAC-SHA256 signature independently of the service
 * so we can cross-check without depending on the implementation under test.
 */
function computeReferenceHmac(secret, timestamp, payloadObj) {
  const signingInput = `${timestamp}.${JSON.stringify(payloadObj)}`;
  return `sha256=${crypto.createHmac('sha256', secret).update(signingInput).digest('hex')}`;
}

// ---------------------------------------------------------------------------
// Unit tests — signPayload & verifySignature
// ---------------------------------------------------------------------------

describe('webhookService HMAC utilities — unit', () => {
  let signPayload;
  let verifySignature;

  beforeAll(async () => {
    // Import without mocking so we exercise the real crypto path.
    const mod = await import('../services/webhookService.js');
    signPayload = mod.signPayload;
    verifySignature = mod.verifySignature;
  });

  // ── signPayload ────────────────────────────────────────────────────────

  describe('signPayload', () => {
    it('produces a "sha256=" prefixed hex string', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(typeof sig).toBe('string');
      expect(sig).toMatch(/^sha256=[0-9a-f]+$/);
    });

    it('produces a 64-character hex digest (SHA-256 = 32 bytes)', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(sig.slice('sha256='.length)).toHaveLength(64);
    });

    it('is deterministic — same inputs always yield the same signature', () => {
      const sig1 = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      const sig2 = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(sig1).toBe(sig2);
    });

    it('matches an independently-computed HMAC-SHA256 reference value', () => {
      const expected = computeReferenceHmac(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD)).toBe(expected);
    });

    it('produces a different signature when the secret changes', () => {
      const sig1 = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      const sig2 = signPayload('a-completely-different-secret', TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(sig1).not.toBe(sig2);
    });

    it('produces a different signature when the payload changes', () => {
      const sig1 = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      const tampered = { ...TEST_PAYLOAD, data: { ...TEST_PAYLOAD.data, escrowId: '99' } };
      const sig2 = signPayload(TEST_SECRET, TEST_TIMESTAMP, tampered);
      expect(sig1).not.toBe(sig2);
    });

    it('produces a different signature when the timestamp changes', () => {
      const sig1 = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      const sig2 = signPayload(TEST_SECRET, '1780000001', TEST_PAYLOAD);
      expect(sig1).not.toBe(sig2);
    });

    it('handles an empty object payload without throwing', () => {
      expect(() => signPayload(TEST_SECRET, TEST_TIMESTAMP, {})).not.toThrow();
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, {});
      expect(sig.slice('sha256='.length)).toHaveLength(64);
    });
  });

  // ── verifySignature ────────────────────────────────────────────────────

  describe('verifySignature', () => {
    it('returns true for a valid signature', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, sig)).toBe(true);
    });

    it('accepts a received signature without the "sha256=" prefix', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      const bareHex = sig.slice('sha256='.length);
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, bareHex)).toBe(true);
    });

    it('returns false when the received signature is wrong', () => {
      const badSig = `sha256=${'a'.repeat(64)}`; // plausible-length but wrong hex
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, badSig)).toBe(false);
    });

    it('returns false when the payload has been tampered', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      const tampered = { ...TEST_PAYLOAD, data: { ...TEST_PAYLOAD.data, escrowId: '99' } };
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, tampered, sig)).toBe(false);
    });

    it('returns false when the timestamp has been tampered', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(verifySignature(TEST_SECRET, '1780000001', TEST_PAYLOAD, sig)).toBe(false);
    });

    it('returns false when the wrong secret is used', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(verifySignature('wrong-secret', TEST_TIMESTAMP, TEST_PAYLOAD, sig)).toBe(false);
    });

    it('returns false for a missing (undefined) signature', () => {
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, undefined)).toBe(false);
    });

    it('returns false for a null signature', () => {
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, null)).toBe(false);
    });

    it('returns false when any required value is nullish', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      expect(verifySignature(undefined, TEST_TIMESTAMP, TEST_PAYLOAD, sig)).toBe(false);
      expect(verifySignature(TEST_SECRET, undefined, TEST_PAYLOAD, sig)).toBe(false);
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, null, sig)).toBe(false);
    });

    it('returns false for an empty string signature', () => {
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, '')).toBe(false);
    });

    it('returns false for a signature of different length (not a valid hex digest)', () => {
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, 'abc123')).toBe(false);
    });

    it('returns false for a non-hex signature of the correct length', () => {
      const sig = `sha256=${'z'.repeat(64)}`;
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, sig)).toBe(false);
    });

    it('handles an empty object payload safely (both sides agree)', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, {});
      expect(verifySignature(TEST_SECRET, TEST_TIMESTAMP, {}, sig)).toBe(true);
    });
  });

  // ── timing-safe comparison ─────────────────────────────────────────────

  describe('timing-safe comparison', () => {
    it('calls crypto.timingSafeEqual when signature lengths match', () => {
      // Spy on the real crypto module at test-time.
      const timingSafeSpy = jest.spyOn(crypto, 'timingSafeEqual');

      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, sig);

      expect(timingSafeSpy).toHaveBeenCalled();
      timingSafeSpy.mockRestore();
    });

    it('does NOT call timingSafeEqual when lengths differ (early exit to avoid Buffer error)', () => {
      const timingSafeSpy = jest.spyOn(crypto, 'timingSafeEqual');

      // Short/mismatched signature skips timingSafeEqual entirely
      verifySignature(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD, 'short');

      expect(timingSafeSpy).not.toHaveBeenCalled();
      timingSafeSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests — delivery pipeline & header spec compliance
// ---------------------------------------------------------------------------

describe('webhookService delivery pipeline — integration', () => {
  // Prisma and queue mocks shared across integration tests
  const prismaMock = {
    webhookSubscription: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    webhookDelivery: {
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const enqueueWebhookDeliveryMock = jest.fn();

  let webhookService;
  let SIGNATURE_HEADER;
  let TIMESTAMP_HEADER;
  let DELIVERY_ID_HEADER;
  let EVENT_TYPE_HEADER;
  let signPayload;
  let verifySignature;
  let buildWebhookPayload;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
    jest.unstable_mockModule('../lib/tenantContext.js', () => ({
      withTenantScopeBypassed: jest.fn(async (fn) => fn()),
    }));
    jest.unstable_mockModule('../queues/webhookQueue.js', () => ({
      enqueueWebhookDelivery: enqueueWebhookDeliveryMock,
    }));
  });

  async function loadService() {
    const mod = await import('../services/webhookService.js');
    webhookService = mod.default;
    SIGNATURE_HEADER = mod.SIGNATURE_HEADER;
    TIMESTAMP_HEADER = mod.TIMESTAMP_HEADER;
    DELIVERY_ID_HEADER = mod.DELIVERY_ID_HEADER;
    EVENT_TYPE_HEADER = mod.EVENT_TYPE_HEADER;
    signPayload = mod.signPayload;
    verifySignature = mod.verifySignature;
    buildWebhookPayload = mod.buildWebhookPayload;
  }

  // ── Header constant spec compliance ─────────────────────────────────────

  describe('X-Webhook-Signature header spec', () => {
    beforeEach(() => loadService());

    it('SIGNATURE_HEADER constant equals "X-Webhook-Signature"', () => {
      expect(SIGNATURE_HEADER).toBe('X-Webhook-Signature');
    });

    it('TIMESTAMP_HEADER constant equals "X-Webhook-Timestamp"', () => {
      expect(TIMESTAMP_HEADER).toBe('X-Webhook-Timestamp');
    });

    it('DELIVERY_ID_HEADER constant equals "X-Webhook-Delivery-Id"', () => {
      expect(DELIVERY_ID_HEADER).toBe('X-Webhook-Delivery-Id');
    });

    it('EVENT_TYPE_HEADER constant equals "X-Webhook-Event-Type"', () => {
      expect(EVENT_TYPE_HEADER).toBe('X-Webhook-Event-Type');
    });
  });

  // ── Signature header value format ────────────────────────────────────────

  describe('X-Webhook-Signature header value format (documented spec)', () => {
    beforeEach(() => loadService());

    it('is "sha256=" followed by a lowercase hex digest', () => {
      const sig = signPayload(TEST_SECRET, TEST_TIMESTAMP, TEST_PAYLOAD);
      // Per docs/webhook-delivery.md: sha256= prefix + HMAC-SHA256 hex digest
      expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    });

    it('header value set during queueEventWebhooks matches the documented format', async () => {
      const subscription = {
        id: 'sub_1',
        url: 'https://example.com/hook',
        secret: TEST_SECRET,
        eventTypes: ['esc_crt'],
        isActive: true,
      };
      prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
      prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
      prismaMock.webhookDelivery.update.mockResolvedValue({});
      enqueueWebhookDeliveryMock.mockResolvedValue({});

      await webhookService.queueEventWebhooks('esc_crt', { ledger: '100' });

      const callArgs = enqueueWebhookDeliveryMock.mock.calls[0];
      const headers = callArgs[3]; // 4th arg: headers object
      const signature = headers[SIGNATURE_HEADER];
      const timestamp = headers[TIMESTAMP_HEADER];

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(timestamp).toMatch(/^\d+$/);
    });
  });

  // ── buildWebhookPayload envelope ─────────────────────────────────────────

  describe('buildWebhookPayload envelope structure', () => {
    beforeEach(() => loadService());

    it('wraps data in the documented JSON envelope', () => {
      const envelope = buildWebhookPayload('esc_crt', { escrowId: '42' }, 'delivery_xyz');
      expect(envelope).toMatchObject({
        eventType: 'esc_crt',
        deliveryId: 'delivery_xyz',
        data: { escrowId: '42' },
      });
      expect(typeof envelope.timestamp).toBe('string');
      // Must be a valid ISO-8601 timestamp
      expect(new Date(envelope.timestamp).toISOString()).toBe(envelope.timestamp);
    });
  });

  // ── Correct signature passes verification ────────────────────────────────

  describe('correct signature accepted', () => {
    beforeEach(() => loadService());

    it('signature set in the delivery header verifies against the signed payload', async () => {
      const subscription = {
        id: 'sub_1',
        url: 'https://example.com/hook',
        secret: TEST_SECRET,
        eventTypes: ['esc_crt'],
        isActive: true,
      };
      prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
      prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
      prismaMock.webhookDelivery.update.mockResolvedValue({});
      enqueueWebhookDeliveryMock.mockResolvedValue({});

      await webhookService.queueEventWebhooks('esc_crt', { ledger: '100' });

      const callArgs = enqueueWebhookDeliveryMock.mock.calls[0];
      const signedPayload = callArgs[2]; // 3rd arg: payload passed to the worker
      const headers = callArgs[3]; // 4th arg: headers object
      const receivedSignature = headers[SIGNATURE_HEADER];
      const timestamp = headers[TIMESTAMP_HEADER];

      // A recipient verifying the delivery should succeed.
      expect(verifySignature(TEST_SECRET, timestamp, signedPayload, receivedSignature)).toBe(true);
    });
  });

  // ── Tampered payload rejected ─────────────────────────────────────────────

  describe('tampered payload rejected', () => {
    beforeEach(() => loadService());

    it('verifySignature returns false when the payload body has been modified after signing', async () => {
      const subscription = {
        id: 'sub_1',
        url: 'https://example.com/hook',
        secret: TEST_SECRET,
        eventTypes: ['esc_crt'],
        isActive: true,
      };
      prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
      prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
      prismaMock.webhookDelivery.update.mockResolvedValue({});
      enqueueWebhookDeliveryMock.mockResolvedValue({});

      await webhookService.queueEventWebhooks('esc_crt', { ledger: '100' });

      const callArgs = enqueueWebhookDeliveryMock.mock.calls[0];
      const originalPayload = callArgs[2];
      const headers = callArgs[3];
      const receivedSignature = headers[SIGNATURE_HEADER];
      const timestamp = headers[TIMESTAMP_HEADER];

      // Attacker tampers with the payload after delivery
      const tamperedPayload = {
        ...originalPayload,
        data: { ...originalPayload.data, ledger: '999999' },
      };

      expect(verifySignature(TEST_SECRET, timestamp, tamperedPayload, receivedSignature)).toBe(
        false,
      );
    });

    it('verifySignature returns false when eventType has been altered', async () => {
      const subscription = {
        id: 'sub_1',
        url: 'https://example.com/hook',
        secret: TEST_SECRET,
        eventTypes: ['esc_crt'],
        isActive: true,
      };
      prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
      prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
      prismaMock.webhookDelivery.update.mockResolvedValue({});
      enqueueWebhookDeliveryMock.mockResolvedValue({});

      await webhookService.queueEventWebhooks('esc_crt', { amount: '1000' });

      const callArgs = enqueueWebhookDeliveryMock.mock.calls[0];
      const originalPayload = callArgs[2];
      const headers = callArgs[3];
      const receivedSignature = headers[SIGNATURE_HEADER];
      const timestamp = headers[TIMESTAMP_HEADER];

      const tamperedPayload = { ...originalPayload, eventType: 'funds_rel' };

      expect(verifySignature(TEST_SECRET, timestamp, tamperedPayload, receivedSignature)).toBe(
        false,
      );
    });

    it('verifySignature returns false when using a different subscription secret', async () => {
      const subscription = {
        id: 'sub_1',
        url: 'https://example.com/hook',
        secret: TEST_SECRET,
        eventTypes: ['esc_crt'],
        isActive: true,
      };
      prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
      prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
      prismaMock.webhookDelivery.update.mockResolvedValue({});
      enqueueWebhookDeliveryMock.mockResolvedValue({});

      await webhookService.queueEventWebhooks('esc_crt', { ledger: '100' });

      const callArgs = enqueueWebhookDeliveryMock.mock.calls[0];
      const signedPayload = callArgs[2];
      const headers = callArgs[3];
      const receivedSignature = headers[SIGNATURE_HEADER];
      const timestamp = headers[TIMESTAMP_HEADER];

      // Recipient using the wrong secret cannot forge a match
      expect(
        verifySignature(
          'attacker-does-not-know-the-secret',
          timestamp,
          signedPayload,
          receivedSignature,
        ),
      ).toBe(false);
    });

    it('verifySignature returns false when the timestamp has been altered (replay protection)', async () => {
      const subscription = {
        id: 'sub_1',
        url: 'https://example.com/hook',
        secret: TEST_SECRET,
        eventTypes: ['esc_crt'],
        isActive: true,
      };
      prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
      prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_1' });
      prismaMock.webhookDelivery.update.mockResolvedValue({});
      enqueueWebhookDeliveryMock.mockResolvedValue({});

      await webhookService.queueEventWebhooks('esc_crt', { ledger: '100' });

      const callArgs = enqueueWebhookDeliveryMock.mock.calls[0];
      const signedPayload = callArgs[2];
      const headers = callArgs[3];
      const receivedSignature = headers[SIGNATURE_HEADER];
      const originalTimestamp = headers[TIMESTAMP_HEADER];
      const replayedTimestamp = String(Number(originalTimestamp) + 1);

      expect(
        verifySignature(TEST_SECRET, replayedTimestamp, signedPayload, receivedSignature),
      ).toBe(false);
    });
  });

  // ── All required headers are present on each delivery ────────────────────

  describe('all delivery headers present', () => {
    beforeEach(() => loadService());

    it('enqueued delivery includes X-Webhook-Signature, X-Webhook-Timestamp, X-Webhook-Delivery-Id, and X-Webhook-Event-Type', async () => {
      const subscription = {
        id: 'sub_2',
        url: 'https://example.com/hook',
        secret: TEST_SECRET,
        eventTypes: ['mil_apr'],
        isActive: true,
      };
      prismaMock.webhookSubscription.findMany.mockResolvedValue([subscription]);
      prismaMock.webhookDelivery.create.mockResolvedValue({ id: 'delivery_2' });
      prismaMock.webhookDelivery.update.mockResolvedValue({});
      enqueueWebhookDeliveryMock.mockResolvedValue({});

      await webhookService.queueEventWebhooks('mil_apr', { milestoneId: '7' });

      const headers = enqueueWebhookDeliveryMock.mock.calls[0][3];

      expect(headers).toHaveProperty(SIGNATURE_HEADER);
      expect(headers).toHaveProperty(TIMESTAMP_HEADER);
      expect(headers).toHaveProperty(DELIVERY_ID_HEADER, 'delivery_2');
      expect(headers).toHaveProperty(EVENT_TYPE_HEADER, 'mil_apr');
      expect(headers).toHaveProperty('Content-Type', 'application/json');
    });
  });
});
