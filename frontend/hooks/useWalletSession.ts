import { useCallback, useEffect, useRef, useState } from 'react';

export type WalletSessionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type NetworkChangeOutcome =
  | 'applied'
  | 'noop_same_network'
  | 'unsupported_chain'
  | 'rejected'
  | 'failed';

export interface WalletSessionTelemetryEvent {
  event: 'wallet_session_network_change';
  outcome: NetworkChangeOutcome;
  /** Deterministic, non-identifying reason code (never raw error text). */
  reason?: string;
  /** Whether a chain id was present on the request (never the value itself). */
  hasTargetChain: boolean;
}

export type WalletSessionTelemetrySink = (
  event: WalletSessionTelemetryEvent,
) => void;

export interface WalletSessionState {
  status: WalletSessionStatus;
  chainId: number | null;
  supportedChainIds: number[];
  error: string | null;
}

export interface UseWalletSessionOptions {
  /** Currently connected chain id, if any. */
  chainId?: number | null;
  /** Chains the app supports. */
  supportedChainIds?: number[];
  /**
   * Requests a network switch from the wallet provider.
   * Should resolve on success and reject on user rejection/failure.
   */
  requestNetworkChange?: (chainId: number) => Promise<void>;
  /** Optional telemetry sink. Receives privacy-safe, deterministic events. */
  onTelemetry?: WalletSessionTelemetrySink;
}

const DEFAULT_SUPPORTED_CHAINS: number[] = [];

/**
 * Maps an unknown provider error to a deterministic, non-sensitive reason code.
 * Never returns raw error messages, which may contain addresses or payloads.
 */
function classifyNetworkChangeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (code === 4001) {
      return 'user_rejected';
    }
    if (typeof code === 'number' || typeof code === 'string') {
      return 'provider_error';
    }
  }
  return 'unknown_error';
}

export function useWalletSession(options: UseWalletSessionOptions = {}) {
  const {
    chainId: initialChainId = null,
    supportedChainIds = DEFAULT_SUPPORTED_CHAINS,
    requestNetworkChange,
    onTelemetry,
  } = options;

  const [state, setState] = useState<WalletSessionState>({
    status: initialChainId === null ? 'disconnected' : 'connected',
    chainId: initialChainId,
    supportedChainIds,
    error: null,
  });

  const telemetryRef = useRef<WalletSessionTelemetrySink | undefined>(
    onTelemetry,
  );
  useEffect(() => {
    telemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  const emit = useCallback((event: WalletSessionTelemetryEvent) => {
    const sink = telemetryRef.current;
    if (!sink) {
      return;
    }
    try {
      sink(event);
    } catch {
      // Telemetry must never break the wallet session flow.
    }
  }, []);

  const changeNetwork = useCallback(
    async (targetChainId: number): Promise<NetworkChangeOutcome> => {
      const hasTargetChain = Number.isInteger(targetChainId);

      if (!hasTargetChain) {
        emit({
          event: 'wallet_session_network_change',
          outcome: 'failed',
          reason: 'invalid_chain_id',
          hasTargetChain: false,
        });
        return 'failed';
      }

      if (state.chainId === targetChainId) {
        emit({
          event: 'wallet_session_network_change',
          outcome: 'noop_same_network',
          hasTargetChain: true,
        });
        return 'noop_same_network';
      }

      if (!state.supportedChainIds.includes(targetChainId)) {
        emit({
          event: 'wallet_session_network_change',
          outcome: 'unsupported_chain',
          hasTargetChain: true,
        });
        return 'unsupported_chain';
      }

      if (!requestNetworkChange) {
        emit({
          event: 'wallet_session_network_change',
          outcome: 'failed',
          reason: 'no_provider',
          hasTargetChain: true,
        });
        return 'failed';
      }

      try {
        await requestNetworkChange(targetChainId);
        setState((prev) => ({
          ...prev,
          status: 'connected',
          chainId: targetChainId,
          error: null,
        }));
        emit({
          event: 'wallet_session_network_change',
          outcome: 'applied',
          hasTargetChain: true,
        });
        return 'applied';
      } catch (error) {
        const reason = classifyNetworkChangeError(error);
        const outcome: NetworkChangeOutcome =
          reason === 'user_rejected' ? 'rejected' : 'failed';
        setState((prev) => ({
          ...prev,
          error: reason,
        }));
        emit({
          event: 'wallet_session_network_change',
          outcome,
          reason,
          hasTargetChain: true,
        });
        return outcome;
      }
    },
    [emit, requestNetworkChange, state.chainId, state.supportedChainIds],
  );

  return {
    ...state,
    changeNetwork,
  };
}
