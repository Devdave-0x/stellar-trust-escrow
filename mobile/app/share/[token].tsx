import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { isValidShareToken } from '../../lib/shareLink';

type SharedEscrow = {
  escrow: {
    id: string;
    status: string;
    totalAmount: string;
    remainingBalance: string;
    milestones?: { id: number; title: string; amount: string; status: string }[];
  };
  expiresAt: string | null;
};

type State = { kind: 'loading' } | { kind: 'ok'; data: SharedEscrow } | { kind: 'fallback'; message: string };

/** Opens public share links (stellartrustescrow://share/<token>) inside the app. */
export default function SharedEscrowScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    // Reject malformed tokens before any request.
    if (!isValidShareToken(token)) {
      setState({ kind: 'fallback', message: 'This share link is invalid.' });
      return;
    }
    api
      .get<SharedEscrow>(`/api/share/${encodeURIComponent(token)}`)
      .then((res) => setState({ kind: 'ok', data: res.data }))
      .catch((err) => {
        const status = err?.response?.status;
        setState({
          kind: 'fallback',
          message:
            status === 410
              ? 'This share link has expired.'
              : status === 404
                ? 'This share link is invalid or has been revoked.'
                : 'Could not open this share link. Please try again.',
        });
      });
  }, [token]);

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (state.kind === 'fallback') {
    return (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.text}>{state.message}</Text>
        <Pressable style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>Go to home</Text>
        </Pressable>
      </View>
    );
  }

  const { escrow } = state.data;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Escrow #{escrow.id}</Text>
      <Text style={styles.text}>
        {escrow.status} · {escrow.totalAmount} total · {escrow.remainingBalance} remaining
      </Text>
      {escrow.milestones?.map((m) => (
        <Text key={m.id} style={styles.text}>
          {m.title} — {m.amount} ({m.status})
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  text: { fontSize: 14 },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#4f46e5' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
