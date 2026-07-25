/**
 * Modal Component
 *
 * Accessible overlay modal with focus trapping, backdrop dismiss,
 * and keyboard (Escape) support.
 *
 * @param {object}          props
 * @param {boolean}         props.isOpen      — controls visibility
 * @param {Function}        props.onClose     — called when backdrop/Escape pressed
 * @param {string}          [props.title]     — modal heading
 * @param {React.ReactNode}  props.children
 * @param {'sm'|'md'|'lg'}  [props.size='md']
 * @param {boolean}         [props.isConfirmation] — shows confirm/cancel buttons
 * @param {Function}        [props.onConfirm] — called when confirm button clicked
 * @param {string}          [props.confirmLabel='Confirm'] — confirm button text
 * @param {string}          [props.cancelLabel='Cancel'] — cancel button text
 * @param {string}          [props.confirmVariant='primary'] — confirm button variant
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import Button from './Button';

// Selectors for all focusable elements within a modal
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  isConfirmation = false,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
}) {
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  // ── Focus trap: keep Tab / Shift+Tab cycling within the modal panel ─────
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll(FOCUSABLE);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if focus is on first element, wrap to last
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if focus is on last element, wrap to first
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  // ── On open: save current focus, move focus into modal ───────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Save the element that triggered the modal
    previousFocusRef.current = document.activeElement;

    // Small delay so the panel has rendered
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll(FOCUSABLE);
      if (focusable.length > 0) {
        /** @type {HTMLElement} */ (focusable[0]).focus();
      } else {
        // Fallback: focus the panel itself
        panel.focus();
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // ── On close: return focus to the triggering element ─────────────────────
  useEffect(() => {
    if (isOpen) return;
    // Return focus on next tick after unmount
    const prev = previousFocusRef.current;
    if (prev && typeof prev.focus === 'function') {
      setTimeout(() => prev.focus(), 0);
    }
  }, [isOpen]);

  // ── Keyboard listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // ── Prevent body scroll while open ───────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative w-full ${SIZE_CLASSES[size]} bg-gray-900 border border-gray-800
                    rounded-2xl shadow-2xl p-6 space-y-4`}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          {title && (
            <h2 id="modal-title" className="text-lg font-semibold text-white">
              {title}
            </h2>
          )}
          {/* Accessibility: aria-label describes action; focus-visible ring for keyboard users */}
          <button
            onClick={onClose}
            className="ml-auto text-gray-500 hover:text-white transition-colors p-1 rounded-lg
                       hover:bg-gray-800 focus:outline-none focus-visible:ring-2
                       focus-visible:ring-indigo-500 focus-visible:ring-offset-2
                       focus-visible:ring-offset-gray-900"
            aria-label="Close modal"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div>{children}</div>

        {/* Footer with Confirmation Buttons */}
        {isConfirmation && (
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-800">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button variant={confirmVariant} className="flex-1" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
