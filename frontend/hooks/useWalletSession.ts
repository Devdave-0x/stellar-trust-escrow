import { useCallback, useEffect, useRef, useState } from 'react';

export type WalletNetworkStatus =
  | 'idle'
  | 'loading'
  | 'empty'
  | 'success'
  | 'failure';

export interface WalletSessionState {
  status: WalletNetworkStatus;
  network: string | null;
  error: string | null;
  /** Preserved user input across recoverable failures. */
  pendingNetwork: string | null;
}

export interface UseWalletSessionOptions {
  /** Currently connected wallet network, if any. */
  currentNetwork?: string | null;
  /** Available networks the wallet can switch to. */
  availableNetworks?: string[];
  /** Performs the actual network switch. Should throw on failure. */
  switchNetwork?: (network: string) => Promise<void>;
}

export interface UseWalletSessionResult extends WalletSessionState {
  /** Request a network change; preserves input on recoverable failure. */
  requestNetworkChange: (network: string) => Promise<void>;
  /** Retry the last requested network change. */
  retry: () => Promise<void>;
  /** Clear any failure/empty state back to idle. */
  reset: () => void;
}

const INITIAL_STATE: WalletSessionState = {
  status: 'idle',
  network: null,
  error: null,
  pendingNetwork: null,
};

function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Unable to change wallet network. Please try again.';
}

export function useWalletSession(
  options: UseWalletSessionOptions = {},
): UseWalletSessionResult {
  const { currentNetwork = null, availableNetworks, switchNetwork } = options;

  const [state, setState] = useState<WalletSessionState>(() => ({
    ...INITIAL_STATE,
    network: currentNetwork,
  }));

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep the reported network in sync with the connected wallet.
  useEffect(() => {
    setState((prev) =>
      prev.network === currentNetwork ? prev : { ...prev, network: currentNetwork },
    );
  }, [currentNetwork]);

  const runSwitch = useCallback(
    async (network: string) => {
      if (!network) {
        setState((prev) => ({
          ...prev,
          status: 'empty',
          error: null,
          pendingNetwork: null,
        }));
        return;
      }

      if (availableNetworks && !availableNetworks.includes(network)) {
        setState((prev) => ({
          ...prev,
          status: 'failure',
          error: `Network "${network}" is not available.`,
          pendingNetwork: network,
        }));
        return;
      }

      if (!switchNetwork) {
        setState((prev) => ({
          ...prev,
          status: 'failure',
          error: 'Wallet does not support network switching.',
          pendingNetwork: network,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        status: 'loading',
        error: null,
        pendingNetwork: network,
      }));

      try {
        await switchNetwork(network);
        if (!mountedRef.current) return;
        setState((prev) => ({
          ...prev,
          status: 'success',
          network,
          error: null,
          pendingNetwork: null,
        }));
      } catch (err) {
        if (!mountedRef.current) return;
        // Recoverable failure: keep the requested network so the user can retry.
        setState((prev) => ({
          ...prev,
          status: 'failure',
          error: toErrorMessage(err),
          pendingNetwork: network,
        }));
      }
    },
    [availableNetworks, switchNetwork],
  );

  const requestNetworkChange = useCallback(
    (network: string) => runSwitch(network),
    [runSwitch],
  );

  const retry = useCallback(async () => {
    const target = state.pendingNetwork;
    if (!target) {
      setState((prev) => ({ ...prev, status: 'empty', error: null }));
      return;
    }
    await runSwitch(target);
  }, [runSwitch, state.pendingNetwork]);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: 'idle',
      error: null,
      pendingNetwork: null,
    }));
  }, []);

  return { ...state, requestNetworkChange, retry, reset };
}

export default useWalletSession;
