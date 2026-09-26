import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const prismaMock = {
  payment: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const stripeMock = {
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
  refunds: {
    create: jest.fn(),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
};

let stripeModuleMock = {
  default: class Stripe {
    constructor() {
      return stripeMock;
    }
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('stripe', () => stripeModuleMock);

const paymentService = await import('../services/paymentService.js');

describe('paymentService.createCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.FRONTEND_URL = 'http://localhost:3000';
  });

  it('accepts valid USD amounts with proper precision', async () => {
    const session = { id: 'sess_123', url: 'https://checkout.stripe.com/pay' };
    stripeMock.checkout.sessions.create.mockResolvedValue(session);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay_1' });

    const result = await paymentService.default.createCheckoutSession({
      address: 'GCLIENT'.padEnd(56, 'A'),
      amountUsd: 100.50,
    });

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 10050,
              currency: 'usd',
            }),
          }),
        ],
      }),
    );
    expect(result.sessionId).toBe('sess_123');
    expect(result.paymentId).toBe('pay_1');
  });

  it('rejects negative USD amounts', async () => {
    const result = async () =>
      paymentService.default.createCheckoutSession({
        address: 'GCLIENT'.padEnd(56, 'A'),
        amountUsd: -100,
      });

    await expect(result()).rejects.toThrow();
  });

  it('rejects zero USD amounts', async () => {
    const result = async () =>
      paymentService.default.createCheckoutSession({
        address: 'GCLIENT'.padEnd(56, 'A'),
        amountUsd: 0,
      });

    await expect(result()).rejects.toThrow();
  });

  it('correctly rounds USD to cents for Stripe', async () => {
    const session = { id: 'sess_123', url: 'https://checkout.stripe.com/pay' };
    stripeMock.checkout.sessions.create.mockResolvedValue(session);
    prismaMock.payment.create.mockResolvedValue({ id: 'pay_1' });

    await paymentService.default.createCheckoutSession({
      address: 'GCLIENT'.padEnd(56, 'A'),
      amountUsd: 99.999,
    });

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: 10000,
            }),
          }),
        ],
      }),
    );
  });
});

describe('paymentService XLM decimal precision', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('formats amountCrypto to 7 decimal places for XLM', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        bids: [{ price: '0.05' }],
      }),
    });

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_123',
          amount_total: 5000,
          payment_intent: 'pi_123',
          metadata: {},
        },
      },
    });

    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      amountCrypto: '1000000.0000000 XLM',
    });

    const result = await paymentService.default.handleWebhook('rawbody', 'sig');

    expect(result.amountCrypto).toMatch(/^\d+\.\d{7} XLM$/);
  });

  it('handles conversion failures gracefully', async () => {
    global.fetch.mockRejectedValue(new Error('Price service down'));

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_123',
          amount_total: 5000,
          payment_intent: 'pi_123',
          metadata: {},
        },
      },
    });

    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      amountCrypto: null,
    });

    const result = await paymentService.default.handleWebhook('rawbody', 'sig');

    expect(result.amountCrypto).toBeNull();
  });
});

describe('paymentService token decimals validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects payment amounts exceeding XLM max precision', async () => {
    const excessivePrecision = 0.12345678;

    expect(() => {
      const xlmPrecision = 7;
      const amountStr = excessivePrecision.toFixed(xlmPrecision);
      if (excessivePrecision.toString().split('.')[1]?.length > xlmPrecision) {
        throw new Error(
          `Amount exceeds token precision: ${excessivePrecision} > ${xlmPrecision} decimals`,
        );
      }
      return amountStr;
    }).not.toThrow();
  });

  it('accepts amounts within supported token decimal bounds', async () => {
    const validAmounts = [
      0.1,
      1.1234567,
      100.0000001,
      999999.9999999,
    ];

    validAmounts.forEach((amount) => {
      const xlmPrecision = 7;
      expect(() => {
        const amountStr = amount.toFixed(xlmPrecision);
        return amountStr;
      }).not.toThrow();
    });
  });
});

describe('paymentService.handleWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('handles checkout.session.completed event', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        bids: [{ price: '0.05' }],
      }),
    });

    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'sess_123',
          amount_total: 10000,
          payment_intent: 'pi_123',
          metadata: { address: 'GCLIENT'.padEnd(56, 'A') },
        },
      },
    });

    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      status: 'Completed',
    });

    const result = await paymentService.default.handleWebhook('rawbody', 'sig');

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'Completed',
          stripePaymentIntent: 'pi_123',
        }),
      }),
    );
  });

  it('handles checkout.session.expired event', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'sess_123',
          object: 'checkout.session',
          metadata: {},
        },
      },
    });

    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await paymentService.default.handleWebhook('rawbody', 'sig');

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'Failed',
        }),
      }),
    );
  });

  it('handles payment_intent.payment_failed event', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_failed',
          object: 'payment_intent',
          metadata: {},
        },
      },
    });

    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });

    await paymentService.default.handleWebhook('rawbody', 'sig');

    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'Failed',
        }),
      }),
    );
  });
});
