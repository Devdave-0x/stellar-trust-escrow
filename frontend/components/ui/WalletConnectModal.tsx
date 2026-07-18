'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useWallet, type WalletType } from '../providers/WalletContext';
import { cn } from '../../lib/utils';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect?: (type: WalletType) => void;
}

const wallets: { id: Exclude<WalletType, 'none'>; name: string; description: string }[] = [
  { id: 'freighter', name: 'Freighter', description: 'Browser extension wallet' },
  { id: 'ledger', name: 'Ledger', description: 'Hardware wallet' },
];

/**
 * Modal that lets the user connect a Stellar wallet. Connection state is read
 * from the shared `WalletContext` so the same component reflects a connecting,
 * connected, or disconnected session depending on context value.
 */
export default function WalletConnectModal({
  isOpen,
  onClose,
  onConnect,
}: WalletConnectModalProps) {
  const { isConnecting, walletType, address, connect } = useWallet();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) closeRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConnect = (type: Exclude<WalletType, 'none'>) => {
    onConnect?.(type);
    void connect(type);
  };

  const connected = Boolean(address);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-connect-title"
        className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between">
          <h2 id="wallet-connect-title" className="text-lg font-bold text-white">
            Connect a wallet
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close wallet connection dialog"
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            ✕
          </button>
        </div>

        {connected && (
          <p className="mt-2 break-all rounded-md bg-gray-800 px-3 py-2 font-mono text-xs text-green-300">
            Connected: {address}
            {walletType === 'ledger' && ' (Ledger)'}
          </p>
        )}

        <ul className="mt-4 space-y-3">
          {wallets.map((wallet) => {
            const isThisConnecting = isConnecting && walletType === wallet.id;
            return (
              <li key={wallet.id}>
                <button
                  type="button"
                  onClick={() => handleConnect(wallet.id)}
                  disabled={isConnecting}
                  aria-busy={isThisConnecting}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-left transition-colors hover:border-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
                    isConnecting && 'cursor-not-allowed opacity-70',
                  )}
                >
                  <span>
                    <span className="block text-sm font-semibold text-white">{wallet.name}</span>
                    <span className="block text-xs text-gray-400">{wallet.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-indigo-400">
                    {isThisConnecting ? 'Connecting…' : '→'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
