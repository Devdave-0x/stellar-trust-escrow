'use client';

import { useState, useCallback } from 'react';

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function useCopyToClipboard(feedbackDuration = 2000) {
  const [isCopied, setIsCopied] = useState(false);

  const copy = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        if (!fallbackCopy(text)) {
          console.error('Failed to copy:', err);
          return;
        }
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), feedbackDuration);
    },
    [feedbackDuration],
  );

  return { copy, isCopied };
}
