'use client';

import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { truncateAddress } from '../../lib/truncateAddress';
import { Copy, Check } from 'lucide-react';

export default function TruncatedAddress({ address, className = '' }) {
  const { copy, isCopied } = useCopyToClipboard();
  const truncated = truncateAddress(address);

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => copy(address)}
        title={isCopied ? 'Copied!' : address}
        aria-label={`Copy address ${address}`}
        className="font-mono text-sm hover:text-indigo-300 focus-visible:outline-none
          focus-visible:ring-1 focus-visible:ring-indigo-500 rounded
          transition-colors cursor-pointer"
      >
        <span className={isCopied ? 'text-emerald-400' : 'text-indigo-400'}>
          {isCopied ? '✓ Copied' : truncated}
        </span>
      </button>
      <button
        onClick={() => copy(address)}
        aria-label={`Copy address ${address}`}
        className="inline-flex items-center justify-center w-6 h-6 rounded
          bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200
          border border-gray-700 transition-colors
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
      >
        {isCopied ? (
          <Check size={12} aria-hidden="true" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
