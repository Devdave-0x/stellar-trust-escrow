/**
 * useWallet Hook
 *
 * Manages Freighter wallet connection state across the app.
 * Use this hook in any component that needs wallet access.
 *
 * Returns:
 * {
 *   isConnected:  boolean
 *   address:      string | null       — connected Stellar public key
 *   network:      'testnet' | 'mainnet' | null
 *   connect:      () => Promise<void>
 *   disconnect:   () => void
 *   signTx:       (xdr: string) => Promise<string>  — returns signed XDR
 *   isFreighterInstalled: boolean
 *   error:        string | null
 *   recoveryMessage: string | null    — actionable recovery copy for the user
 *   recoveryAction:  'install' | 'retry' | null
 *   recoveryUrl:     string | null    — install URL when a provider is missing
 * }
 *
 * TODO (contributor — hard, Issue #35):
 * Implement this hook using the @stellar/freighter-api package:
 *
 * import {
 *   isConnected,
 *   getPublicKey,
 *   signTransaction,
 *   requestAccess,
 *   getNetworkDetails,
 * } from '@stellar/freighter-api';
 *
 * Steps:
 * 1. On mount, check if Freighter is installed (window.freighter exists)
 * 2. Check if already connected (isConnected())
 * 3. If connected, fetch address and network
 * 4. connect():
 *    a. Call requestAccess() to prompt Freighter connection popup
 *    b. Fetch and store public key
 *    c. Fetch and store network details
 * 5. disconnect(): clear state (Freighter doesn't have a disconnect API)
 * 6. signTx(xdr):
 *    a. Call signTransaction(xdr, { networkPassphrase, accountToSign })
 *    b. Return the signed XDR string
 *
 * Hints:
 * - Store address in React context (not just local state) so all components
 *   can access it without prop drilling. Wrap app in a WalletProvider.
 * - Persist connection state in localStorage so the user stays connected
 *   across page refreshes.
 * - Handle the case where Freighter is not installed: show install prompt.
 */

'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Networks } from '@stellar/stellar-sdk';
import {
  isConnected as freighterIsConnected,
  getPublicKey,
  signTransaction,
  requestAccess,
  getNetworkDetails,
} from '@stellar/freighter-api';
import { useWalletStore } from '../store/app-store';

const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/';

const NO_PROVIDER_MESSAGE =
  `No supported wallet provider was detected. Install Freighter at ${FREIGHTER_INSTALL_URL} ` +
  'and refresh the page, or select a supported wallet in your browser to continue.';

const PROVIDER_ERROR_MESSAGE =
  'Your wallet provider returned an error. Please try again, or select a supported wallet ' +
  `(e.g. Freighter at ${FREIGHTER_INSTALL_URL}) and reconnect.`;

/**
 * Safely checks whether the Freighter provider is present on window.
 * Never throws — returns false in non-browser environments.
 */
function detectFreighter() {
  try {
    return typeof window !== 'undefined' && !!window.freighter;
  } catch {
    return false;
  }
}

export function useWallet() {
  const {
    address,
    network,
    isConnected,
    isFreighterInstalled,
    isConnecting,
    error,
    setFreighterInstalled,
    startConnect,
    finishConnect,
    setConnectError,
    disconnect,
  } = useWalletStore();

  // ── Detect Freighter on mount ──────────────────────────────────────────────
  useEffect(() => {
    setFreighterInstalled(detectFreighter());
  }, [setFreighterInstalled]);

  // ── Auto-restore connection on mount ───────────────────────────────────────
  useEffect(() => {
    const restoreConnection = async () => {
      if (!isFreighterInstalled) return;

      try {
        if (await freighterIsConnected()) {
          const pubKey = await getPublicKey();
          const networkDetails = await getNetworkDetails();
          finishConnect({
            address: pubKey,
            network: networkDetails.network === 'PUBLIC_NETWORK' ? 'mainnet' : 'testnet',
          });
        }
      } catch {
        // Silent fail on restore — user can reconnect manually
      }
    };

    restoreConnection();
  }, [isFreighterInstalled, finishConnect]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    startConnect();

    // No provider available — surface actionable copy instead of throwing.
    if (!detectFreighter()) {
      setFreighterInstalled(false);
      setConnectError(NO_PROVIDER_MESSAGE);
      return;
    }

    try {
      await requestAccess();
      const pubKey = await getPublicKey();
      const networkDetails = await getNetworkDetails();

      finishConnect({
        address: pubKey,
        network: networkDetails.network === 'PUBLIC_NETWORK' ? 'mainnet' : 'testnet',
      });
    } catch (err) {
      const rawMessage = err && err.message ? err.message : String(err);

      let message;
      if (rawMessage === 'User rejected access') {
        message = 'You declined wallet connection.';
      } else if (
        /not installed|not available|no provider|undefined is not/i.test(rawMessage)
      ) {
        // Provider disappeared or is unsupported — treat as no-provider case.
        setFreighterInstalled(false);
        message = NO_PROVIDER_MESSAGE;
      } else {
        message = PROVIDER_ERROR_MESSAGE;
      }

      setConnectError(message);
    }
  }, [setFreighterInstalled, startConnect, finishConnect, setConnectError]);

  // ── Sign Transaction ───────────────────────────────────────────────────────
  /**
   * Signs a Stellar transaction XDR with the connected Freighter wallet.
   *
   * @param {string} unsignedXdr — base64-encoded unsigned transaction XDR
   * @returns {Promise<string>}  — base64-encoded signed transaction XDR
   *
   * TODO (contributor — Issue #35):
   * const signedXdr = await signTransaction(unsignedXdr, {
   *   networkPassphrase: network === 'testnet'
   *     ? Networks.TESTNET
   *     : Networks.PUBLIC,
   *   accountToSign: address,
   * });
   * return signedXdr;
   */
  const signTx = useCallback(
    async (unsignedXdr) => {
      if (!isConnected) throw new Error('Wallet not connected');

      try {
        const networkPassphrase =
          network === 'mainnet' ? Networks.PUBLIC_NETWORK : Networks.TESTNET_NETWORK;

        const signedXdr = await signTransaction(unsignedXdr, {
          networkPassphrase,
          accountToSign: address,
        });

        return signedXdr;
      } catch (err) {
        const rawMessage = err && err.message ? err.message : String(err);
        const message =
          rawMessage === 'User rejected signing'
            ? 'Transaction signing was cancelled.'
            : `Signing failed: ${rawMessage}`;
        throw new Error(message);
      }
    },
    [isConnected, network, address],
  );

  // ── Recovery copy ──────────────────────────────────────────────────────────
  // Derived (never thrown) so render is safe in no-provider / error states.
  const { recoveryMessage, recoveryAction, recoveryUrl } = useMemo(() => {
    if (error) {
      const isNoProvider = !isFreighterInstalled || error === NO_PROVIDER_MESSAGE;
      return {
        recoveryMessage: error,
        recoveryAction: isNoProvider ? 'install' : 'retry',
        recoveryUrl: isNoProvider ? FREIGHTER_INSTALL_URL : null,
      };
    }

    if (!isFreighterInstalled) {
      return {
        recoveryMessage: NO_PROVIDER_MESSAGE,
        recoveryAction: 'install',
        recoveryUrl: FREIGHTER_INSTALL_URL,
      };
    }

    return { recoveryMessage: null, recoveryAction: null, recoveryUrl: null };
  }, [error, isFreighterInstalled]);

  return {
    address,
    network,
    isConnected,
    isFreighterInstalled,
    isConnecting,
    error,
    recoveryMessage,
    recoveryAction,
    recoveryUrl,
    connect,
    disconnect,
    signTx,
  };
}
</｜｜DSML｜｜ parameter>
</｜｜DSML｜｜ invoke>
</｜｜DSML｜｜ calls>