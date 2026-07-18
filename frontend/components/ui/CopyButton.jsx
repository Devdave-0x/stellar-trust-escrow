'use client';
import { useState } from 'react';

// TOUCH AUDIT (Issue #1444): the copy button enforces a minimum 44x44px hit
// area via `min-h-touch min-w-touch` and renders a visible text label so it is
// both tappable and screen-reader friendly on mobile. Accepts either `value`
// (production callers) or `text` (legacy/test callers) for the string to copy.
export function CopyButton({ value, text, label, feedbackDuration = 2000 }) {
  const [copied, setCopied] = useState(false);
  const content = value ?? text ?? '';
  const displayLabel = label ?? 'Copy';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), feedbackDuration);
    } catch (err) {
      // Clipboard access can be blocked (insecure context / permissions).
      // eslint-disable-next-line no-console
      console.error('Failed to copy:', err);
    }
  };

  const accessibleName = copied ? 'Copied!' : `Copy ${displayLabel}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={accessibleName}
      aria-label={accessibleName}
      className="min-h-touch min-w-touch inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-sm text-gray-400 hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      {copied ? 'Copied!' : displayLabel}
    </button>
  );
}

export default CopyButton;
