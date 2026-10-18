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
  // Atomic set-if-not-exists with expiry, used for tenant context
  // idempotency guards. Returns 'OK' when the key was set, null when it
  // already existed (i.e. the effect was already applied).
  set: jest.fn().mockResolvedValue('OK'),
};

// Expose the shared client so tests can simulate optional dedup
// infrastructure being unavailable (e.g. connection refused) and assert
// graceful degradation without reaching into module internals.
export const __mockClient = mockClient;

export const createClient = jest.fn(() => mockClient);
