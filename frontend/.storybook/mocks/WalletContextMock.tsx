import { WalletContext, type WalletState } from '../../components/providers/WalletContext';

/**
 * Mock WalletProvider used by Storybook to supply deterministic wallet state
 * to every story without requiring a real Freighter / Ledger extension.
 *
 * Components consume the shared `WalletContext` via `useWallet()`, so the real
 * app and the stories share the same contract.
 */

const FREIGHTER_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LEDGER_ADDRESS = 'GLEDGERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

export const disconnectedWallet: WalletState = {
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

export const connectingWallet: WalletState = {
  ...disconnectedWallet,
  isConnecting: true,
};

export const connectedFreighterWallet: WalletState = {
  ...disconnectedWallet,
  address: FREIGHTER_ADDRESS,
  isConnected: true,
  walletType: 'freighter',
  balance: '1250.50',
};

export const ledgerStepWallet: WalletState = {
  ...disconnectedWallet,
  address: LEDGER_ADDRESS,
  isConnected: true,
  isConnecting: true,
  walletType: 'ledger',
  balance: '840.00',
};

interface MockWalletProviderProps {
  children: React.ReactNode;
  state?: Partial<WalletState>;
}

export function MockWalletProvider({ children, state }: MockWalletProviderProps) {
  const value: WalletState = {
    ...connectedFreighterWallet,
    ...state,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
