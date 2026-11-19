import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

type EmptyStateVariant = 'default' | 'expired-profile';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  variant?: EmptyStateVariant;
  onReconnect?: () => void;
  onRefresh?: () => void;
  actionLabel?: string;
}

export default function EmptyState({
  icon = '📭',
  title,
  subtitle,
  variant = 'default',
  onReconnect,
  onRefresh,
  actionLabel,
}: EmptyStateProps) {
  const isExpiredProfile = variant === 'expired-profile';

  // When the cached profile has expired, hide any stale account details
  // (icon/subtitle) and expose exactly one recovery action.
  const resolvedIcon = isExpiredProfile ? '🔒' : icon;
  const resolvedSubtitle = isExpiredProfile ? undefined : subtitle;

  const action = isExpiredProfile
    ? onReconnect
      ? { label: actionLabel ?? 'Reconnect wallet', hint: 'Reconnects your wallet to restore your profile', handler: onReconnect }
      : onRefresh
        ? { label: actionLabel ?? 'Refresh profile', hint: 'Refreshes your profile data', handler: onRefresh }
        : undefined
    : undefined;

  return (
    <View style={styles.container}>
      <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {resolvedIcon}
      </Text>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {resolvedSubtitle && <Text style={styles.subtitle}>{resolvedSubtitle}</Text>}
      {action && (
        <Pressable
          onPress={action.handler}
          style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.hint}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '600', color: '#e5e7eb', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8 },
  action: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  actionPressed: { opacity: 0.8 },
  actionText: { fontSize: 16, fontWeight: '600', color: '#ffffff', textAlign: 'center' },
});