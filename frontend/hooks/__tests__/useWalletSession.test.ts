import { act, renderHook, waitFor } from '@testing-library/react';
import { useWalletSession } from '../useWalletSession';

type WalletSessionOptions = Parameters<typeof useWalletSession>[0];

const createMockProvider = (overrides: Record<string, unknown> = {}) => ({
  request: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
  ...overrides,
});

const renderSession = (options: WalletSessionOptions) =>
  renderHook(() => useWalletSession(options));

describe('useWalletSession network changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies a supported network change on the primary success path', async () => {
    const provider = createMockProvider({
      request: jest.fn().mockResolvedValue(null),
    });

    const { result } = renderSession({
      provider,
      supportedChainIds: [1, 137],
      initialChainId: 1,
    });

    await act(async () => {
      await result.current.switchNetwork(137);
    });

    expect(provider.request).toHaveBeenCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x89' }],
    });
    await waitFor(() => expect(result.current.chainId).toBe(137));
    expect(result.current.error).toBeNull();
  });

  it('rejects an unsupported chain without calling the provider', async () => {
    const provider = createMockProvider({
      request: jest.fn().mockResolvedValue(null),
    });

    const { result } = renderSession({
      provider,
      supportedChainIds: [1, 137],
      initialChainId: 1,
    });

    await act(async () => {
      await result.current.switchNetwork(42161);
    });

    expect(provider.request).not.toHaveBeenCalled();
    expect(result.current.chainId).toBe(1);
    expect(result.current.error).toMatch(/unsupported/i);
  });

  it('rolls back optimistically when the wallet rejects the switch', async () => {
    const provider = createMockProvider({
      request: jest.fn().mockRejectedValue(new Error('User rejected request')),
    });

    const { result } = renderSession({
      provider,
      supportedChainIds: [1, 137],
      initialChainId: 1,
    });

    await act(async () => {
      await result.current.switchNetwork(137);
    });

    expect(result.current.chainId).toBe(1);
    expect(result.current.error).toMatch(/rejected/i);
  });

  it('ignores a network change when the wallet is disconnected', async () => {
    const provider = createMockProvider({
      request: jest.fn().mockResolvedValue(null),
    });

    const { result } = renderSession({
      provider: null,
      supportedChainIds: [1, 137],
      initialChainId: 1,
    });

    await act(async () => {
      await result.current.switchNetwork(137);
    });

    expect(provider.request).not.toHaveBeenCalled();
    expect(result.current.chainId).toBe(1);
    expect(result.current.error).toMatch(/disconnected/i);
  });

  it('settles on the last requested chain during rapid switching', async () => {
    const provider = createMockProvider({
      request: jest.fn().mockResolvedValue(null),
    });

    const { result } = renderSession({
      provider,
      supportedChainIds: [1, 137, 10],
      initialChainId: 1,
    });

    await act(async () => {
      await Promise.all([
        result.current.switchNetwork(137),
        result.current.switchNetwork(10),
      ]);
    });

    await waitFor(() => expect(result.current.chainId).toBe(10));
    expect(result.current.error).toBeNull();
  });
});
