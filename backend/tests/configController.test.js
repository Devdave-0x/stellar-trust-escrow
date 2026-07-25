import { jest } from '@jest/globals';

const configServiceMock = {
  getAll: jest.fn(),
  set: jest.fn(),
};

jest.unstable_mockModule('../services/configService.js', () => ({ default: configServiceMock }));

const { default: configController } = await import('../api/controllers/configController.js');

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('configController', () => {
  it('getAllConfig returns all entries', async () => {
    const entries = [{ key: 'platform_fee_percent', value: '1.5' }];
    configServiceMock.getAll.mockResolvedValue(entries);
    const req = {};
    const res = createMockRes();

    await configController.getAllConfig(req, res);

    expect(res.body).toEqual(entries);
  });

  it('updateConfig requires a value', async () => {
    const req = { params: { key: 'platform_fee_percent' }, body: {} };
    const res = createMockRes();

    await configController.updateConfig(req, res);

    expect(res.statusCode).toBe(400);
    expect(configServiceMock.set).not.toHaveBeenCalled();
  });

  it('updateConfig returns the updated entry', async () => {
    const updated = { key: 'platform_fee_percent', value: '2.5' };
    configServiceMock.set.mockResolvedValue(updated);
    const req = { params: { key: 'platform_fee_percent' }, body: { value: '2.5' } };
    const res = createMockRes();

    await configController.updateConfig(req, res);

    expect(configServiceMock.set).toHaveBeenCalledWith('platform_fee_percent', '2.5', 'admin');
    expect(res.body).toEqual(updated);
  });

  it('updateConfig returns 400 when the service rejects an invalid type', async () => {
    configServiceMock.set.mockRejectedValue(new Error('Value for "platform_fee_percent" must be a number.'));
    const req = { params: { key: 'platform_fee_percent' }, body: { value: 'nope' } };
    const res = createMockRes();

    await configController.updateConfig(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('updateConfig returns 404 for an unknown key', async () => {
    configServiceMock.set.mockRejectedValue(new Error('Unknown config key: bogus'));
    const req = { params: { key: 'bogus' }, body: { value: '1' } };
    const res = createMockRes();

    await configController.updateConfig(req, res);

    expect(res.statusCode).toBe(404);
  });
});
