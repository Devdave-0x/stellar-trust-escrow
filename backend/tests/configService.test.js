import { jest } from '@jest/globals';

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
};

const prismaMock = {
  systemConfig: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: configService } = await import('../services/configService.js');

beforeEach(() => {
  jest.clearAllMocks();
  cacheMock.get.mockResolvedValue(null);
});

describe('configService.get', () => {
  it('reads through to the DB on a cache miss and casts numbers', async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({
      key: 'platform_fee_percent',
      value: '1.5',
    });

    const value = await configService.get('platform_fee_percent');

    expect(value).toBe(1.5);
    expect(cacheMock.set).toHaveBeenCalledWith(
      'system-config:platform_fee_percent',
      { value: 1.5 },
      30,
    );
  });

  it('casts booleans', async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({
      key: 'maintenance_mode',
      value: 'false',
    });

    const value = await configService.get('maintenance_mode');

    expect(value).toBe(false);
  });

  it('returns the cached value without hitting the DB', async () => {
    cacheMock.get.mockResolvedValue({ value: 2.0 });

    const value = await configService.get('platform_fee_percent');

    expect(value).toBe(2.0);
    expect(prismaMock.systemConfig.findUnique).not.toHaveBeenCalled();
  });
});

describe('configService.set', () => {
  it('updates a valid value and invalidates the cache', async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({ key: 'platform_fee_percent', value: '1.5' });
    const updated = { key: 'platform_fee_percent', value: '2.5', updatedBy: 'admin' };
    prismaMock.systemConfig.update.mockResolvedValue(updated);

    const result = await configService.set('platform_fee_percent', '2.5', 'admin');

    expect(result).toEqual(updated);
    expect(cacheMock.invalidate).toHaveBeenCalledWith('system-config:platform_fee_percent');
  });

  it('rejects an invalid type for a known key', async () => {
    await expect(configService.set('platform_fee_percent', 'not-a-number', 'admin')).rejects.toThrow(
      'must be a number',
    );
    expect(prismaMock.systemConfig.update).not.toHaveBeenCalled();
  });

  it('rejects an invalid boolean value', async () => {
    prismaMock.systemConfig.findUnique.mockResolvedValue({ key: 'maintenance_mode', value: 'false' });
    await expect(configService.set('maintenance_mode', 'yes', 'admin')).rejects.toThrow('must be a boolean');
  });

  it('rejects an unknown config key', async () => {
    await expect(configService.set('not_a_real_key', '1', 'admin')).rejects.toThrow('Unknown config key');
  });
});
