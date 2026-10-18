import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWalletSession } from "./useWalletSession";

type ChainId = number;

interface MockWallet {
  chainId: ChainId;
  connected: boolean;
  switchChain: (chainId: ChainId) => Promise<void>;
  on: (event: string, handler: (payload: unknown) => void) => void;
  off: (event: string, handler: (payload: unknown) => void) => void;
}

const SUPPORTED_CHAINS: ChainId[] = [1, 137];

function createMockWallet(initialChainId: ChainId = 1): MockWallet {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const wallet: MockWallet = {
    chainId: initialChainId,
    connected: true,
    switchChain: vi.fn(async (chainId: ChainId) => {
      if (!SUPPORTED_CHAINS.includes(chainId)) {
        throw new Error("Unsupported chain");
      }
      wallet.chainId = chainId;
      listeners.get("chainChanged")?.forEach((handler) => handler(chainId));
    }),
    on: (event, handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    off: (event, handler) => {
      listeners.get(event)?.delete(handler);
    },
  };
  return wallet;
}

describe("useWalletSession network changes", () => {
  let wallet: MockWallet;

  beforeEach(() => {
    wallet = createMockWallet(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates the session chain on a successful network switch", async () => {
    const { result } = renderHook(() => useWalletSession({ wallet }));

    await waitFor(() => expect(result.current.chainId).toBe(1));

    await act(async () => {
      await result.current.switchNetwork(137);
    });

    expect(wallet.switchChain).toHaveBeenCalledWith(137);
    expect(result.current.chainId).toBe(137);
    expect(result.current.error).toBeNull();
  });

  it("surfaces an error and keeps the previous chain for unsupported networks", async () => {
    const { result } = renderHook(() => useWalletSession({ wallet }));

    await waitFor(() => expect(result.current.chainId).toBe(1));

    await act(async () => {
      await result.current.switchNetwork(9999);
    });

    expect(result.current.chainId).toBe(1);
    expect(result.current.error).toBe("Unsupported chain");
  });

  it("does not attempt a switch when the wallet is disconnected", async () => {
    wallet.connected = false;
    const { result } = renderHook(() => useWalletSession({ wallet }));

    await act(async () => {
      await result.current.switchNetwork(137);
    });

    expect(wallet.switchChain).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Wallet not connected");
  });

  it("settles on the last requested chain during rapid switching", async () => {
    const { result } = renderHook(() => useWalletSession({ wallet }));

    await waitFor(() => expect(result.current.chainId).toBe(1));

    await act(async () => {
      await Promise.all([
        result.current.switchNetwork(137),
        result.current.switchNetwork(1),
        result.current.switchNetwork(137),
      ]);
    });

    expect(result.current.chainId).toBe(137);
    expect(result.current.error).toBeNull();
  });
});
