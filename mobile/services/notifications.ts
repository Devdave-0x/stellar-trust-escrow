/**
 * Push Notification Service
 *
 * Registers the device for push notifications via Expo's notification service
 * and handles incoming notifications (foreground + background).
 *
 * Notification types mirror the backend email events:
 *   - escrow.status_changed
 *   - milestone.completed
 *   - dispute.raised
 *   - dispute.resolved
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Linking } from 'react-native';
import { storage, STORAGE_KEYS } from '../lib/storage';
import { api } from '../lib/api';

// Storage key tracking which account the current push token is associated with.
const PUSH_TOKEN_ACCOUNT_KEY = 'PUSH_TOKEN_ACCOUNT';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers the device for push notifications and stores the Expo push token.
 * Must be called after the user connects their wallet.
 *
 * This never triggers the platform permission prompt. If permission has not
 * already been granted (via `requestPushPermissionWithRationale`), it returns
 * null so the app stays usable and the user can enable it later.
 */
export async function registerForPushNotifications(stellarAddress: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a physical device.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted; skipping registration.');
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  const storedToken = storage.get(STORAGE_KEYS.PUSH_TOKEN);
  const storedAccount = storage.get(PUSH_TOKEN_ACCOUNT_KEY);

  // Idempotent: same token already registered for this account — skip backend call.
  if (storedToken === token && storedAccount === stellarAddress) {
    return token;
  }

  // Account switch or reinstall: remove the stale association before re-registering.
  if (storedToken && storedAccount && storedAccount !== stellarAddress) {
    try {
      await api.delete('/api/notifications/push-token', {
        address: storedAccount,
        token: storedToken,
      });
    } catch (err) {
      // Non-fatal — best-effort cleanup of the previous account's registration
      console.warn('[Notifications] Failed to unregister previous token:', err);
    }
  }

  storage.set(STORAGE_KEYS.PUSH_TOKEN, token);

  // Register token with backend so it can send targeted pushes
  try {
    await api.post('/api/notifications/push-token', {
      address: stellarAddress,
      token,
      platform: Platform.OS,
    });
    storage.set(PUSH_TOKEN_ACCOUNT_KEY, stellarAddress);
  } catch (err) {
    // Non-fatal — token stored locally, backend registration is best-effort
    console.warn('[Notifications] Failed to register token with backend:', err);
  }

  return token;
}

/**
 * Unregisters the device's push token for the given account and clears the
 * local token-to-account association. Call on logout.
 */
export async function unregisterForPushNotifications(stellarAddress: string): Promise<void> {
  const token = storage.get(STORAGE_KEYS.PUSH_TOKEN);
  const storedAccount = storage.get(PUSH_TOKEN_ACCOUNT_KEY);

  if (token && storedAccount === stellarAddress) {
    try {
      await api.delete('/api/notifications/push-token', {
        address: stellarAddress,
        token,
      });
    } catch (err) {
      // Non-fatal — local association is still cleared below
      console.warn('[Notifications] Failed to unregister token with backend:', err);
    }
  }

  storage.remove(STORAGE_KEYS.PUSH_TOKEN);
  storage.remove(PUSH_TOKEN_ACCOUNT_KEY);
}

/**
 * Sets up notification response listener (user taps a notification).
 * Returns a cleanup function.
 */
export function setupNotificationListeners(
  onNotification: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void,
): () => void {
  const notifSub = Notifications.addNotificationReceivedListener(onNotification);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);

  return () => {
    notifSub.remove();
    responseSub.remove();
  };
}

/**
 * Schedules a local notification (used for offline reminders).
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: data ?? {} },
    trigger: null, // immediate
  });
}
