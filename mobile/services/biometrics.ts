/**
 * Biometric Authentication Service
 *
 * Wraps expo-local-authentication to provide Face ID / Touch ID / Fingerprint
 * authentication before sensitive actions (viewing escrow details, signing txs).
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { storage, STORAGE_KEYS } from '../lib/storage';

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function getSupportedBiometricTypes(): Promise<string[]> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  return types.map((t) => {
    switch (t) {
      case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
        return 'Face ID';
      case LocalAuthentication.AuthenticationType.FINGERPRINT:
        return 'Fingerprint';
      case LocalAuthentication.AuthenticationType.IRIS:
        return 'Iris';
      default:
        return 'Biometric';
    }
  });
}

export interface AuthResult {
  success: boolean;
  error?: 'not_available' | 'not_enrolled' | 'cancelled' | 'lockout' | 'unknown';
  message?: string;
}

export async function authenticate(reason = 'Authenticate to continue'): Promise<AuthResult> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) {
    return {
      success: false,
      error: 'not_available',
      message: 'Biometric hardware not available on this device',
    };
  }

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    return {
      success: false,
      error: 'not_enrolled',
      message: 'No biometrics enrolled — enable Face ID or Fingerprint in device settings',
    };
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Use Passcode',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  if (result.success) return { success: true };

  // Map expo-local-authentication error codes to actionable messages
  const errorCode = result.error as string | undefined;
  if (errorCode === 'user_cancel' || errorCode === 'app_cancel') {
    return { success: false, error: 'cancelled', message: 'Authentication cancelled' };
  }
  if (errorCode === 'lockout' || errorCode === 'lockout_permanent') {
    return {
      success: false,
      error: 'lockout',
      message: 'Too many failed attempts — use your device passcode to unlock',
    };
  }
  return { success: false, error: 'unknown', message: result.error ?? 'Authentication failed' };
}

export async function authenticateOrThrow(reason?: string): Promise<void> {
  const result = await authenticate(reason);
  if (!result.success) {
    throw new Error(result.message ?? 'Biometric authentication failed');
  }
}

export function isBiometricEnabled(): boolean {
  return storage.getBoolean(STORAGE_KEYS.BIOMETRIC_ENABLED) ?? false;
}

export function setBiometricEnabled(enabled: boolean): void {
  storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled);
}
