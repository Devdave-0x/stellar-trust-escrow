import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { EscrowResult } from '../../hooks/useEscrows';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Human-readable age of the last sync, e.g. "just now", "5 min ago", "3 h ago". */
export function formatLastSynced(syncedAt: number, now: number): string {
  const age = Math.max(0, now - syncedAt);
  if (age < MINUTE_MS) return 'just now';
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} min ago`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)} h ago`;
  const days = Math.floor(age / DAY_MS);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/** Banner text for cached data, or null when the data is fresh from the API. */
export function staleBannerMessage(
  result: Pick<EscrowResult, 'source' | 'syncedAt' | 'staleReason'> | undefined,
  now: number,
): string | null {
  if (!result || result.source !== 'cache') return null;
  const synced = `Last synced ${formatLastSynced(result.syncedAt, now)}.`;
  return result.staleReason === 'offline'
    ? `You're offline. Showing saved data. ${synced}`
    : `Couldn't refresh. Showing saved data. ${synced} Pull down to retry.`;
}

interface StaleDataBannerProps {
  result: EscrowResult | undefined;
  now?: number;
}

/** Shown above escrow details when they come from the offline cache. */
export default function StaleDataBanner({ result, now = Date.now() }: StaleDataBannerProps) {
  const message = staleBannerMessage(result, now);
  if (!message) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" testID="stale-data-banner">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1c1300',
    borderColor: '#78350f',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  text: { fontSize: 13, color: '#fbbf24', lineHeight: 18 },
});
