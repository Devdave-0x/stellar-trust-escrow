import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useWalletSession } from "./useWalletSession";

type ChainId = number;
type Role = "admin" | "operator" | "viewer";
type EscrowState = "funded" | "released" | "disputed" | "closed";

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

  describe("recovery-safe optimistic updates", () => {
    it("applies the optimistic chain immediately before the switch resolves", async () => {
      let resolveSwitch: () => void = () => {};
      wallet.switchChain = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSwitch = resolve;
          }),
      );

      const { result } = renderHook(() => useWalletSession({ wallet }));
      await waitFor(() => expect(result.current.chainId).toBe(1));

      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.switchNetwork(137);
      });

      await waitFor(() => expect(result.current.chainId).toBe(137));

      await act(async () => {
        resolveSwitch();
        await pending;
      });

      expect(result.current.chainId).toBe(137);
      expect(result.current.error).toBeNull();
    });

    it("rolls back to the previous chain when the switch is rejected", async () => {
      wallet.switchChain = vi.fn(async () => {
        throw new Error("User rejected the request");
      });

      const { result } = renderHook(() => useWalletSession({ wallet }));
      await waitFor(() => expect(result.current.chainId).toBe(1));

      await act(async () => {
        await result.current.switchNetwork(137);
      });

      expect(result.current.chainId).toBe(1);
      expect(result.current.error).toBe("User rejected the request");
    });

    it("does not clobber a newer server chain update when a switch fails", async () => {
      let rejectSwitch: (reason: Error) => void = () => {};
      wallet.switchChain = vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSwitch = reject;
          }),
      );

      const { result, rerender } = renderHook(
        ({ serverChainId }: { serverChainId: ChainId }) =>
          useWalletSession({ wallet, serverChainId }),
        { initialProps: { serverChainId: 1 } },
      );
      await waitFor(() => expect(result.current.chainId).toBe(1));

      let pending: Promise<void> = Promise.resolve();
      act(() => {
        pending = result.current.switchNetwork(137);
      });
      await waitFor(() => expect(result.current.chainId).toBe(137));

      // A newer authoritative server update arrives while the switch is in flight.
      rerender({ serverChainId: 137 });
      await waitFor(() => expect(result.current.chainId).toBe(137));

      await act(async () => {
        rejectSwitch(new Error("User rejected the request"));
        await pending;
      });

      expect(result.current.chainId).toBe(137);
      expect(result.current.error).toBe("User rejected the request");
    });

    it("rolls back to the server chain when there is no active session", async () => {
      wallet.switchChain = vi.fn(async () => {
        throw new Error("User rejected the request");
      });

      const { result } = renderHook(() =>
        useWalletSession({ wallet, serverChainId: 137 }),
      );
      await waitFor(() => expect(result.current.chainId).toBe(137));

      await act(async () => {
        await result.current.switchNetwork(1);
      });

      expect(result.current.chainId).toBe(137);
      expect(result.current.error).toBe("User rejected the request");
    });
  });

  describe("permission-aware action gating", () => {
    function renderWithAccess(role: Role, escrowState: EscrowState) {
      return renderHook(() =>
        useWalletSession({ wallet, role, escrowState }),
      );
    }

    it("allows the network change for an authorized role in an actionable escrow state", async () => {
      const { result } = renderWithAccess("operator", "funded");

      await waitFor(() => expect(result.current.chainId).toBe(1));
      expect(result.current.canChangeNetwork).toBe(true);

      await act(async () => {
        await result.current.switchNetwork(137);
      });

      expect(wallet.switchChain).toHaveBeenCalledWith(137);
      expect(result.current.chainId).toBe(137);
      expect(result.current.error).toBeNull();
    });

    it("blocks the network change for a role without permission", async () => {
      const { result } = renderWithAccess("viewer", "funded");

      await waitFor(() => expect(result.current.chainId).toBe(1));
      expect(result.current.canChangeNetwork).toBe(false);

      await act(async () => {
        await result.current.switchNetwork(137);
      });

      expect(wallet.switchChain).not.toHaveBeenCalled();
      expect(result.current.chainId).toBe(1);
      expect(result.current.error).toBe("Insufficient permissions");
    });

    it("blocks the network change when the escrow state is not actionable", async () => {
      const { result } = renderWithAccess("admin", "closed");

      await waitFor(() => expect(result.current.chainId).toBe(1));
      expect(result.current.canChangeNetwork).toBe(false);

      await act(async () => {
        await result.current.switchNetwork(137);
      });

      expect(wallet.switchChain).not.toHaveBeenCalled();
      expect(result.current.chainId).toBe(1);
      expect(result.current.error).toBe("Escrow state does not allow network changes");
    });

    it("blocks the network change when the wallet is disconnected even with permission", async () => {
      wallet.connected = false;
      const { result } = renderWithAccess("admin", "funded");

      await act(async () => {
        await result.current.switchNetwork(137);
      });

      expect(wallet.switchChain).not.toHaveBeenCalled();
      expect(result.current.error).toBe("Wallet not connected");
    });
  });
});
