import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { useNetwork } from '../context/NetworkContext';
import { useEscrow } from '../context/EscrowContext';
import type { WalletRole } from '../types/wallet';
import type { EscrowState } from '../types/escrow';

export interface NetworkChangePermission {
  allowed: boolean;
  reason: 'allowed' | 'insufficient-role' | 'escrow-not-actionable' | 'wallet-disconnected' | 'unsupported-network';
}

export interface NetworkChangeFeedback {
  /** Whether the feedback should be animated (false when reduced motion is preferred). */
  animated: boolean;
  /** Duration in ms the feedback should be shown; 0 when reduced motion is preferred. */
  durationMs: number;
}

const NETWORK_CHANGE_ROLES: WalletRole[] = ['admin', 'arbiter'];
const ACTIONABLE_ESCROW_STATES: EscrowState[] = ['created', 'funded', 'disputed'];
const NETWORK_CHANGE_FEEDBACK_DURATION_MS = 400;

export function evaluateNetworkChangePermission(params: {
  connected: boolean;
  role: WalletRole | null;
  escrowState: EscrowState | null;
  targetNetworkSupported: boolean;
}): NetworkChangePermission {
  const { connected, role, escrowState, targetNetworkSupported } = params;

  if (!connected) {
    return { allowed: false, reason: 'wallet-disconnected' };
  }
  if (!targetNetworkSupported) {
    return { allowed: false, reason: 'unsupported-network' };
  }
  if (!role || !NETWORK_CHANGE_ROLES.includes(role)) {
    return { allowed: false, reason: 'insufficient-role' };
  }
  if (!escrowState || !ACTIONABLE_ESCROW_STATES.includes(escrowState)) {
    return { allowed: false, reason: 'escrow-not-actionable' };
  }
  return { allowed: true, reason: 'allowed' };
}

export function resolveNetworkChangeFeedback(prefersReducedMotion: boolean): NetworkChangeFeedback {
  if (prefersReducedMotion) {
    return { animated: false, durationMs: 0 };
  }
  return { animated: true, durationMs: NETWORK_CHANGE_FEEDBACK_DURATION_MS };
}

function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useWalletSession() {
  const { connected, address, role } = useWallet();
  const { currentNetwork, supportedNetworks, switchNetwork } = useNetwork();
  const { escrowState } = useEscrow();

  const [pendingNetwork, setPendingNetwork] = useState<string | null>(null);
  const [optimisticNetwork, setOptimisticNetwork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(readPrefersReducedMotion);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const serverNetworkRef = useRef(currentNetwork);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Track the user's reduced-motion preference so network-change feedback can
  // be shown without animation when requested.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    let query: MediaQueryList;
    try {
      query = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const handleChange = (event: MediaQueryListEvent) => {
      if (mountedRef.current) {
        setPrefersReducedMotion(event.matches);
      }
    };
    setPrefersReducedMotion(query.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }
    if (typeof query.addListener === 'function') {
      query.addListener(handleChange);
      return () => query.removeListener(handleChange);
    }
    return;
  }, []);

  // Track the latest server-confirmed network so a rollback never discards a
  // newer server update that arrived while a switch was in flight.
  useEffect(() => {
    serverNetworkRef.current = currentNetwork;
    setOptimisticNetwork((prev) => (prev !== null && prev === currentNetwork ? null : prev));
  }, [currentNetwork]);

  const permission = useMemo(
    () =>
      evaluateNetworkChangePermission({
        connected,
        role,
        escrowState,
        targetNetworkSupported: supportedNetworks.length > 0,
      }),
    [connected, role, escrowState, supportedNetworks.length],
  );

  const canChangeNetwork = permission.allowed;

  const feedback = useMemo(
    () => resolveNetworkChangeFeedback(prefersReducedMotion),
    [prefersReducedMotion],
  );

  const requestNetworkChange = useCallback(
    async (networkId: string) => {
      const targetSupported = supportedNetworks.includes(networkId);
      const check = evaluateNetworkChangePermission({
        connected,
        role,
        escrowState,
        targetNetworkSupported: targetSupported,
      });

      if (!check.allowed) {
        setError(`network-change-blocked:${check.reason}`);
        return false;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setError(null);
      setPendingNetwork(networkId);
      setOptimisticNetwork(networkId);
      try {
        await switchNetwork(networkId);
        return true;
      } catch {
        if (mountedRef.current && requestIdRef.current === requestId) {
          // Roll back only if this is still the latest request and the server
          // has not already confirmed a different network in the meantime.
          setOptimisticNetwork((prev) =>
            prev === networkId && serverNetworkRef.current !== networkId
              ? null
              : prev,
          );
          setError('network-change-failed');
        }
        return false;
      } finally {
        if (mountedRef.current && requestIdRef.current === requestId) {
          setPendingNetwork(null);
        }
      }
    },
    [connected, role, escrowState, supportedNetworks, switchNetwork],
  );

  const effectiveNetwork = optimisticNetwork ?? currentNetwork;

  return {
    address,
    currentNetwork: effectiveNetwork,
    pendingNetwork,
    error,
    permission,
    canChangeNetwork,
    requestNetworkChange,
    prefersReducedMotion,
    feedback,
  };
}
