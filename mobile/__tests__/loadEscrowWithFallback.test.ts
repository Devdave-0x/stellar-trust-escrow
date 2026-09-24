// The hook module imports the API client, NetInfo and the SQLite cache at load
// time; stub them so the pure fallback logic can be tested with injected loaders.
jest.mock('../lib/api', () => ({ escrowApi: {}, userApi: {} }));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn() }));
jest.mock('../services/offlineCache', () => ({}));

import { loadEscrowWithFallback, type EscrowLoaders } from '../hooks/useEscrows';
import type { Escrow } from '../lib/api';

const NOW = 1_700_000_000_000;
const CACHED_AT = NOW - 5 * 60_000;

const freshEscrow = { id: '42', status: 'Active' } as unknown as Escrow;
const cachedRecord = { id: '42', status: 'Disputed' };

function loaders(overrides: Partial<EscrowLoaders> = {}): EscrowLoaders {
  return {
    isOnline: jest.fn().mockResolvedValue(true),
    fetchEscrow: jest.fn().mockResolvedValue(freshEscrow),
    readCache: jest.fn().mockReturnValue({ record: cachedRecord, cachedAt: CACHED_AT }),
    writeCache: jest.fn(),
    now: () => NOW,
    ...overrides,
  };
}

describe('loadEscrowWithFallback', () => {
  it('returns fresh data from the API and caches it', async () => {
    const deps = loaders();

    const result = await loadEscrowWithFallback('42', deps);

    expect(result).toEqual({ escrow: freshEscrow, source: 'network', syncedAt: NOW });
    expect(deps.writeCache).toHaveBeenCalledWith(freshEscrow);
    expect(deps.readCache).not.toHaveBeenCalled();
  });

  it('serves cached data marked offline when there is no connection', async () => {
    const deps = loaders({ isOnline: jest.fn().mockResolvedValue(false) });

    const result = await loadEscrowWithFallback('42', deps);

    expect(result).toEqual({
      escrow: cachedRecord,
      source: 'cache',
      syncedAt: CACHED_AT,
      staleReason: 'offline',
    });
    expect(deps.fetchEscrow).not.toHaveBeenCalled();
  });

  it('serves cached data marked fetch-failed when the request fails', async () => {
    const deps = loaders({ fetchEscrow: jest.fn().mockRejectedValue(new Error('503')) });

    const result = await loadEscrowWithFallback('42', deps);

    expect(result.source).toBe('cache');
    expect(result.staleReason).toBe('fetch-failed');
    expect(result.syncedAt).toBe(CACHED_AT);
    expect(deps.writeCache).not.toHaveBeenCalled();
  });

  it('throws when offline with nothing cached', async () => {
    const deps = loaders({
      isOnline: jest.fn().mockResolvedValue(false),
      readCache: jest.fn().mockReturnValue(null),
    });

    await expect(loadEscrowWithFallback('42', deps)).rejects.toThrow(
      'No network connection and no cached data.',
    );
  });

  it('rethrows the request error when nothing is cached', async () => {
    const error = new Error('503');
    const deps = loaders({
      fetchEscrow: jest.fn().mockRejectedValue(error),
      readCache: jest.fn().mockReturnValue(null),
    });

    await expect(loadEscrowWithFallback('42', deps)).rejects.toBe(error);
  });
});
