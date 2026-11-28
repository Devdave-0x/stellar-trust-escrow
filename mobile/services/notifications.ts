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

/**
 * Result of a push-notification permission request.
 * - `granted`: whether the OS currently allows notifications.
 * - `canAskAgain`: whether the platform prompt can still be shown.
 * - `unavailable`: true when push is unsupported (e.g. simulator / web).
 */
export interface PushPermissionResult {
  granted: boolean;
  canAskAgain: boolean;
  unavailable: boolean;
}

/**
 * Presents the rationale for notifications and, only if the user agrees,
 * triggers the platform permission prompt. This must be called from an
 * explicit user action (e.g. tapping an "Enable notifications" button) —
 * never implicitly at startup.
 *
 * @param confirm Rationale UI hook. Resolves to true if the user accepts.
 */
export async function requestPushPermissionWithRationale(
  confirm: () => Promise<boolean> | boolean,
): Promise<PushPermissionResult> {
  if (!Device.isDevice) {
    console.warn('[Notifications] Push notifications require a physical device.');
    return { granted: false, canAskAgain: false, unavailable: true };
  }

  const { status: existingStatus, canAskAgain: existingCanAskAgain } =
    await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') {
    return { granted: true, canAskAgain: existingCanAskAgain ?? true, unavailable: false };
  }

  // Only prompt after the user has explicitly acknowledged the rationale.
  const accepted = await confirm();
  if (!accepted) {
    return {
      granted: false,
      canAskAgain: existingCanAskAgain ?? true,
      unavailable: false,
    };
  }

  const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
  return {
    granted: status === 'granted',
    canAskAgain: canAskAgain ?? false,
    unavailable: false,
  };
}

/**
 * Opens the OS notification settings so the user can revisit a denied
 * permission. Returns whether the settings screen could be opened.
 */
export async function openNotificationSettings(): Promise<boolean> {
  try {
    await Linking.openSettings();
    return true;
  } catch (err) {
    console.warn('[Notifications] Failed to open settings:', err);
    return false;
  }
}

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
  storage.set(STORAGE_KEYS.PUSH_TOKEN, token);

  // Register token with backend so it can send targeted pushes
  try {
    await api.post('/api/notifications/push-token', {
      address: stellarAddress,
      token,
      platform: Platform.OS,
    });
  } catch (err) {
    // Non-fatal — token stored locally, backend registration is best-effort
    console.warn('[Notifications] Failed to register token with backend:', err);
  }

  return token;
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
