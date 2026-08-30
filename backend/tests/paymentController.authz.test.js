import { jest } from '@jest/globals';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;

const paymentServiceMock = {
  createCheckoutSession: jest.fn(),
  getBySessionId: jest.fn(),
  getByAddress: jest.fn(),
  getById: jest.fn(),
  refund: jest.fn(),
  handleWebhook: jest.fn(),
};

const kycServiceMock = {
  getStatus: jest.fn(),
};

const loggerMock = {
  getLogger: jest.fn(() => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() })),
  logControllerError: jest.fn(),
};

jest.unstable_mockModule('../services/paymentService.js', () => ({
  default: paymentServiceMock,
}));

jest.unstable_mockModule('../services/kycService.js', () => ({
  default: kycServiceMock,
}));

jest.unstable_mockModule('../config/logger.js', () => loggerMock);

const { default: paymentController } = await import('../api/controllers/paymentController.js');

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('paymentController authorization', () => {
  it('rejects checkout when the requested wallet does not match the JWT wallet', async () => {
    const req = {
      body: { address: ADDRESS_A, amountUsd: 10 },
      user: { address: ADDRESS_B },
    };
    const res = createMockRes();

    await paymentController.createCheckout(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(paymentServiceMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects payment status lookup for another wallet', async () => {
    const req = {
      params: { sessionId: 'sess_123' },
      user: { address: ADDRESS_A },
    };
    const res = createMockRes();

    paymentServiceMock.getBySessionId.mockResolvedValue({
      id: 'pay_123',
      address: ADDRESS_B,
      status: 'Completed',
    });

    await paymentController.getStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects refunds for payments owned by another wallet', async () => {
    const req = {
      params: { paymentId: 'pay_123' },
      user: { address: ADDRESS_A },
    };
    const res = createMockRes();

    paymentServiceMock.getById.mockResolvedValue({
      id: 'pay_123',
      address: ADDRESS_B,
      status: 'Completed',
    });

    await paymentController.refund(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(paymentServiceMock.refund).not.toHaveBeenCalled();
  });

  it('returns 404 when refund target payment does not exist', async () => {
    const req = {
      params: { paymentId: 'pay_missing' },
      user: { address: ADDRESS_A },
    };
    const res = createMockRes();

    paymentServiceMock.getById.mockResolvedValue(null);

    await paymentController.refund(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(paymentServiceMock.refund).not.toHaveBeenCalled();
  });
});

describe('paymentController.listByAddress empty state', () => {
  const baseReq = {
    params: { address: ADDRESS_A },
    user: { address: ADDRESS_A },
  };

  it('returns a friendly empty state when the wallet has no payments', async () => {
    paymentServiceMock.getByAddress.mockResolvedValue([]);
    const res = createMockRes();

    await paymentController.listByAddress(baseReq, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body.data).toEqual([]);
    expect(res.body.message).toMatch(/No payments found for this wallet yet/);
  });

  it('returns the payments in a data envelope when the list is non-empty', async () => {
    const payments = [
      { id: 'pay_1', escrowId: 'esc_1', status: 'Completed' },
      { id: 'pay_2', escrowId: 'esc_2', status: 'Pending' },
    ];
    paymentServiceMock.getByAddress.mockResolvedValue(payments);
    const res = createMockRes();

    await paymentController.listByAddress(baseReq, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.body.data).toEqual(payments);
    expect(res.body.message).toBeUndefined();
  });

  it('still rejects an empty state request for another wallets history', async () => {
    const req = {
      params: { address: ADDRESS_B },
      user: { address: ADDRESS_A },
    };
    const res = createMockRes();

    await paymentController.listByAddress(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(paymentServiceMock.getByAddress).not.toHaveBeenCalled();
  });
});
