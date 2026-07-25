'use client';

import { useCopyToClipboard } from '../../hooks/useCopyToClipboard';
import { Copy, Check } from 'lucide-react';

export default function CopyButton({ text, label = 'Copy', className = '' }) {
  const { copy, isCopied } = useCopyToClipboard();

  return (
    <button
      onClick={() => copy(text)}
      disabled={!text}
      aria-label={isCopied ? 'Copied!' : `Copy ${label}`}
      title={isCopied ? 'Copied!' : `Copy ${label}`}
      className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg
        bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200
        border border-gray-700 transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
        disabled:opacity-40 disabled:cursor-not-allowed
        ${className}`}
    >
      {isCopied ? (
        <>
          <Check size={14} aria-hidden="true" />
          <span
            className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap
              bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded-md border border-gray-700
              shadow-lg animate-slide-in"
            role="status"
            aria-live="polite"
          >
            Copied!
          </span>
        </>
      ) : (
        <Copy size={14} aria-hidden="true" />
      )}
    </button>
  );
}
