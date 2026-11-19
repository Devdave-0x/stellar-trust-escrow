/**
 * Wallet Store (Zustand)
 *
 * Holds the connected Stellar address and network.
 * Persisted to MMKV so the session survives app restarts.
 *
 * Wallet-scoped state (profile, reputation, cached queries) is cleared
 * whenever the active address changes so stale account data never leaks
 * across account switches.
 */

import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';
import { isValidStellarAddress } from '../lib/stellar';

export interface WalletProfile {
  address: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface WalletReputation {
  address: string;
  score: number;
  updatedAt: number;
}

interface WalletState {
  address: string | null;
  network: 'testnet' | 'mainnet';
  isConnected: boolean;
  profile: WalletProfile | null;
  reputation: WalletReputation | null;
  /** Incremented on every address change; used to invalidate in-flight queries. */
  queryEpoch: number;
  setAddress: (address: string) => void;
  disconnect: () => void;
  hydrate: () => void;
  setProfile: (profile: WalletProfile | null) => void;
  setReputation: (reputation: WalletReputation | null) => void;
  clearWalletScopedState: () => void;
  /**
   * Returns true when `address` matches the currently active address.
   * Use to guard actions so they cannot run with stale account context.
   */
  isActiveAddress: (address: string | null | undefined) => boolean;
  /**
   * Runs `action` only if `address` matches the active address.
   * Throws otherwise so stale actions are rejected.
   */
  runForActiveAddress: <T>(address: string | null | undefined, action: () => T) => T;
}

const initialWalletScopedState = {
  profile: null as WalletProfile | null,
  reputation: null as WalletReputation | null,
};

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  network: (process.env.EXPO_PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
  isConnected: false,
  ...initialWalletScopedState,
  queryEpoch: 0,

  setAddress: (address: string) => {
    if (!isValidStellarAddress(address)) {
      throw new Error('Invalid Stellar address');
    }
    const previous = get().address;
    storage.set(STORAGE_KEYS.WALLET_ADDRESS, address);
    if (previous === address) {
      set({ address, isConnected: true });
      return;
    }
    // Address changed: reset wallet-scoped state and bump the query epoch so
    // any in-flight queries for the previous account are invalidated.
    set((state) => ({
      address,
      isConnected: true,
      ...initialWalletScopedState,
      queryEpoch: state.queryEpoch + 1,
    }));
  },

  disconnect: () => {
    storage.delete(STORAGE_KEYS.WALLET_ADDRESS);
    set((state) => ({
      address: null,
      isConnected: false,
      ...initialWalletScopedState,
      queryEpoch: state.queryEpoch + 1,
    }));
  },

  hydrate: () => {
    const saved = storage.getString(STORAGE_KEYS.WALLET_ADDRESS);
    if (saved && isValidStellarAddress(saved)) {
      const previous = get().address;
      if (previous === saved) {
        set({ address: saved, isConnected: true });
        return;
      }
      set((state) => ({
        address: saved,
        isConnected: true,
        ...initialWalletScopedState,
        queryEpoch: state.queryEpoch + 1,
      }));
    }
  },

  setProfile: (profile: WalletProfile | null) => {
    if (profile && profile.address !== get().address) {
      // Ignore profile data that does not belong to the active account.
      return;
    }
    set({ profile });
  },

  setReputation: (reputation: WalletReputation | null) => {
    if (reputation && reputation.address !== get().address) {
      // Ignore reputation data that does not belong to the active account.
      return;
    }
    set({ reputation });
  },

  clearWalletScopedState: () => {
    set((state) => ({
      ...initialWalletScopedState,
      queryEpoch: state.queryEpoch + 1,
    }));
  },

  isActiveAddress: (address: string | null | undefined) => {
    const active = get().address;
    return !!active && !!address && active === address;
  },

  runForActiveAddress: <T>(address: string | null | undefined, action: () => T): T => {
    if (!get().isActiveAddress(address)) {
      throw new Error('Action rejected: address is not the active account');
    }
    return action();
  },
}));