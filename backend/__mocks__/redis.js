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
  // Atomic set-if-not-exists used for webhook delivery deduplication.
  // Returns 'OK' when the key was set, null when it already existed.
  setNX: jest.fn().mockResolvedValue('OK'),
  // Atomic compare-and-delete used to release a dedup lock only if owned.
  eval: jest.fn().mockResolvedValue(1),
};

export const createClient = jest.fn(() => mockClient);
