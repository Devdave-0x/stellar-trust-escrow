/**
 * Tooltip Component
 *
 * Tooltip that appears on hover/focus above the trigger element.
 * Optionally displays a keyboard shortcut hint inside the tooltip and registers
 * that shortcut globally so it fires the trigger's onClick handler.
 *
 * @param {object}   props
 * @param {React.ReactNode} props.children  - Trigger element
 * @param {string}   props.content          - Tooltip text content
 * @param {string}   [props.position='top'] - Tooltip position: top | bottom | left | right
 * @param {string}   [props.shortcut]       - Keyboard shortcut hint, e.g. "Ctrl+K"
 * @param {function} [props.onClick]        - Handler fired both on click and via keyboard shortcut
 */

'use client';

import { useState } from 'react';
import useKeyboardShortcut from '../../hooks/useKeyboardShortcut';

/**
 * On Mac, replace the "Ctrl" modifier with the ⌘ symbol so the displayed hint
 * matches what the user actually presses.
 */
function formatShortcut(shortcut) {
  if (typeof navigator === 'undefined') return shortcut;
  const isMac = /mac/i.test(navigator.platform || navigator.userAgent);
  if (!isMac) return shortcut;
  return shortcut.replace(/\bCtrl\b/gi, '⌘');
}

export default function Tooltip({
  children,
  content,
  position = 'top',
  shortcut,
  onClick,
}) {
  const [isVisible, setIsVisible] = useState(false);

  // Register the keyboard shortcut and fire the onClick handler when triggered
  useKeyboardShortcut(shortcut, (e) => {
    if (onClick) onClick(e);
  }, { enabled: Boolean(shortcut && onClick) });

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const displayedShortcut = shortcut ? formatShortcut(shortcut) : null;

  return (
    <div className="relative inline-block group">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        onClick={onClick}
        tabIndex={0}
        role="button"
      >
        {children}
      </div>

      <div
        className={`absolute ${positionClasses[position]} left-1/2 -translate-x-1/2 z-50
                     bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap
                     border border-gray-700 shadow-lg pointer-events-none
                     ${isVisible ? 'opacity-100' : 'opacity-0 invisible'} transition-opacity`}
        role="tooltip"
        aria-hidden={!isVisible}
      >
        <span>{content}</span>

        {displayedShortcut && (
          <kbd
            className="ml-2 inline-flex items-center rounded border border-gray-500
                       bg-gray-700 px-1.5 py-0.5 font-mono text-[10px] text-gray-300"
          >
            {displayedShortcut}
          </kbd>
        )}

        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </div>
    </div>
  );
}
