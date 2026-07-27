/**
 * Tooltip Component
 *
 * Wraps a trigger element and shows a floating text panel on hover/focus.
 * - Auto-detect viewport edges and flip position (top/bottom/left/right)
 * - 300ms show delay, instant hide to prevent flickering
 * - Keyboard: visible when trigger has focus, hidden on Escape
 * - role="tooltip" and aria-describedby wiring
 *
 * @param {object}   props
 * @param {React.ReactNode} props.children - Trigger element
 * @param {string}   props.content - Tooltip text content
 * @param {string}   [props.className] - Additional classes on the tooltip panel
 */

'use client';

import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { cn } from '../../lib/utils';

const SHOW_DELAY_MS = 300;

const POSITION_CLASSES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

const ARROW_CLASSES = {
  top: 'top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800',
  left: 'left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-800',
  right: 'right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800',
};

const OPPOSITES = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/**
 * Determine the best position so the tooltip stays within the viewport.
 */
function getFlippedPosition(rect, tooltipWidth, tooltipHeight, preferred) {
  const margin = 8;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  const overflow = {
    top: rect.top - tooltipHeight - margin < 0,
    bottom: rect.bottom + tooltipHeight + margin > viewportH,
    left: rect.left - tooltipWidth - margin < 0,
    right: rect.right + tooltipWidth + margin > viewportW,
  };

  // Try preferred position first
  if (!overflow[preferred]) return preferred;

  // Try opposite
  const opposite = OPPOSITES[preferred];
  if (!overflow[opposite]) return opposite;

  // Try vertical alternatives
  if (preferred === 'top' || preferred === 'bottom') {
    if (!overflow.left) return 'left';
    if (!overflow.right) return 'right';
  } else {
    if (!overflow.top) return 'top';
    if (!overflow.bottom) return 'bottom';
  }

  return preferred;
}


export default function Tooltip({ children, content, className, position: preferredPosition = 'top' }) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState('top');
  const showTimerRef = useRef(null);
  const wrapperRef = useRef(null);
  const tooltipRef = useRef(null);

  const generatedId = useId();
  const tooltipId = `tooltip-${generatedId}`;

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearShowTimer();
    setIsVisible(false);
  }, [clearShowTimer]);

  const show = useCallback((immediate = false) => {
    clearShowTimer();
    if (immediate) {
      // Keyboard focus — show without delay for immediate accessibility
      if (wrapperRef.current && tooltipRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const best = getFlippedPosition(rect, tooltipRect.width, tooltipRect.height, preferredPosition);
        setPosition(best);
      }
      setIsVisible(true);
    } else {
      showTimerRef.current = setTimeout(() => {
        // Determine best position based on viewport
        if (wrapperRef.current && tooltipRef.current) {
          const rect = wrapperRef.current.getBoundingClientRect();
          const tooltipRect = tooltipRef.current.getBoundingClientRect();
          const best = getFlippedPosition(rect, tooltipRect.width, tooltipRect.height, preferredPosition);
          setPosition(best);
        }
        setIsVisible(true);
      }, SHOW_DELAY_MS);
    }
  }, [clearShowTimer, preferredPosition]);

  // Handle Escape key
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        hide();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, hide]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearShowTimer();
  }, [clearShowTimer]);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {/* Trigger wrapper */}
      <div
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        aria-describedby={isVisible ? tooltipId : undefined}
        tabIndex={0}
        role="button"
      >
        {children}
      </div>

      {/* Tooltip panel */}
      <div
        ref={tooltipRef}
        id={isVisible ? tooltipId : undefined}
        role="tooltip"
        aria-hidden={!isVisible}
        className={cn(
          'absolute z-50 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap',
          'border border-gray-700 shadow-lg pointer-events-none',
          'transition-opacity duration-150',
          POSITION_CLASSES[position],
          isVisible ? 'opacity-100' : 'opacity-0 invisible',
          className,
        )}
      >
        {content}
        <div className={cn('absolute', ARROW_CLASSES[position])} aria-hidden="true" />
      </div>
    </div>
  );
}
