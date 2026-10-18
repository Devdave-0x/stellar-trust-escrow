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

const NETWORK_CHANGE_ROLES: WalletRole[] = ['admin', 'arbiter'];
const ACTIONABLE_ESCROW_STATES: EscrowState[] = ['created', 'funded', 'disputed'];

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

export function useWalletSession() {
  const { connected, address, role } = useWallet();
  const { currentNetwork, supportedNetworks, switchNetwork } = useNetwork();
  const { escrowState } = useEscrow();

  const [pendingNetwork, setPendingNetwork] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

      setError(null);
      setPendingNetwork(networkId);
      try {
        await switchNetwork(networkId);
        return true;
      } catch {
        if (mountedRef.current) {
          setError('network-change-failed');
        }
        return false;
      } finally {
        if (mountedRef.current) {
          setPendingNetwork(null);
        }
      }
    },
    [connected, role, escrowState, supportedNetworks, switchNetwork],
  );

  return {
    address,
    currentNetwork,
    pendingNetwork,
    error,
    permission,
    canChangeNetwork,
    requestNetworkChange,
  };
}
