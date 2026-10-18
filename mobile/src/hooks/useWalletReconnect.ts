import { useCallback, useEffect, useRef, useState } from 'react';

export type ReconnectStatus =
  | 'idle'
  | 'reconnecting'
  | 'reconnected'
  | 'failed'
  | 'timed-out';

export interface UseWalletReconnectOptions {
  /** Attempts to reconnect the wallet. Should resolve on success, reject on failure. */
  reconnect: () => Promise<void>;
  /** Maximum time (ms) to wait for a single reconnect attempt before timing out. */
  timeoutMs?: number;
  /** Number of retry attempts after the first failure. */
  maxRetries?: number;
  /** Called whenever the status changes, e.g. to persist or log deterministically. */
  onStatusChange?: (status: ReconnectStatus) => void;
}

export interface UseWalletReconnectResult {
  status: ReconnectStatus;
  /** Human-readable, screen-reader friendly announcement for the current status. */
  announcement: string;
  /** ARIA live politeness appropriate for the current status. */
  politeness: 'polite' | 'assertive';
  /** True while a reconnect attempt (including retries) is in flight. */
  isReconnecting: boolean;
  /** Trigger the reconnect flow. Safe to call repeatedly; concurrent calls are ignored. */
  startReconnect: () => Promise<void>;
  /** Reset back to idle, clearing the announcement. */
  reset: () => void;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 1;

const ANNOUNCEMENTS: Record<ReconnectStatus, string> = {
  idle: '',
  reconnecting: 'Reconnecting your wallet. Please wait.',
  reconnected: 'Wallet reconnected successfully.',
  failed: 'Wallet reconnection failed. Please try again.',
  'timed-out': 'Wallet reconnection timed out. Please try again.',
};

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('reconnect-timeout'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Manages the mobile wallet reconnect flow and exposes accessible status
 * announcements. Announcements are surfaced through a live region by the
 * consuming component; this hook never moves focus or triggers navigation.
 */
export function useWalletReconnect({
  reconnect,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  onStatusChange,
}: UseWalletReconnectOptions): UseWalletReconnectResult {
  const [status, setStatus] = useState<ReconnectStatus>('idle');
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateStatus = useCallback((next: ReconnectStatus) => {
    if (!mountedRef.current) {
      return;
    }
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  const startReconnect = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    updateStatus('reconnecting');

    let lastError: 'failed' | 'timed-out' = 'failed';

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        await withTimeout(reconnect(), timeoutMs);
        inFlightRef.current = false;
        updateStatus('reconnected');
        return;
      } catch (error) {
        lastError =
          error instanceof Error && error.message === 'reconnect-timeout'
            ? 'timed-out'
            : 'failed';
      }
    }

    inFlightRef.current = false;
    updateStatus(lastError);
  }, [reconnect, timeoutMs, maxRetries, updateStatus]);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    updateStatus('idle');
  }, [updateStatus]);

  return {
    status,
    announcement: ANNOUNCEMENTS[status],
    politeness: status === 'failed' || status === 'timed-out' ? 'assertive' : 'polite',
    isReconnecting: status === 'reconnecting',
    startReconnect,
    reset,
  };
}
