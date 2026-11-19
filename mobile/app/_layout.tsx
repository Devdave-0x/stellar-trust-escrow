/**
 * Root layout — sets up providers, initialises services, handles deep links.
 */

import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useWalletStore } from '../store/useWalletStore';
import { initOfflineDb } from '../services/offlineCache';
import { setupNotificationListeners } from '../services/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

// Max safe escrow ID: 2^53 - 1 (JS number precision limit for BigInt-as-string)
const MAX_SAFE_ESCROW_ID = Number.MAX_SAFE_INTEGER;

// Expected deep-link scheme/host for this app.
const APP_SCHEME = 'stellar';
const APP_HOST = 'escrow';

// Wallet callback payloads: only allow known callback actions.
const VALID_WALLET_CALLBACK_ACTIONS = new Set(['connect', 'sign', 'approve']);

export function resolveDeepLinkEscrowId(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!/^\d{1,16}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SAFE_ESCROW_ID) return null;
  return s;
}

export type DeepLinkRoute =
  | { type: 'escrow'; escrowId: string }
  | { type: 'wallet-callback'; action: string; payload: Record<string, string> };

/**
 * Parse and validate an inbound deep link URL.
 * Returns a validated route descriptor, or null if the link is malformed
 * (wrong scheme/host, invalid escrow id, or invalid wallet-callback payload).
 */
export function parseDeepLink(url: unknown): DeepLinkRoute | null {
  if (typeof url !== 'string' || url.length === 0) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Validate scheme and host strictly.
  if (parsed.protocol !== `${APP_SCHEME}:`) return null;
  if (parsed.hostname !== APP_HOST) return null;

  // Normalise path: strip leading/trailing slashes, split into segments.
  const segments = parsed.pathname.split('/').filter(Boolean);

  if (segments[0] === 'escrow') {
    if (segments.length !== 2) return null;
    const escrowId = resolveDeepLinkEscrowId(segments[1]);
    if (!escrowId) return null;
    return { type: 'escrow', escrowId };
  }

  if (segments[0] === 'wallet' && segments[1] === 'callback') {
    const action = segments[2];
    if (!action || !VALID_WALLET_CALLBACK_ACTIONS.has(action)) return null;
    const payload: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      // Reject oversized or control-character payload values.
      if (value.length > 512 || /[\u0000-\u001f]/.test(value)) return;
      payload[key] = value;
    });
    return { type: 'wallet-callback', action, payload };
  }

  return null;
}

export default function RootLayout() {
  const hydrate = useWalletStore((s) => s.hydrate);
  const router = useRouter();

  useEffect(() => {
    hydrate();
    initOfflineDb();

    // Route a validated deep link. Never mutates the wallet store's selected
    // account — the selected account is preserved across navigation.
    const handleDeepLink = (url: string) => {
      const route = parseDeepLink(url);
      if (!route) {
        console.error(`[Security] Rejected malformed deep link: ${url}`);
        return;
      }
      if (route.type === 'escrow') {
        void router.push(`/escrow/${route.escrowId}`);
      } else if (route.type === 'wallet-callback') {
        void router.push('/settings/index');
      }
    };

    const cleanup = setupNotificationListeners(
      () => {}, // foreground — banner handles it
      (response) => {
        const data = response.notification.request.content.data as Record<string, string>;
        if (data?.escrowId) {
          const escrowId = resolveDeepLinkEscrowId(data.escrowId);
          if (escrowId) {
            void router.push(`/escrow/${escrowId}`);
          } else {
            console.error(`[Security] Invalid escrowId in notification: ${data.escrowId}`);
          }
        }
      },
    );

    // Handle the link that launched the app (cold start).
    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Handle links received while the app is running.
    const linkingSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      cleanup();
      linkingSub.remove();
    };
  }, [hydrate, router]);

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
