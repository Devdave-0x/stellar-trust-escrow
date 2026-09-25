import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Button from './Button';
import { networkLabel, type NetworkMatch } from '../../lib/networkMatch';

interface NetworkMismatchBannerProps {
  match: NetworkMatch;
  onReconnect: () => void;
}

/** Explains a wallet/app/API network mismatch and offers to reconnect. */
export default function NetworkMismatchBanner({ match, onReconnect }: NetworkMismatchBannerProps) {
  if (match.ok) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" testID="network-mismatch-banner">
      <Text style={styles.title}>Wrong network: expected {networkLabel(match.expected)}</Text>
      <Text style={styles.text}>{match.message}</Text>
      <Button title="Reconnect wallet" onPress={onReconnect} variant="ghost" />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#1c0a00',
    borderColor: '#7c2d12',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#fb923c' },
  text: { fontSize: 13, color: '#fdba74', lineHeight: 18 },
});
