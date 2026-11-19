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

import { useCallback, useEffect, useState } from 'react';
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

// Stable key used to persist a pending transaction across page reloads.
export const PENDING_TX_STORAGE_KEY = 'stellar-pending-tx';

// A stored pending transaction older than this is considered stale and discarded.
const PENDING_TX_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const HASH_REGEX = /^[0-9a-fA-F]{64}$/;

function isValidStoredTx(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.hash !== 'string' || !HASH_REGEX.test(value.hash)) return false;
  if (typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) return false;
  if (Date.now() - value.timestamp > PENDING_TX_MAX_AGE_MS) return false;
  return true;
}

function readPendingTx() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_TX_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidStoredTx(parsed)) {
      window.localStorage.removeItem(PENDING_TX_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      window.localStorage.removeItem(PENDING_TX_STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

function writePendingTx(pendingTx) {
  if (typeof window === 'undefined') return;
  try {
    if (pendingTx) {
      window.localStorage.setItem(PENDING_TX_STORAGE_KEY, JSON.stringify(pendingTx));
    } else {
      window.localStorage.removeItem(PENDING_TX_STORAGE_KEY);
    }
  } catch {
    // Storage may be unavailable (private mode, quota) — fail silently.
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

  // ── Pending transaction state (persisted across reloads) ───────────────────
  const [pendingTx, setPendingTx] = useState(null);
  const [pendingTxStatus, setPendingTxStatus] = useState('idle'); // idle | pending | confirmed | failed

  // ── Detect Freighter on mount ──────────────────────────────────────────────
  useEffect(() => {
    setFreighterInstalled(typeof window !== 'undefined' && !!window.freighter);
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

  // ── Restore pending transaction on mount ───────────────────────────────────
  useEffect(() => {
    const stored = readPendingTx();
    if (!stored) return;
    // Restore into state and resume polling — never resubmit the signed op.
    setPendingTx(stored);
    setPendingTxStatus('pending');
  }, []);

  // ── Poll for confirmation of the pending transaction ───────────────────────
  useEffect(() => {
    if (!pendingTx || pendingTxStatus !== 'pending') return;

    let cancelled = false;
    let timer = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/transactions/${pendingTx.hash}`);
        if (cancelled) return;

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const status = data?.status;
          if (status === 'success' || status === 'confirmed') {
            setPendingTxStatus('confirmed');
            setPendingTx(null);
            writePendingTx(null);
            return;
          }
          if (status === 'failed' || status === 'error') {
            setPendingTxStatus('failed');
            setPendingTx(null);
            writePendingTx(null);
            return;
          }
        } else if (res.status === 404) {
          // Unknown hash — discard without resubmitting.
          setPendingTxStatus('failed');
          setPendingTx(null);
          writePendingTx(null);
          return;
        }
      } catch {
        // Transient network error — keep polling.
      }

      if (!cancelled) {
        timer = setTimeout(poll, 5000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pendingTx, pendingTxStatus]);

  // ── Track a submitted transaction ──────────────────────────────────────────
  const trackPendingTx = useCallback((tx) => {
    if (!tx || typeof tx.hash !== 'string' || !HASH_REGEX.test(tx.hash)) return;
    const entry = {
      hash: tx.hash,
      escrowId: tx.escrowId ?? null,
      timestamp: Date.now(),
    };
    writePendingTx(entry);
    setPendingTx(entry);
    setPendingTxStatus('pending');
  }, []);

  const clearPendingTx = useCallback(() => {
    writePendingTx(null);
    setPendingTx(null);
    setPendingTxStatus('idle');
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    startConnect();
    try {
      if (!isFreighterInstalled) {
        throw new Error(
          `Freighter wallet not installed. Install it here: ${FREIGHTER_INSTALL_URL}`,
        );
      }

      await requestAccess();
      const pubKey = await getPublicKey();
      const networkDetails = await getNetworkDetails();

      finishConnect({
        address: pubKey,
        network: networkDetails.network === 'PUBLIC_NETWORK' ? 'mainnet' : 'testnet',
      });
    } catch (err) {
      const message =
        err.message === 'User rejected access'
          ? 'You declined wallet connection.'
          : err.message;
      setConnectError(message);
    }
  }, [isFreighterInstalled, startConnect, finishConnect, setConnectError]);

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
        const message =
          err.message === 'User rejected signing'
            ? 'Transaction signing was cancelled.'
            : `Signing failed: ${err.message}`;
        throw new Error(message);
      }
    },
    [isConnected, network, address],
  );

  return {
    address,
    network,
    isConnected,
    isFreighterInstalled,
    isConnecting,
    error,
    connect,
    disconnect,
    signTx,
    pendingTx,
    pendingTxStatus,
    trackPendingTx,
    clearPendingTx,
  };
}
