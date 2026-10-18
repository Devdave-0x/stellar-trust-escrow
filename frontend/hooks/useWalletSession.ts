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
  /**
   * Screen-reader friendly announcement for the current network-change state.
   * Empty string when there is nothing to announce (idle).
   */
  announcement: string;
  /**
   * Keyboard handler for network-change controls. Activates the focused
   * control on Enter/Space and retries on 'r' when a change has failed.
   */
  handleNetworkKeyDown: (
    event: { key: string; preventDefault?: () => void },
    network?: string,
  ) => void;
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

function buildAnnouncement(state: WalletSessionState): string {
  switch (state.status) {
    case 'loading':
      return state.pendingNetwork
        ? `Switching wallet network to ${state.pendingNetwork}.`
        : 'Switching wallet network.';
    case 'success':
      return state.network
        ? `Wallet network changed to ${state.network}.`
        : 'Wallet network changed.';
    case 'failure':
      return state.error
        ? `Network change failed: ${state.error}`
        : 'Network change failed.';
    case 'empty':
      return 'No network selected. Choose a network to continue.';
    default:
      return '';
  }
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

  const handleNetworkKeyDown = useCallback(
    (
      event: { key: string; preventDefault?: () => void },
      network?: string,
    ) => {
      const { key } = event;
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        event.preventDefault?.();
        if (network) {
          void runSwitch(network);
        } else if (state.status === 'failure' && state.pendingNetwork) {
          void runSwitch(state.pendingNetwork);
        }
        return;
      }
      if ((key === 'r' || key === 'R') && state.status === 'failure') {
        event.preventDefault?.();
        void retry();
      }
    },
    [runSwitch, retry, state.status, state.pendingNetwork],
  );

  const announcement = buildAnnouncement(state);

  return {
    ...state,
    requestNetworkChange,
    retry,
    reset,
    announcement,
    handleNetworkKeyDown,
  };
}

export default useWalletSession;
