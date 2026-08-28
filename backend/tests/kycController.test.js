import { jest } from '@jest/globals';

const kycServiceMock = {
  generateSdkToken: jest.fn(),
  getStatus: jest.fn(),
  verifyWebhookSignature: jest.fn(),
  handleWebhook: jest.fn(),
  listAll: jest.fn(),
};

jest.unstable_mockModule('../services/kycService.js', () => ({ default: kycServiceMock }));

const { default: kycController } = await import('../api/controllers/kycController.js');

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

describe('kycController.getStatus', () => {
  it('returns 400 (not a 500) when the address param is missing/undefined', async () => {
    const req = { params: {} };
    const res = createMockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid Stellar address' });
    expect(kycServiceMock.getStatus).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed address', async () => {
    const req = { params: { address: 'not-a-valid-address' } };
    const res = createMockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('resolves a null record from the service to a Pending status, not an error', async () => {
    const address = `G${'A'.repeat(55)}`;
    kycServiceMock.getStatus.mockResolvedValue(null);
    const req = { params: { address } };
    const res = createMockRes();

    await kycController.getStatus(req, res);

    expect(res.json).toHaveBeenCalledWith({ address, status: 'Pending' });
  });
});

describe('kycController.getToken', () => {
  it('returns 400 when address is missing from the body', async () => {
    const req = { body: {} };
    const res = createMockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(400);
    expect(kycServiceMock.generateSdkToken).not.toHaveBeenCalled();
  });
});
