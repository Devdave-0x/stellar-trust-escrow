'use client';

/**
 * CopyButton
 *
 * Accessible, reusable copy-to-clipboard control used for wallet addresses,
 * escrow IDs, and transaction hashes throughout the app.
 *
 * - Keyboard accessible (native <button>, Enter/Space activates)
 * - Announces success to screen readers via a polite live region
 * - Falls back to a hidden-textarea copy strategy when the async
 *   Clipboard API is unavailable (older browsers / insecure contexts)
 * - Supports both `text` and `value` props, and both default and named
 *   exports, since existing call sites in the app use either form.
 *
 * @param {object}  props
 * @param {string}  [props.text]              - value to copy
 * @param {string}  [props.value]              - alias for `text`
 * @param {string}  [props.label='Copy']       - visible/announced label
 * @param {number}  [props.feedbackDuration=2000] - ms before reverting to the default label
 * @param {'sm'|'md'} [props.size='md']
 * @param {string}  [props.className]
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SIZE_CLASSES = {
  sm: 'text-xs px-1.5 py-1 gap-1',
  md: 'text-xs px-2 py-1.5 gap-1.5',
};

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

export function CopyButton({
  text,
  value,
  label = 'Copy',
  feedbackDuration = 2000,
  size = 'md',
  className = '',
}) {
  const copyValue = text ?? value ?? '';
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyValue);
      } else {
        fallbackCopy(copyValue);
      }
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), feedbackDuration);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [copyValue, feedbackDuration]);

  const displayText = copied ? 'Copied!' : label;
  const titleText = copied ? 'Copied!' : label === 'Copy' ? 'Copy' : `Copy ${label}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={titleText}
      aria-label={titleText}
      className={`inline-flex items-center rounded-md font-medium transition-colors
        text-gray-500 hover:text-gray-900 hover:bg-gray-100
        dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-white/10
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1
        ${copied ? 'text-emerald-600 dark:text-emerald-400' : ''}
        ${SIZE_CLASSES[size] ?? SIZE_CLASSES.md} ${className}`}
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
      <span>{displayText}</span>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}

export default CopyButton;
