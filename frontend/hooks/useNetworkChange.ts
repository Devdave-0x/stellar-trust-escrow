import { useCallback, useMemo } from 'react';

/**
 * Roles that are allowed to trigger a wallet session network change.
 * Kept as a const tuple so callers can reuse it for UI copy/tests.
 */
export const NETWORK_CHANGE_ALLOWED_ROLES = ['owner', 'admin'] as const;

export type NetworkChangeRole = (typeof NETWORK_CHANGE_ALLOWED_ROLES)[number];

/**
 * Escrow states in which a network change is safe to perform.
 * Anything else (e.g. funded, disputed, released) must block the action.
 */
export const NETWORK_CHANGE_ACTIONABLE_ESCROW_STATES = [
  'idle',
  'created',
  'unfunded',
] as const;

export type NetworkChangeEscrowState =
  (typeof NETWORK_CHANGE_ACTIONABLE_ESCROW_STATES)[number];

export type NetworkChangeGateReason =
  | 'allowed'
  | 'disconnected'
  | 'unsupported-network'
  | 'insufficient-role'
  | 'escrow-not-actionable';

export interface NetworkChangeGateInput {
  /** Whether the wallet session is currently connected. */
  isConnected: boolean;
  /** Whether the connected chain is supported by the app. */
  isSupportedNetwork: boolean;
  /** Authoritative role resolved from the session/backend, not client heuristics. */
  role: string | null | undefined;
  /** Authoritative escrow state resolved from the session/backend. */
  escrowState: string | null | undefined;
}

export interface NetworkChangeGateResult {
  /** True only when every authoritative check passes. */
  canChangeNetwork: boolean;
  /** Deterministic, secret-free reason for the current gate decision. */
  reason: NetworkChangeGateReason;
  /** True when the action should be rendered at all (hidden otherwise). */
  isVisible: boolean;
}

function isAllowedRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return (NETWORK_CHANGE_ALLOWED_ROLES as readonly string[]).includes(role);
}

function isActionableEscrowState(state: string | null | undefined): boolean {
  if (!state) return false;
  return (NETWORK_CHANGE_ACTIONABLE_ESCROW_STATES as readonly string[]).includes(
    state,
  );
}

/**
 * Pure gate evaluation, exported for direct unit testing.
 * Order matters: connection/network problems take precedence over role and
 * escrow checks so the surfaced reason is deterministic.
 */
export function evaluateNetworkChangeGate(
  input: NetworkChangeGateInput,
): NetworkChangeGateResult {
  const { isConnected, isSupportedNetwork, role, escrowState } = input;

  if (!isConnected) {
    return { canChangeNetwork: false, reason: 'disconnected', isVisible: false };
  }

  if (!isSupportedNetwork) {
    return {
      canChangeNetwork: false,
      reason: 'unsupported-network',
      isVisible: false,
    };
  }

  if (!isAllowedRole(role)) {
    return {
      canChangeNetwork: false,
      reason: 'insufficient-role',
      isVisible: false,
    };
  }

  if (!isActionableEscrowState(escrowState)) {
    return {
      canChangeNetwork: false,
      reason: 'escrow-not-actionable',
      isVisible: true,
    };
  }

  return { canChangeNetwork: true, reason: 'allowed', isVisible: true };
}

/**
 * Permission-aware gating for wallet session network-change actions.
 *
 * Returns whether the action should be shown/enabled based on authoritative
 * role and escrow-state checks, plus a stable reason for UI messaging.
 */
export function useNetworkChangeGate(
  input: NetworkChangeGateInput,
): NetworkChangeGateResult {
  const { isConnected, isSupportedNetwork, role, escrowState } = input;

  return useMemo(
    () =>
      evaluateNetworkChangeGate({
        isConnected,
        isSupportedNetwork,
        role,
        escrowState,
      }),
    [isConnected, isSupportedNetwork, role, escrowState],
  );
}

/**
 * Convenience wrapper that returns a guarded action handler. The handler is a
 * no-op when the gate is closed, so callers cannot bypass the permission check.
 */
export function useGuardedNetworkChange(
  input: NetworkChangeGateInput,
  onChangeNetwork: () => void | Promise<void>,
): NetworkChangeGateResult & { requestNetworkChange: () => void } {
  const gate = useNetworkChangeGate(input);

  const requestNetworkChange = useCallback(() => {
    if (!gate.canChangeNetwork) return;
    void onChangeNetwork();
  }, [gate.canChangeNetwork, onChangeNetwork]);

  return { ...gate, requestNetworkChange };
}
