import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { QueuedTransaction } from '../../services/txRetryQueue';

interface PendingTransactionsProps {
  entries: QueuedTransaction[];
  onDismiss: (id: string) => void;
}

/**
 * Signed transactions waiting to be retried, and ones the server rejected.
 * Rejections stay visible until dismissed so they are never lost silently.
 */
export default function PendingTransactions({ entries, onDismiss }: PendingTransactionsProps) {
  const pending = entries.filter((e) => e.status === 'pending');
  const failed = entries.filter((e) => e.status === 'failed');
  if (pending.length === 0 && failed.length === 0) return null;

  return (
    <View style={styles.container} testID="pending-transactions">
      {pending.length > 0 && (
        <Text style={styles.pending}>
          {pending.length === 1
            ? '1 transaction waiting to submit. It will be sent when the server is reachable.'
            : `${pending.length} transactions waiting to submit. They will be sent when the server is reachable.`}
        </Text>
      )}
      {failed.map((entry) => (
        <View key={entry.id} style={styles.failed} accessibilityRole="alert">
          <View style={styles.failedText}>
            <Text style={styles.failedTitle}>
              Transaction {entry.id.slice(0, 8)}… was not submitted
            </Text>
            <Text style={styles.failedReason}>{entry.lastError ?? 'Rejected by the server.'}</Text>
          </View>
          <TouchableOpacity onPress={() => onDismiss(entry.id)} accessibilityRole="button">
            <Text style={styles.dismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginBottom: 8, gap: 8 },
  pending: {
    fontSize: 13,
    color: '#fbbf24',
    backgroundColor: '#1c1300',
    borderRadius: 8,
    padding: 10,
  },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1c0a00',
    borderColor: '#7c2d12',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  failedText: { flex: 1 },
  failedTitle: { fontSize: 13, fontWeight: '700', color: '#fb923c' },
  failedReason: { fontSize: 12, color: '#fdba74', marginTop: 2 },
  dismiss: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
});
