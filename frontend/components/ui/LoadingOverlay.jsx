'use client';

/**
 * LoadingOverlay Component
 *
 * Full-page semi-transparent overlay with a centred spinner, optional message,
 * and optional progress bar (0–100). Prevents body scroll and traps focus
 * inside the overlay when visible.
 *
 * Accessibility: overlay has role="dialog" and aria-label="Loading".
 *
 * @param {object}  props
 * @param {boolean} props.isLoading     — controls visibility
 * @param {string}  [props.message]     — optional text shown below the spinner
 * @param {number}  [props.progress]    — 0–100 for a progress bar (undefined = indeterminate)
 */

import { useEffect, useRef } from 'react';
import Spinner from './Spinner';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function LoadingOverlay({ isLoading, message, progress }) {
  const overlayRef = useRef(null);
  const previousActiveElement = useRef(null);

  // Body scroll lock
  useEffect(() => {
    if (isLoading) {
      previousActiveElement.current = document.activeElement;
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      // Restore focus to the previously focused element
      if (previousActiveElement.current?.focus) {
        previousActiveElement.current.focus();
      }
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isLoading]);

  // Focus trap inside the overlay
  useEffect(() => {
    if (!isLoading) return;

    const overlay = overlayRef.current;
    if (!overlay) return;

    // Focus the overlay so keyboard events are captured
    overlay.focus();

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;

      const focusable = overlay.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLoading]);

  if (!isLoading) return null;

  const showProgress =
    typeof progress === 'number' && progress >= 0 && progress <= 100;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-label="Loading"
      aria-modal="true"
      tabIndex={-1}
      data-testid="loading-overlay"
    >
      <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-gray-900/90 border border-gray-800 shadow-2xl max-w-sm w-full mx-4">
        <Spinner size="lg" />

        {message && (
          <p className="text-gray-200 text-sm text-center font-medium">
            {message}
          </p>
        )}

        {showProgress && (
          <div className="w-full space-y-1.5">
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Loading progress: ${progress}%`}
              />
            </div>
            <p className="text-xs text-gray-500 text-center">{progress}%</p>
          </div>
        )}
      </div>
    </div>
  );
}
