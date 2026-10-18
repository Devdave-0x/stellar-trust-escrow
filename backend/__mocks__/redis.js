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

export const createClient = jest.fn(() => mockClient);
