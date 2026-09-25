import {
  assertNetworkMatch,
  checkNetworkMatch,
  NetworkMismatchError,
  parseNetwork,
} from '../lib/networkMatch';

describe('checkNetworkMatch', () => {
  it('passes when wallet, app and API agree', () => {
    expect(
      checkNetworkMatch({ walletNetwork: 'testnet', appNetwork: 'testnet', apiNetwork: 'testnet' }),
    ).toEqual({ ok: true });
  });

  it('never blocks on unknown values', () => {
    expect(
      checkNetworkMatch({ walletNetwork: null, appNetwork: 'mainnet', apiNetwork: null }),
    ).toEqual({ ok: true });
  });

  it('flags a wallet connected on another network, naming the expected one', () => {
    const match = checkNetworkMatch({
      walletNetwork: 'testnet',
      appNetwork: 'mainnet',
      apiNetwork: 'mainnet',
    });
    expect(match).toMatchObject({ ok: false, expected: 'mainnet', source: 'wallet' });
    expect(!match.ok && match.message).toContain('Reconnect your wallet on Mainnet');
  });

  it('flags an API serving another network', () => {
    const match = checkNetworkMatch({
      walletNetwork: 'mainnet',
      appNetwork: 'mainnet',
      apiNetwork: 'testnet',
    });
    expect(match).toMatchObject({ ok: false, expected: 'mainnet', source: 'api' });
  });
});

describe('parseNetwork', () => {
  it('accepts only known networks', () => {
    expect(parseNetwork('mainnet')).toBe('mainnet');
    expect(parseNetwork('testnet')).toBe('testnet');
    expect(parseNetwork('futurenet')).toBeNull();
    expect(parseNetwork(undefined)).toBeNull();
  });
});

describe('assertNetworkMatch', () => {
  it('throws NetworkMismatchError before submission on a mismatch', async () => {
    const check = assertNetworkMatch({
      getWalletNetwork: () => 'testnet',
      fetchApiNetwork: async () => 'mainnet',
      appNetwork: 'mainnet',
    });
    await expect(check).rejects.toBeInstanceOf(NetworkMismatchError);
    await expect(check).rejects.toMatchObject({ expected: 'mainnet' });
  });

  it('checks the wallet alone when the API network cannot be fetched', async () => {
    await expect(
      assertNetworkMatch({
        getWalletNetwork: () => 'mainnet',
        fetchApiNetwork: async () => {
          throw new Error('offline');
        },
        appNetwork: 'mainnet',
      }),
    ).resolves.toBeUndefined();
  });
});
