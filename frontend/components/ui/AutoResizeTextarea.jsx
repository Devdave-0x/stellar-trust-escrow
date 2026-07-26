/**
 * AutoResizeTextarea
 *
 * A textarea that grows vertically as the user types, within configurable
 * min/max row bounds. Uses a hidden mirror element to measure content height
 * — no ResizeObserver needed.
 *
 * @param {object}   props
 * @param {number}   [props.minRows=2]    — minimum visible rows
 * @param {number}   [props.maxRows=8]    — maximum visible rows; beyond this, scroll
 * @param {string}   [props.className]
 * @param {string}   [props.value]        — controlled value
 * @param {Function} [props.onChange]     — change handler
 * @param {...any}   rest forwarded to <textarea>
 *
 * @example
 * <AutoResizeTextarea
 *   value={bio}\n *   onChange={(e) => setBio(e.target.value)}
 *   placeholder="Tell us about yourself..."
 *   minRows={3}
 *   maxRows={6}
 * />
 */

'use client';

import { useRef, useEffect, useCallback } from 'react';

export default function AutoResizeTextarea({
  minRows = 2,
  maxRows = 8,
  className = '',
  value,
  onChange,
  ...rest
}) {
  const textareaRef = useRef(null);
  const mirrorRef = useRef(null);

  const syncHeight = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    // Match mirror width to textarea for accurate wrapping
    mirror.style.width = `${textarea.clientWidth}px`;

    // Reset mirror height so we get an accurate scrollHeight
    mirror.style.height = '0px';

    // Mirror should have the same text content as the textarea
    mirror.textContent = (value ?? '') + ' '; // extra space accounts for line-break

    const scrollHeight = mirror.scrollHeight;
    const style = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 20;

    const minHeight = minRows * lineHeight;
    const maxHeight = maxRows * lineHeight;

    // Clamp height between min and max
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, minRows, maxRows]);

  // Sync on mount and whenever value changes
  useEffect(() => {
    syncHeight();
  }, [syncHeight]);

  // Also sync on window resize (font changes, etc.)
  useEffect(() => {
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, [syncHeight]);

  // Base styles shared between textarea and mirror for accurate measurement
  const baseStyles =
    'w-full px-4 py-2.5 border border-transparent rounded-lg whitespace-pre-wrap break-words';

  return (
    <div className="relative">
      {/* Hidden mirror element for measuring content height */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className={[
          'absolute top-0 left-0 invisible pointer-events-none',
          baseStyles,
          className,
        ].join(' ')}
        style={{
          width: '100%',
          font: 'inherit',
          letterSpacing: 'inherit',
          wordSpacing: 'inherit',
        }}
      />

      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChange}
        rows={minRows}
        className={[
          'w-full resize-none overflow-hidden bg-gray-800 border border-gray-700',
          'rounded-lg px-4 py-2.5 text-white placeholder-gray-500',
          'focus:outline-none focus:border-indigo-500 transition-colors',
          className,
        ].join(' ')}
        {...rest}
      />
    </div>
  );
}
