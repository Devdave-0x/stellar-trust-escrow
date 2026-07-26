/**
 * useKeyboardShortcut hook
 *
 * Registers a global keyboard shortcut and fires a callback when it's triggered.
 *
 * @param {string}   shortcut - Shortcut string, e.g. "Ctrl+K" or "Ctrl+Shift+P"
 * @param {function} callback - Function to call when the shortcut is pressed
 * @param {object}   [options]
 * @param {boolean}  [options.enabled=true] - Whether the shortcut is active
 */

import { useEffect } from 'react';

/**
 * Parse a shortcut string like "Ctrl+Shift+K" into modifier flags and the key.
 */
function parseShortcut(shortcut) {
  const parts = shortcut.split('+').map((p) => p.trim());
  const key = parts[parts.length - 1].toLowerCase();
  const ctrl = parts.some((p) => p.toLowerCase() === 'ctrl');
  const meta = parts.some((p) => p.toLowerCase() === 'meta' || p === '⌘');
  const shift = parts.some((p) => p.toLowerCase() === 'shift');
  const alt = parts.some((p) => p.toLowerCase() === 'alt');
  return { key, ctrl, meta, shift, alt };
}

export default function useKeyboardShortcut(shortcut, callback, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled || !shortcut) return;

    const parsed = parseShortcut(shortcut);

    const handler = (e) => {
      // On Mac, Ctrl in shortcut strings is treated as Cmd (metaKey)
      const isMac =
        typeof navigator !== 'undefined' &&
        /mac/i.test(navigator.platform || navigator.userAgent);

      const ctrlMatches = parsed.ctrl
        ? isMac
          ? e.metaKey
          : e.ctrlKey
        : !e.ctrlKey && !e.metaKey;
      const shiftMatches = parsed.shift ? e.shiftKey : !e.shiftKey;
      const altMatches = parsed.alt ? e.altKey : !e.altKey;
      const keyMatches = e.key.toLowerCase() === parsed.key;

      if (ctrlMatches && shiftMatches && altMatches && keyMatches) {
        e.preventDefault();
        callback(e);
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcut, callback, enabled]);
}
