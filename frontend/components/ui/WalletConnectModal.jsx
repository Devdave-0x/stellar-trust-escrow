'use client';

/**
 * WalletConnectModal
 *
 * Lets the user pick which Stellar wallet extension to connect with.
 * Freighter is fully wired through useWallet(); the remaining wallets are
 * listed (so users know they're on the roadmap) but disabled until their
 * connectors are implemented, rather than silently pretending to work.
 *
 * @param {object}   props
 * @param {boolean}  props.isOpen
 * @param {Function} props.onClose
 * @param {object}   props.wallet          — return value of useWallet()
 * @param {Function} [props.onConnected]   — called after a successful connect
 */

import { useEffect, useState } from 'react';
import Modal from './Modal';
import Spinner from './Spinner';
import { cn } from '../../lib/utils';

export const SUPPORTED_WALLETS = [
  {
    id: 'freighter',
    name: 'Freighter',
    description: 'Browser extension wallet for Stellar',
    icon: '🚀',
    available: true,
  },
  {
    id: 'albedo',
    name: 'Albedo',
    description: 'Sign in with your Stellar account, no install required',
    icon: '⭐',
    available: false,
  },
  {
    id: 'xbull',
    name: 'xBull',
    description: 'Multi-chain wallet with Stellar support',
    icon: '🐂',
    available: false,
  },
  {
    id: 'rabet',
    name: 'Rabet',
    description: 'Lightweight Stellar wallet extension',
    icon: '🦊',
    available: false,
  },
  {
    id: 'lobstr',
    name: 'LOBSTR',
    description: 'Connect via the LOBSTR signing service',
    icon: '🦞',
    available: false,
  },
];

export default function WalletConnectModal({ isOpen, onClose, wallet, onConnected }) {
  const [connectingId, setConnectingId] = useState(null);
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (!isOpen) {
      setConnectingId(null);
      setLocalError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (connectingId === 'freighter' && wallet?.isConnected) {
      setConnectingId(null);
      onConnected?.('freighter');
      onClose();
    }
  }, [connectingId, wallet?.isConnected, onConnected, onClose]);

  useEffect(() => {
    if (connectingId === 'freighter' && wallet?.error) {
      setLocalError(wallet.error);
      setConnectingId(null);
    }
  }, [connectingId, wallet?.error]);

  const handleSelect = async (walletOption) => {
    if (!walletOption.available || connectingId) return;
    setLocalError(null);

    if (walletOption.id === 'freighter') {
      setConnectingId('freighter');
      await wallet?.connect?.();
      return;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect a wallet" size="sm">
      <p className="mb-4 text-sm text-gray-400">
        Choose a Stellar wallet to connect to Trustchain Escrow.
      </p>

      {localError && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-red-800 bg-red-950/30 p-3 text-sm text-red-300"
        >
          {localError}
        </div>
      )}

      <ul className="space-y-2" aria-label="Available wallets">
        {SUPPORTED_WALLETS.map((walletOption) => {
          const isConnectingThis = connectingId === walletOption.id;
          return (
            <li key={walletOption.id}>
              <button
                type="button"
                onClick={() => handleSelect(walletOption)}
                disabled={!walletOption.available || Boolean(connectingId)}
                aria-disabled={!walletOption.available || Boolean(connectingId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                  walletOption.available
                    ? 'border-gray-700 hover:border-indigo-500 hover:bg-gray-800'
                    : 'cursor-not-allowed border-gray-800 opacity-50',
                )}
              >
                <span className="text-2xl" aria-hidden="true">
                  {walletOption.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-white">{walletOption.name}</span>
                    {!walletOption.available && (
                      <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {walletOption.description}
                  </span>
                </span>
                {isConnectingThis && <Spinner size="sm" label="Connecting…" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
