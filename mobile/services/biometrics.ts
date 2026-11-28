/**
 * Biometric Authentication Service
 *
 * Wraps expo-local-authentication to provide Face ID / Touch ID / Fingerprint
 * authentication before sensitive actions (viewing escrow details, signing txs).
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { storage, STORAGE_KEYS } from '../lib/storage';

/**
 * Typed biometric availability state.
 *
 * - `available`: hardware present, biometrics enrolled, ready to authenticate.
 * - `unsupported`: no biometric hardware on this device.
 * - `notEnrolled`: hardware present but no biometrics enrolled.
 * - `locked`: biometrics temporarily locked out (too many attempts, etc.).
 */
export type BiometricState = 'available' | 'unsupported' | 'notEnrolled' | 'locked';

/**
 * Safe fallback path offered when biometrics cannot be used.
 * Every fallback still requires the user to authenticate.
 */
export type BiometricFallback = 'pin' | 'walletReauth';

export interface BiometricAuthResult {
  /** Whether authentication ultimately succeeded. */
  success: boolean;
  /** The biometric state observed before/while authenticating. */
  state: BiometricState;
  /** Fallback path the caller should route to when `success` is false. */
  fallback: BiometricFallback | null;
}

/**
 * Maps a biometric state to the safe fallback path that still requires auth.
 * Returns `null` only for the `available` state (no fallback needed).
 */
export function getFallbackForState(state: BiometricState): BiometricFallback | null {
  switch (state) {
    case 'available':
      return null;
    case 'unsupported':
      // No biometric hardware at all: fall back to wallet re-auth.
      return 'walletReauth';
    case 'notEnrolled':
      // Hardware exists but nothing enrolled: device PIN is the natural path.
      return 'pin';
    case 'locked':
      // Temporarily locked out: use device PIN to recover.
      return 'pin';
    default:
      return 'walletReauth';
  }
}

/**
 * Determines the current biometric state from hardware/enrollment checks.
 */
export async function getBiometricState(): Promise<BiometricState> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return 'unsupported';

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return 'notEnrolled';

  return 'available';
}

/**
 * Maps an expo-local-authentication error code to a biometric state.
 * Returns `null` when the error does not indicate an availability problem.
 */
function stateFromErrorCode(error: string | undefined): BiometricState | null {
  switch (error) {
    case 'lockout':
    case 'lockout_permanent':
      return 'locked';
    case 'not_enrolled':
    case 'not_enrolled_error':
      return 'notEnrolled';
    case 'not_available':
    case 'not_supported':
    case 'no_hardware':
      return 'unsupported';
    default:
      return null;
  }
}

export async function isBiometricAvailable(): Promise<boolean> {
  const state = await getBiometricState();
  return state === 'available';
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

export async function authenticate(reason = 'Authenticate to continue'): Promise<boolean> {
  const available = await isBiometricAvailable();
  if (!available) return false; // fail-safe: reject if not available

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Use Passcode',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  return result.success;
}

export function isBiometricEnabled(): boolean {
  return storage.getBoolean(STORAGE_KEYS.BIOMETRIC_ENABLED) ?? false;
}

export function setBiometricEnabled(enabled: boolean): void {
  storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled);
}
