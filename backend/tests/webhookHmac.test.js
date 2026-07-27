/**
 * Webhook HMAC signature verification tests
 *
 * Covers:
 *  Unit — signPayload / verifySignature utility
 *    • valid signature is accepted
 *    • invalid (tampered) signature is rejected
 *    • empty / missing body is handled safely
 *    • wrong secret is rejected
 *    • timing-safe comparison is used (crypto.timingSafeEqual is called)
 *
 *  Integration — webhook delivery pipeline
 *    • correct signature computed during queueSubscriptionWebhook passes verification
 *    • tampered payload produces a rejected signature
 *    • X-Webhook-Signature header value matches the documented spec (raw hex, no prefix)
 *    • SIGNATURE_HEADER constant equals 'X-Webhook-Signature'
 *    • buildWebhookPayload envelope matches the documented JSON structure
 */

import { jest } from '@jest/globals';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------
const TEST_SECRET = 'super-secret-key-for-tests-1234';
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
function computeReferenceHmac(secret, payloadObj) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payloadObj)).digest('hex');
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
    it('produces a non-empty hex string', () => {
      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      expect(typeof sig).toBe('string');
      expect(sig.length).toBeGreaterThan(0);
      expect(sig).toMatch(/^[0-9a-f]+$/);
    });

    it('produces a 64-character hex string (SHA-256 = 32 bytes)', () => {
      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      expect(sig).toHaveLength(64);
    });

    it('is deterministic — same inputs always yield the same signature', () => {
      const sig1 = signPayload(TEST_SECRET, TEST_PAYLOAD);
      const sig2 = signPayload(TEST_SECRET, TEST_PAYLOAD);
      expect(sig1).toBe(sig2);
    });

    it('matches an independently-computed HMAC-SHA256 reference value', () => {
      const expected = computeReferenceHmac(TEST_SECRET, TEST_PAYLOAD);
      expect(signPayload(TEST_SECRET, TEST_PAYLOAD)).toBe(expected);
    });

    it('produces a different signature when the secret changes', () => {
      const sig1 = signPayload(TEST_SECRET, TEST_PAYLOAD);
      const sig2 = signPayload('a-completely-different-secret', TEST_PAYLOAD);
      expect(sig1).not.toBe(sig2);
    });

    it('produces a different signature when the payload changes', () => {
      const sig1 = signPayload(TEST_SECRET, TEST_PAYLOAD);
      const tampered = { ...TEST_PAYLOAD, data: { ...TEST_PAYLOAD.data, escrowId: '99' } };
      const sig2 = signPayload(TEST_SECRET, tampered);
      expect(sig1).not.toBe(sig2);
    });

    it('handles an empty object payload without throwing', () => {
      expect(() => signPayload(TEST_SECRET, {})).not.toThrow();
      const sig = signPayload(TEST_SECRET, {});
      expect(sig).toHaveLength(64);
    });
  });

  // ── verifySignature ────────────────────────────────────────────────────

  describe('verifySignature', () => {
    it('returns true for a valid signature', () => {
      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      expect(verifySignature(TEST_SECRET, TEST_PAYLOAD, sig)).toBe(true);
    });

    it('returns false when the received signature is wrong', () => {
      const badSig = 'a'.repeat(64); // plausible-length but wrong hex
      expect(verifySignature(TEST_SECRET, TEST_PAYLOAD, badSig)).toBe(false);
    });

    it('returns false when the payload has been tampered', () => {
      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      const tampered = { ...TEST_PAYLOAD, data: { ...TEST_PAYLOAD.data, escrowId: '99' } };
      expect(verifySignature(TEST_SECRET, tampered, sig)).toBe(false);
    });

    it('returns false when the wrong secret is used', () => {
      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      expect(verifySignature('wrong-secret', TEST_PAYLOAD, sig)).toBe(false);
    });

    it('returns false for a missing (undefined) signature', () => {
      expect(verifySignature(TEST_SECRET, TEST_PAYLOAD, undefined)).toBe(false);
    });

    it('returns false for a null signature', () => {
      expect(verifySignature(TEST_SECRET, TEST_PAYLOAD, null)).toBe(false);
    });

    it('returns false for an empty string signature', () => {
      expect(verifySignature(TEST_SECRET, TEST_PAYLOAD, '')).toBe(false);
    });

    it('returns false for a signature of different length (not a valid hex digest)', () => {
      expect(verifySignature(TEST_SECRET, TEST_PAYLOAD, 'abc123')).toBe(false);
    });

    it('handles an empty object payload safely (both sides agree)', () => {
      const sig = signPayload(TEST_SECRET, {});
      expect(verifySignature(TEST_SECRET, {}, sig)).toBe(true);
    });
  });

  // ── timing-safe comparison ─────────────────────────────────────────────

  describe('timing-safe comparison', () => {
    it('calls crypto.timingSafeEqual when signature lengths match', () => {
      // Spy on the real crypto module at test-time.
      const timingSafeSpy = jest.spyOn(crypto, 'timingSafeEqual');

      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      verifySignature(TEST_SECRET, TEST_PAYLOAD, sig);

      expect(timingSafeSpy).toHaveBeenCalled();
      timingSafeSpy.mockRestore();
    });

    it('does NOT call timingSafeEqual when lengths differ (early exit to avoid Buffer error)', () => {
      const timingSafeSpy = jest.spyOn(crypto, 'timingSafeEqual');

      // Short/mismatched signature skips timingSafeEqual entirely
      verifySignature(TEST_SECRET, TEST_PAYLOAD, 'short');

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

    it('is a raw lowercase hex string with no prefix (e.g. no "sha256=" prefix)', () => {
      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      // Per the documented spec: compute HMAC-SHA256, digest('hex') — no prefix
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
      expect(sig).not.toContain('=');
      expect(sig).not.toMatch(/^sha256=/);
    });

    it('is exactly 64 hex characters (256-bit SHA-256 output)', () => {
      const sig = signPayload(TEST_SECRET, TEST_PAYLOAD);
      expect(sig).toHaveLength(64);
    });

    it('header value set during queueEventWebhooks is a 64-char lowercase hex string', async () => {
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

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
      expect(signature).not.toContain('=');
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

      // A recipient verifying the delivery should succeed.
      expect(verifySignature(TEST_SECRET, signedPayload, receivedSignature)).toBe(true);
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

      // Attacker tampers with the payload after delivery
      const tamperedPayload = {
        ...originalPayload,
        data: { ...originalPayload.data, ledger: '999999' },
      };

      expect(verifySignature(TEST_SECRET, tamperedPayload, receivedSignature)).toBe(false);
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

      const tamperedPayload = { ...originalPayload, eventType: 'funds_rel' };

      expect(verifySignature(TEST_SECRET, tamperedPayload, receivedSignature)).toBe(false);
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

      // Recipient using the wrong secret cannot forge a match
      expect(verifySignature('attacker-does-not-know-the-secret', signedPayload, receivedSignature)).toBe(false);
    });
  });

  // ── All required headers are present on each delivery ────────────────────

  describe('all delivery headers present', () => {
    beforeEach(() => loadService());

    it('enqueued delivery includes X-Webhook-Signature, X-Webhook-Delivery-Id, and X-Webhook-Event-Type', async () => {
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
      expect(headers).toHaveProperty(DELIVERY_ID_HEADER, 'delivery_2');
      expect(headers).toHaveProperty(EVENT_TYPE_HEADER, 'mil_apr');
      expect(headers).toHaveProperty('Content-Type', 'application/json');
    });
  });
});
