import { jest } from '@jest/globals';

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_dummy';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.USDC_ISSUER = 'GISSUERDUMMY';

const ADDRESS = `G${'A'.repeat(55)}`;

const paymentRecords = new Map();
let nextId = 1;

const prismaMock = {
  payment: {
    create: jest.fn(async ({ data }) => {
      const record = { id: `pay_${nextId++}`, ...data };
      paymentRecords.set(record.stripeSessionId, record);
      return record;
    }),
    findUnique: jest.fn(async ({ where }) => {
      if (where.stripeSessionId) return paymentRecords.get(where.stripeSessionId) ?? null;
      for (const record of paymentRecords.values()) {
        if (record.id === where.id) return record;
      }
      return null;
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      let count = 0;
      for (const record of paymentRecords.values()) {
        if (record.stripeSessionId === where.stripeSessionId) {
          Object.assign(record, data);
          count += 1;
        }
      }
      return { count };
    }),
    findFirst: jest.fn(async ({ where }) => paymentRecords.get(where.stripeSessionId) ?? null),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('../lib/tenantContext.js', () => ({
  getCurrentTenantId: () => 'tenant_default',
  withTenantScopeBypassed: async (fn) => fn(),
}));

const checkoutSession = {
  id: 'cs_test_123',
  url: 'https://checkout.stripe.com/pay/cs_test_123',
};

const stripeMock = {
  checkout: {
    sessions: {
      create: jest.fn(async () => checkoutSession),
    },
  },
  refunds: { create: jest.fn() },
  webhooks: {
    constructEvent: jest.fn((rawBody) => JSON.parse(rawBody)),
  },
};

jest.unstable_mockModule('stripe', () => ({
  default: jest.fn(() => stripeMock),
}));

global.fetch = jest.fn(async () => ({
  ok: true,
  json: async () => ({ bids: [{ price: '0.12' }] }),
}));

const { default: paymentService } = await import('../services/paymentService.js');

describe('paymentService — happy path end-to-end', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paymentRecords.clear();
    stripeMock.checkout.sessions.create.mockResolvedValue(checkoutSession);
    stripeMock.webhooks.constructEvent.mockImplementation((rawBody) => JSON.parse(rawBody));
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ bids: [{ price: '0.12' }] }),
    });
  });

  it('creates a checkout session, marks it completed via webhook, and exposes it by session id', async () => {
    const { sessionId, url, paymentId } = await paymentService.createCheckoutSession({
      address: ADDRESS,
      amountUsd: 25,
      escrowId: null,
    });

    expect(sessionId).toBe('cs_test_123');
    expect(url).toBe(checkoutSession.url);
    expect(paymentId).toBeTruthy();

    const pending = await paymentService.getBySessionId(sessionId);
    expect(pending.status).toBe('Pending');

    const webhookEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_intent: 'pi_test_123',
          amount_total: 2500,
          metadata: { address: ADDRESS, tenantId: 'tenant_default' },
        },
      },
    };

    const updated = await paymentService.handleWebhook(JSON.stringify(webhookEvent), 'sig_dummy');

    expect(updated.status).toBe('Completed');
    expect(updated.stripePaymentIntent).toBe('pi_test_123');
    expect(updated.amountCrypto).toMatch(/XLM$/);

    const final = await paymentService.getBySessionId(sessionId);
    expect(final.status).toBe('Completed');
  });
});
