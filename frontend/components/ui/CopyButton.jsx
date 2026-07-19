'use client';
import { useState } from 'react';

export function CopyButton({ text, label = 'Copy', feedbackDuration = 2000 }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), feedbackDuration);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <button
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      title={copied ? 'Copied!' : `Copy ${label}`}
      className="ml-1 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      {copied ? (
        <span className="text-green-500 text-xs font-medium">Copied!</span>
      ) : (
        <>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span className="ml-1">{label}</span>
        </>
      )}
    </button>
  );
}

export default CopyButton;
