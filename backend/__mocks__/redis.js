// Manual mock for the 'redis' package.
import { jest } from '@jest/globals';

const mockClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  keys: jest.fn().mockResolvedValue([]),
  expire: jest.fn().mockResolvedValue(1),
  sAdd: jest.fn().mockResolvedValue(1),
  sMembers: jest.fn().mockResolvedValue([]),
  scan: jest.fn().mockResolvedValue({ cursor: 0, keys: [] }),
  on: jest.fn(),
  // Idempotency primitives used by oracle price ingestion.
  setNX: jest.fn().mockResolvedValue(true),
  exists: jest.fn().mockResolvedValue(0),
  multi: jest.fn(() => ({
    set: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  })),
};

// Reset every mock (including per-call `multi()` chains) so concurrency tests
// start from a deterministic state between overlapping-worker scenarios.
export const resetRedisMock = () => {
  for (const value of Object.values(mockClient)) {
    if (value && typeof value.mockClear === 'function') {
      value.mockClear();
    }
  }
  mockClient.setNX.mockResolvedValue(true);
  mockClient.exists.mockResolvedValue(0);
  mockClient.get.mockResolvedValue(null);
  mockClient.set.mockResolvedValue('OK');
  mockClient.del.mockResolvedValue(1);
};

export const createClient = jest.fn(() => mockClient);
