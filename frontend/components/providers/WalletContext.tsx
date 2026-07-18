'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type WalletType = 'freighter' | 'ledger' | 'none';

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletType: WalletType;
  balance: string | null;
  network: 'testnet' | 'mainnet';
  error: string | null;
  connect: (type?: WalletType) => Promise<void>;
  disconnect: () => void;
  setConnecting: (value: boolean) => void;
}

const DEFAULT_STATE: WalletState = {
  address: null,
  isConnected: false,
  isConnecting: false,
  walletType: 'none',
  balance: null,
  network: 'testnet',
  error: null,
  connect: async () => {},
  disconnect: () => {},
  setConnecting: () => {},
};

export const WalletContext = createContext<WalletState>(DEFAULT_STATE);

export function useWallet(): WalletState {
  return useContext(WalletContext);
}

interface WalletProviderProps {
  children: ReactNode;
  /** Override the initial mock state (used by Storybook). */
  initialState?: Partial<WalletState>;
  network?: 'testnet' | 'mainnet';
}

const MOCK_ADDRESSES: Record<Exclude<WalletType, 'none'>, string> = {
  freighter: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ledger: 'GLEDGERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
};

export function WalletProvider({
  children,
  initialState,
  network = 'testnet',
}: WalletProviderProps) {
  const [address, setAddress] = useState<string | null>(initialState?.address ?? null);
  const [isConnected, setIsConnected] = useState<boolean>(initialState?.isConnected ?? false);
  const [isConnecting, setIsConnecting] = useState<boolean>(initialState?.isConnecting ?? false);
  const [walletType, setWalletType] = useState<WalletType>(initialState?.walletType ?? 'none');
  const [balance, setBalance] = useState<string | null>(initialState?.balance ?? null);
  const [error, setError] = useState<string | null>(initialState?.error ?? null);

  useEffect(() => {
    if (isConnected && address) {
      setBalance(initialState?.balance ?? '1250.50');
    } else {
      setBalance(null);
    }
  }, [isConnected, address, initialState?.balance]);

  const connect = useCallback(async (type: WalletType = 'freighter') => {
    setIsConnecting(true);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      setWalletType(type);
      setAddress(MOCK_ADDRESSES[type as Exclude<WalletType, 'none'>] ?? MOCK_ADDRESSES.freighter);
      setIsConnected(true);
    } catch {
      setError('Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
    setWalletType('none');
    setBalance(null);
    setError(null);
  }, []);

  const setConnecting = useCallback((value: boolean) => setIsConnecting(value), []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      isConnected,
      isConnecting,
      walletType,
      balance,
      network,
      error,
      connect,
      disconnect,
      setConnecting,
    }),
    [
      address,
      isConnected,
      isConnecting,
      walletType,
      balance,
      network,
      error,
      connect,
      disconnect,
      setConnecting,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
