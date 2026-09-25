/**
 * Escrow data hooks using React Query.
 * Falls back to SQLite offline cache when network is unavailable.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { escrowApi, systemApi, userApi, type Escrow, type Milestone } from '../lib/api';
import { assertNetworkMatch } from '../lib/networkMatch';
import { submitSignedTransaction } from '../services/txRetryRunner';
import { useWalletStore } from '../store/useWalletStore';
import {
  cacheEscrow,
  getCachedEscrowEntry,
  getCachedEscrows,
  cacheMilestones,
  getCachedMilestones,
  type CachedEntry,
} from '../services/offlineCache';

// Exponential backoff: 500ms, 1000ms, capped at 10s
const RETRY_BASE_DELAY_MS = 500;
const retryDelay = (attempt: number) => Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, 10_000);

// === Escrow detail with cache fallback

/** Where the escrow shown on screen came from. */
export type EscrowSource = 'network' | 'cache';

/** Why cached data is being shown instead of a fresh copy. */
export type StaleReason = 'offline' | 'fetch-failed';

export interface EscrowResult {
  escrow: Escrow;
  source: EscrowSource;
  /** When the data was last fetched from the API (ms since epoch). */
  syncedAt: number;
  /** Set only when `source` is `cache`. */
  staleReason?: StaleReason;
}

export interface EscrowLoaders {
  isOnline: () => Promise<boolean>;
  fetchEscrow: (id: string) => Promise<Escrow>;
  readCache: (id: string) => CachedEntry | null;
  writeCache: (escrow: Escrow) => void;
  now: () => number;
}

const defaultEscrowLoaders: EscrowLoaders = {
  isOnline: async () => (await NetInfo.fetch()).isConnected === true,
  fetchEscrow: async (id) => (await escrowApi.get(id)).data,
  readCache: getCachedEscrowEntry,
  writeCache: (escrow) => cacheEscrow(escrow as unknown as Record<string, unknown>),
  now: Date.now,
};

/**
 * Load an escrow from the API, falling back to the offline cache when the
 * device is offline or the request fails. The result says which one was used
 * and when the data was last synced, so the screen can flag stale data.
 * Throws only when neither the API nor the cache can provide the escrow.
 */
export async function loadEscrowWithFallback(
  id: string,
  loaders: EscrowLoaders = defaultEscrowLoaders,
): Promise<EscrowResult> {
  const fromCache = (staleReason: StaleReason): EscrowResult | null => {
    const entry = loaders.readCache(id);
    if (!entry) return null;
    return {
      escrow: entry.record as unknown as Escrow,
      source: 'cache',
      syncedAt: entry.cachedAt,
      staleReason,
    };
  };

  if (!(await loaders.isOnline())) {
    const cached = fromCache('offline');
    if (cached) return cached;
    throw new Error('No network connection and no cached data.');
  }

  try {
    const escrow = await loaders.fetchEscrow(id);
    loaders.writeCache(escrow);
    return { escrow, source: 'network', syncedAt: loaders.now() };
  } catch (err) {
    const cached = fromCache('fetch-failed');
    if (cached) return cached;
    throw err;
  }
}

export function useEscrow(id: string | null) {
  return useQuery({
    queryKey: ['escrow', id],
    queryFn: () => loadEscrowWithFallback(id!),
    enabled: !!id,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 2,
    retryDelay,
  });
}

export function useEscrowList(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['escrows', params],
    queryFn: async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        const status = params?.status as string | undefined;
        const limit = typeof params?.limit === 'number' ? params.limit : 20;
        const offset = typeof params?.offset === 'number' ? params.offset : 0;

        let offline = getCachedEscrows() as unknown as Escrow[];
        if (status) {
          offline = offline.filter((e) => e.status === status);
        }
        const paged = offline.slice(offset, offset + limit);

        return {
          data: paged,
          total: offline.length,
          page: Math.floor(offset / limit) + 1,
          limit,
          totalPages: Math.max(1, Math.ceil(offline.length / limit)),
          hasNextPage: offset + limit < offline.length,
          hasPreviousPage: offset > 0,
        };
      }
      const { data } = await escrowApi.list(params);
      data.data.forEach((e) => cacheEscrow(e as unknown as Record<string, unknown>));
      return data;
    },
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 2,
    retryDelay,
    refetchOnWindowFocus: false,
  });
}

export function useUserEscrows(address: string | null, role?: string) {
  return useQuery({
    queryKey: ['user-escrows', address, role],
    queryFn: async () => {
      const { data } = await userApi.getEscrows(address!, role ? { role } : undefined);
      return data;
    },
    enabled: !!address,
    staleTime: 15_000,
  });
}

export function useMilestones(escrowId: string | null) {
  return useQuery({
    queryKey: ['milestones', escrowId],
    queryFn: async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        return getCachedMilestones(escrowId!) as unknown as Milestone[];
      }
      const { data } = await escrowApi.getMilestones(escrowId!);
      cacheMilestones(escrowId!, data.data as unknown as Record<string, unknown>[]);
      return data.data;
    },
    enabled: !!escrowId,
    staleTime: 10_000,
  });
}

export function useBroadcastEscrow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (signedXdr: string) => {
      // Refuse to submit a transaction for the wrong network (#638).
      await assertNetworkMatch({
        getWalletNetwork: () => useWalletStore.getState().walletNetwork,
        fetchApiNetwork: systemApi.apiNetwork,
      });
      // Queued for retry if the API is unreachable (#639).
      return submitSignedTransaction(signedXdr);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escrows'] });
    },
  });
}
