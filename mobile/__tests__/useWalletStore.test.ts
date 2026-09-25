const mockStore = new Map<string, string>();

jest.mock('../lib/storage', () => ({
  STORAGE_KEYS: { WALLET_ADDRESS: 'wallet_address', STELLAR_NETWORK: 'stellar_network' },
  storage: {
    set: (key: string, value: string) => mockStore.set(key, value),
    getString: (key: string) => mockStore.get(key),
    delete: (key: string) => mockStore.delete(key),
  },
}));

import { useWalletStore } from '../store/useWalletStore';
import { APP_NETWORK } from '../lib/networkMatch';

const ADDRESS = `G${'A'.repeat(55)}`;

beforeEach(() => {
  mockStore.clear();
  useWalletStore.setState({ address: null, walletNetwork: null, isConnected: false });
});

describe('useWalletStore network tracking', () => {
  it('records the network the wallet was connected on', () => {
    useWalletStore.getState().setAddress(ADDRESS);

    expect(useWalletStore.getState().walletNetwork).toBe(APP_NETWORK);
    expect(mockStore.get('stellar_network')).toBe(APP_NETWORK);
  });

  it('restores the recorded network after a restart', () => {
    mockStore.set('wallet_address', ADDRESS);
    mockStore.set('stellar_network', 'mainnet');

    useWalletStore.getState().hydrate();

    expect(useWalletStore.getState().walletNetwork).toBe('mainnet');
  });

  it('treats a session saved before the network was recorded as unknown', () => {
    mockStore.set('wallet_address', ADDRESS);

    useWalletStore.getState().hydrate();

    expect(useWalletStore.getState().walletNetwork).toBeNull();
  });

  it('forgets the network on disconnect', () => {
    useWalletStore.getState().setAddress(ADDRESS);
    useWalletStore.getState().disconnect();

    expect(useWalletStore.getState().walletNetwork).toBeNull();
    expect(mockStore.has('stellar_network')).toBe(false);
  });
});
