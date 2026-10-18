import { useCallback, useEffect, useRef, useState } from 'react';

export type NetworkChangeStatus = 'idle' | 'pending' | 'applied' | 'error';

export interface NetworkChangeAnnouncement {
  /** Deterministic, secret-free message suitable for an aria-live region. */
  message: string;
  /** Polite for informational updates, assertive for failures. */
  politeness: 'polite' | 'assertive';
}

export interface UseNetworkChangeOptions {
  /** Current chain id reported by the wallet session. */
  chainId?: number | string | null;
  /** Optional human-readable network label for announcements. */
  networkName?: string;
  /** Called when the wallet switches to a different chain. */
  onChange?: (nextChainId: number | string) => void | Promise<void>;
}

export interface UseNetworkChangeResult {
  status: NetworkChangeStatus;
  announcement: NetworkChangeAnnouncement | null;
  /** Attach to an aria-live region so screen readers announce changes. */
  liveRegionProps: {
    role: 'status';
    'aria-live': 'polite' | 'assertive';
    'aria-atomic': true;
  };
  /** Keyboard handler for a dismiss/acknowledge control (Enter/Space). */
  onAcknowledgeKeyDown: (event: { key: string; preventDefault?: () => void }) => void;
  acknowledge: () => void;
}

function normalizeChainId(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  return String(value);
}

function describeNetwork(chainId: string, networkName?: string): string {
  return networkName ? `${networkName} (chain ${chainId})` : `chain ${chainId}`;
}

/**
 * Tracks wallet session network changes and exposes accessible state:
 * a deterministic announcement for screen readers plus a keyboard-friendly
 * acknowledge handler. Keeps existing behavior untouched when the chain
 * does not change.
 */
export function useNetworkChange(options: UseNetworkChangeOptions = {}): UseNetworkChangeResult {
  const { chainId, networkName, onChange } = options;
  const [status, setStatus] = useState<NetworkChangeStatus>('idle');
  const [announcement, setAnnouncement] = useState<NetworkChangeAnnouncement | null>(null);
  const previousChainRef = useRef<string | null>(normalizeChainId(chainId));
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const next = normalizeChainId(chainId);
    const previous = previousChainRef.current;

    if (next === previous) {
      return;
    }

    previousChainRef.current = next;

    if (next === null) {
      setStatus('idle');
      setAnnouncement(null);
      return;
    }

    setStatus('pending');
    setAnnouncement({
      message: `Wallet network changed to ${describeNetwork(next, networkName)}.`,
      politeness: 'polite',
    });

    let cancelled = false;

    Promise.resolve()
      .then(() => onChangeRef.current?.(next))
      .then(() => {
        if (cancelled) {
          return;
        }
        setStatus('applied');
        setAnnouncement({
          message: `Wallet network is now ${describeNetwork(next, networkName)}.`,
          politeness: 'polite',
        });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setStatus('error');
        setAnnouncement({
          message: `Unable to apply wallet network change to ${describeNetwork(next, networkName)}.`,
          politeness: 'assertive',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [chainId, networkName]);

  const acknowledge = useCallback(() => {
    setAnnouncement(null);
    setStatus('idle');
  }, []);

  const onAcknowledgeKeyDown = useCallback(
    (event: { key: string; preventDefault?: () => void }) => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault?.();
        acknowledge();
      }
    },
    [acknowledge],
  );

  return {
    status,
    announcement,
    liveRegionProps: {
      role: 'status',
      'aria-live': announcement?.politeness ?? 'polite',
      'aria-atomic': true,
    },
    onAcknowledgeKeyDown,
    acknowledge,
  };
}

export default useNetworkChange;
