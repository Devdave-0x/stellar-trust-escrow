/**
 * Root layout — sets up providers, initialises services, handles deep links.
 */

import React, { useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useWalletStore } from '../store/useWalletStore';
import { initOfflineDb } from '../services/offlineCache';
import { setupNotificationListeners } from '../services/notifications';
import { api } from '../services/api';
import { useTransactionStore } from '../store/useTransactionStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

// Max safe escrow ID: 2^53 - 1 (JS number precision limit for BigInt-as-string)
const MAX_SAFE_ESCROW_ID = Number.MAX_SAFE_INTEGER;

function resolveDeepLinkEscrowId(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d{1,16}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SAFE_ESCROW_ID) return null;
  return s;
}

// Guard against overlapping foreground refreshes (module-level so it survives re-renders).
let foregroundRefreshInFlight = false;

/**
 * Refresh the status of tracked pending transactions after the app returns to
 * the foreground. Read-only: never re-submits a transaction.
 */
export async function refreshPendingTransactionsOnForeground(): Promise<void> {
  if (foregroundRefreshInFlight) return;
  foregroundRefreshInFlight = true;
  try {
    const { pendingTransactionIds, updateTransactionStatus } = useTransactionStore.getState();
    const ids = Array.from(pendingTransactionIds);
    await Promise.all(
      ids.map(async (id) => {
        try {
          const result = await api.get(`/transactions/${id}/status`);
          const status = result?.status;
          if (status === 'confirmed' || status === 'pending' || status === 'expired') {
            updateTransactionStatus(id, status);
          }
        } catch (err) {
          console.warn(`[Foreground] Failed to refresh transaction ${id}:`, err);
        }
      }),
    );
  } finally {
    foregroundRefreshInFlight = false;
  }
}

export default function RootLayout() {
  const hydrate = useWalletStore((s) => s.hydrate);
  const router = useRouter();

  useEffect(() => {
    hydrate();
    initOfflineDb();

    const cleanup = setupNotificationListeners(
      () => {}, // foreground — banner handles it
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        if (data?.escrowId) {
          // Validate escrowId: only numeric chars, reject path traversal
          const VALID_ESCROW_ID = /^[0-9]+$/;
          if (VALID_ESCROW_ID.test(data.escrowId)) {
            void router.push(`/escrow/${data.escrowId}`);
          } else {
            console.error(`[Security] Invalid escrowId in notification: ${data.escrowId}`);
          }
        }
      },
    );

    return cleanup;
  }, [hydrate, router]);

  useEffect(() => {
    let previousState: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded =
        previousState === 'background' || previousState === 'inactive';
      previousState = nextState;

      if (nextState === 'active' && wasBackgrounded) {
        void refreshPendingTransactionsOnForeground();
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: '#0f0f0f' },
              headerTintColor: '#f9fafb',
              headerTitleStyle: { fontWeight: '700' },
              contentStyle: { backgroundColor: '#0f0f0f' },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="escrow/[id]" options={{ title: 'Escrow Details' }} />
            <Stack.Screen name="escrow/create" options={{ title: 'Create Escrow' }} />
            <Stack.Screen name="profile/[address]" options={{ title: 'Profile' }} />
            <Stack.Screen name="kyc/index" options={{ title: 'KYC Verification' }} />
            <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
