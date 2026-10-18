import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

type ReconnectStatus = 'idle' | 'connecting' | 'success' | 'error' | 'timeout';

export interface WalletReconnectProps {
  /** Attempts to reconnect the wallet session. Reject to signal failure. */
  onReconnect: () => Promise<void>;
  /** Milliseconds before a reconnect attempt is treated as timed out. */
  timeoutMs?: number;
  /** Maximum number of automatic retries after a failure. */
  maxRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 1;

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('reconnect-timeout')), timeoutMs);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function statusMessage(status: ReconnectStatus, attempt: number): string {
  switch (status) {
    case 'connecting':
      return attempt > 0 ? `Retrying wallet connection, attempt ${attempt + 1}.` : 'Reconnecting wallet…';
    case 'success':
      return 'Wallet reconnected.';
    case 'error':
      return 'Wallet reconnection failed. Please try again.';
    case 'timeout':
      return 'Wallet reconnection timed out. Please try again.';
    default:
      return '';
  }
}

export function WalletReconnect({
  onReconnect,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
}: WalletReconnectProps): React.ReactElement {
  const [status, setStatus] = useState<ReconnectStatus>('idle');
  const [attempt, setAttempt] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const announce = useCallback((message: string) => {
    if (!message) {
      return;
    }
    // Announce without moving focus so navigation is not disrupted.
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const runAttempt = useCallback(
    async (currentAttempt: number) => {
      setStatus('connecting');
      setAttempt(currentAttempt);
      announce(statusMessage('connecting', currentAttempt));

      try {
        await withTimeout(onReconnect(), timeoutMs);
        if (!mountedRef.current) {
          return;
        }
        setStatus('success');
        announce(statusMessage('success', currentAttempt));
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }
        const isTimeout = err instanceof Error && err.message === 'reconnect-timeout';
        if (currentAttempt < maxRetries) {
          await runAttempt(currentAttempt + 1);
          return;
        }
        const nextStatus: ReconnectStatus = isTimeout ? 'timeout' : 'error';
        setStatus(nextStatus);
        announce(statusMessage(nextStatus, currentAttempt));
      }
    },
    [announce, maxRetries, onReconnect, timeoutMs],
  );

  const handlePress = useCallback(() => {
    if (status === 'connecting') {
      return;
    }
    void runAttempt(0);
  }, [runAttempt, status]);

  const isBusy = status === 'connecting';
  const message = statusMessage(status, attempt);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reconnect wallet"
        accessibilityState={{ disabled: isBusy, busy: isBusy }}
        disabled={isBusy}
        onPress={handlePress}
        style={[styles.button, isBusy && styles.buttonDisabled]}
      >
        <Text style={styles.buttonText}>{isBusy ? 'Reconnecting…' : 'Reconnect wallet'}</Text>
      </Pressable>
      {/* Live region: announces async status changes without stealing focus. */}
      <Text
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.status}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  status: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
  },
});

export default WalletReconnect;
