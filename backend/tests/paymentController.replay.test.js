import { jest } from '@jest/globals';

const ADDRESS = `G${'A'.repeat(55)}`;
const metricsMock = { paymentCheckoutReplayTotal: { inc: jest.fn() } };
const loggerMock = { info: jest.fn(), warn: jest.fn() };
const paymentServiceMock = { createCheckoutSession: jest.fn() };
const kycServiceMock = { getStatus: jest.fn() };

jest.unstable_mockModule('../config/logger.js', () => ({
  getLogger: () => loggerMock,
  logControllerError: jest.fn(),
}));
jest.unstable_mockModule('../lib/metrics.js', () => metricsMock);
jest.unstable_mockModule('../services/paymentService.js', () => ({ default: paymentServiceMock }));
jest.unstable_mockModule('../services/kycService.js', () => ({ default: kycServiceMock }));

const { default: paymentController, __resetCheckoutIdempotencyForTest } =
  await import('../api/controllers/paymentController.js');

function request(options = {}) {
  const amountUsd = options.amountUsd ?? 10;
  const idempotencyKey = Object.prototype.hasOwnProperty.call(options, 'idempotencyKey')
    ? options.idempotencyKey
    : 'retry-key-0001';
  return {
    body: { address: ADDRESS, amountUsd, escrowId: '42' },
    user: { address: ADDRESS },
    headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : {},
    id: 'request-correlation-id',
  };
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status: jest.fn().mockImplementation(function setStatus(code) {
      this.statusCode = code;
      return this;
    }),
    setHeader: jest.fn(),
    json: jest.fn().mockImplementation(function setJson(body) {
      this.body = body;
      return this;
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCheckoutIdempotencyForTest();
  kycServiceMock.getStatus.mockResolvedValue({ status: 'Approved' });
  paymentServiceMock.createCheckoutSession.mockResolvedValue({
    paymentId: 'payment-1',
    sessionId: 'session-1',
    url: 'https://checkout.example.test/session-1',
  });
});

describe('payment checkout replay protection', () => {
  it('creates one checkout for overlapping identical requests and replays the result', async () => {
    const first = response();
    const second = response();

    await Promise.all([
      paymentController.createCheckout(request(), first),
      paymentController.createCheckout(request(), second),
    ]);

    expect(paymentServiceMock.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(first.body).toEqual(second.body);
    expect(second.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
    expect(metricsMock.paymentCheckoutReplayTotal.inc).toHaveBeenCalledWith({ outcome: 'in_flight' });
    expect(JSON.stringify(loggerMock.info.mock.calls)).not.toContain('retry-key-0001');
  });

  it('rejects reuse of a key with a different request fingerprint', async () => {
    await paymentController.createCheckout(request(), response());
    const conflicting = response();

    await paymentController.createCheckout(request({ amountUsd: 20 }), conflicting);

    expect(conflicting.statusCode).toBe(409);
    expect(paymentServiceMock.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(metricsMock.paymentCheckoutReplayTotal.inc).toHaveBeenCalledWith({ outcome: 'conflict' });
  });

  it('rejects a missing key before KYC or payment processing', async () => {
    const res = response();
    await paymentController.createCheckout(request({ idempotencyKey: undefined }), res);

    expect(res.statusCode).toBe(400);
    expect(kycServiceMock.getStatus).not.toHaveBeenCalled();
    expect(paymentServiceMock.createCheckoutSession).not.toHaveBeenCalled();
    expect(metricsMock.paymentCheckoutReplayTotal.inc).toHaveBeenCalledWith({ outcome: 'rejected' });
  });
});
