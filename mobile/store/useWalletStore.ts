/**
 * Wallet Store (Zustand)
 *
 * Holds the connected Stellar address and network.
 * Persisted to MMKV so the session survives app restarts.
 */

import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';
import { isValidStellarAddress } from '../lib/stellar';
import { APP_NETWORK, parseNetwork, type StellarNetwork } from '../lib/networkMatch';

interface WalletState {
  address: string | null;
  network: 'testnet' | 'mainnet';
  /**
   * Network the wallet was connected on, or null for sessions saved before
   * this was recorded. Compared with `network` to detect a mismatch.
   */
  walletNetwork: StellarNetwork | null;
  isConnected: boolean;
  setAddress: (address: string) => void;
  disconnect: () => void;
  hydrate: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  network: (process.env.EXPO_PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
  walletNetwork: null,
  isConnected: false,

  setAddress: (address: string) => {
    if (!isValidStellarAddress(address)) {
      throw new Error('Invalid Stellar address');
    }
    storage.set(STORAGE_KEYS.WALLET_ADDRESS, address);
    storage.set(STORAGE_KEYS.STELLAR_NETWORK, APP_NETWORK);
    set({ address, walletNetwork: APP_NETWORK, isConnected: true });
  },

  disconnect: () => {
    storage.delete(STORAGE_KEYS.WALLET_ADDRESS);
    storage.delete(STORAGE_KEYS.STELLAR_NETWORK);
    set({ address: null, walletNetwork: null, isConnected: false });
  },

  hydrate: () => {
    const saved = storage.getString(STORAGE_KEYS.WALLET_ADDRESS);
    if (saved && isValidStellarAddress(saved)) {
      const walletNetwork = parseNetwork(storage.getString(STORAGE_KEYS.STELLAR_NETWORK));
      set({ address: saved, walletNetwork, isConnected: true });
    }
  },
}));
