import { act, renderHook, waitFor } from '@testing-library/react';
import { useWalletSession } from '../useWalletSession';

type NetworkChangeHandler = (chainId: number | null) => Promise<void> | void;

const createMockWallet = () => {
  const listeners: NetworkChangeHandler[] = [];
  return {
    getChainId: jest.fn(async () => 1),
    onNetworkChange: jest.fn((handler: NetworkChangeHandler) => {
      listeners.push(handler);
      return () => {
        const index = listeners.indexOf(handler);
        if (index >= 0) listeners.splice(index, 1);
      };
    }),
    emitNetworkChange: async (chainId: number | null) => {
      for (const listener of [...listeners]) {
        await listener(chainId);
      }
    },
  };
};

describe('useWalletSession network changes', () => {
  it('resolves the primary success path and clears loading', async () => {
    const wallet = createMockWallet();
    const resolveSession = jest.fn(async (chainId: number) => ({ chainId, address: '0xabc' }));

    const { result } = renderHook(() =>
      useWalletSession({ wallet, resolveSession }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await wallet.emitNetworkChange(137);
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.networkStatus).toBe('ready');
    expect(result.current.session?.chainId).toBe(137);
    expect(resolveSession).toHaveBeenCalledWith(137);
  });

  it('exposes a loading state while a network change is resolving', async () => {
    const wallet = createMockWallet();
    let release: (value: { chainId: number; address: string }) => void = () => {};
    const resolveSession = jest.fn(
      () => new Promise<{ chainId: number; address: string }>((resolve) => {
        release = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useWalletSession({ wallet, resolveSession }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));

    let pending: Promise<void> | void;
    await act(async () => {
      pending = wallet.emitNetworkChange(10);
    });

    expect(result.current.networkStatus).toBe('loading');

    await act(async () => {
      release({ chainId: 10, address: '0xabc' });
      await pending;
    });

    await waitFor(() => expect(result.current.networkStatus).toBe('ready'));
  });

  it('renders an empty state when the wallet reports no chain', async () => {
    const wallet = createMockWallet();
    const resolveSession = jest.fn(async (chainId: number) => ({ chainId, address: '0xabc' }));

    const { result } = renderHook(() =>
      useWalletSession({ wallet, resolveSession }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await wallet.emitNetworkChange(null);
    });

    await waitFor(() => expect(result.current.networkStatus).toBe('empty'));
    expect(result.current.session).toBeNull();
    expect(resolveSession).not.toHaveBeenCalledWith(null);
  });

  it('surfaces a failure state and preserves prior session for recovery', async () => {
    const wallet = createMockWallet();
    const resolveSession = jest
      .fn()
      .mockResolvedValueOnce({ chainId: 1, address: '0xabc' })
      .mockRejectedValueOnce(new Error('rpc unavailable'));

    const { result } = renderHook(() =>
      useWalletSession({ wallet, resolveSession }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    const previousSession = result.current.session;

    await act(async () => {
      await wallet.emitNetworkChange(42161);
    });

    await waitFor(() => expect(result.current.networkStatus).toBe('error'));
    expect(result.current.networkError).toBe('rpc unavailable');
    expect(result.current.session).toEqual(previousSession);
  });

  it('recovers after a failure when the network change is retried', async () => {
    const wallet = createMockWallet();
    const resolveSession = jest
      .fn()
      .mockResolvedValueOnce({ chainId: 1, address: '0xabc' })
      .mockRejectedValueOnce(new Error('rpc unavailable'))
      .mockResolvedValueOnce({ chainId: 42161, address: '0xabc' });

    const { result } = renderHook(() =>
      useWalletSession({ wallet, resolveSession }),
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await wallet.emitNetworkChange(42161);
    });
    await waitFor(() => expect(result.current.networkStatus).toBe('error'));

    await act(async () => {
      await result.current.retryNetworkChange();
    });

    await waitFor(() => expect(result.current.networkStatus).toBe('ready'));
    expect(result.current.networkError).toBeNull();
    expect(result.current.session?.chainId).toBe(42161);
  });
});
