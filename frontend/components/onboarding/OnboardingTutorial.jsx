'use client';

/**
 * OnboardingTutorial
 *
 * First-time user onboarding modal. Walks new users through the core
 * Trustchain Escrow concepts (connecting a wallet, creating an escrow,
 * releasing/disputing funds, tracking activity) in a small step-by-step
 * wizard. Shown automatically on first visit (tracked via localStorage)
 * and re-launchable at any time via the `Replay tutorial` trigger exposed
 * through the `useOnboardingTutorial` hook.
 *
 * Fully keyboard navigable (Tab / Shift+Tab / Escape / Arrow keys) and
 * screen-reader friendly (role="dialog", aria-modal, live region for the
 * step counter).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import Button from '../ui/Button';

const STORAGE_KEY = 'trustchain_onboarding_completed_v1';

export const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Trustchain Escrow',
    body: 'Trustchain Escrow lets buyers and sellers transact with confidence — funds are locked on-chain until both parties agree the work is done.',
    icon: '👋',
  },
  {
    id: 'wallet',
    title: 'Connect your wallet',
    body: 'Connect a Stellar wallet (Freighter, Albedo, xBull, or Rabet) to sign transactions. Your keys never leave your device.',
    icon: '🔗',
  },
  {
    id: 'create',
    title: 'Create an escrow',
    body: 'Define the terms, deposit funds, and invite a counterparty. Funds are held safely by the smart contract until release conditions are met.',
    icon: '📝',
  },
  {
    id: 'track',
    title: 'Track every step',
    body: 'Follow live transaction status, milestones, and dispute resolution from your dashboard — nothing happens without a clear on-chain record.',
    icon: '📊',
  },
  {
    id: 'done',
    title: "You're all set",
    body: 'That covers the basics. You can replay this tutorial anytime from Settings → Help.',
    icon: '🎉',
  },
];

export function useOnboardingTutorial() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const completed = window.localStorage.getItem(STORAGE_KEY);
    if (!completed) setIsOpen(true);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, []);

  return { isOpen, open, close };
}

export default function OnboardingTutorial({ isOpen, onClose, steps = ONBOARDING_STEPS }) {
  const [stepIndex, setStepIndex] = useState(0);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const step = steps[stepIndex];

  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [steps.length]);

  const goPrev = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleFinish = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleFinish();
      } else if (event.key === 'ArrowRight') {
        if (!isLast) goNext();
      } else if (event.key === 'ArrowLeft') {
        if (!isFirst) goPrev();
      } else if (event.key === 'Tab') {
        // Simple focus trap within the dialog.
        const focusable = dialogRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFirst, isLast, goNext, goPrev, handleFinish]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      data-testid="onboarding-tutorial"
    >
      <div
        className="absolute inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm"
        onClick={handleFinish}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6
                   shadow-2xl dark:border-gray-800 dark:bg-gray-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">
              {step.icon}
            </span>
            <h2
              id="onboarding-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              {step.title}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleFinish}
            aria-label="Close onboarding tutorial"
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100
                       hover:text-gray-700 focus:outline-none focus-visible:ring-2
                       focus-visible:ring-indigo-500 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            ✕
          </button>
        </div>

        <p id="onboarding-body" className="mt-4 text-sm text-gray-600 dark:text-gray-300">
          {step.body}
        </p>

        {/*
          Decorative progress dots. They were previously role="tab" inside a
          role="tablist", but they are not focusable and control no tab panels,
          so the ARIA was invalid. The visible "Step N of M" live region below
          carries the same information for assistive tech.
        */}
        <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                'h-1.5 w-6 rounded-full transition-colors',
                i === stepIndex
                  ? 'bg-indigo-600 dark:bg-indigo-500'
                  : 'bg-gray-200 dark:bg-gray-700',
              )}
            />
          ))}
        </div>

        <p
          className="mt-2 text-center text-xs text-gray-600 dark:text-gray-400"
          role="status"
          aria-live="polite"
        >
          Step {stepIndex + 1} of {steps.length}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          {!isFirst && (
            <Button variant="secondary" className="flex-1" onClick={goPrev}>
              Back
            </Button>
          )}
          {!isFirst && !isLast && <span className="hidden sm:block sm:flex-1" aria-hidden="true" />}
          {!isLast ? (
            <Button variant="primary" className="flex-1" onClick={goNext} autoFocus={isFirst}>
              Next
            </Button>
          ) : (
            <Button variant="primary" className="flex-1" onClick={handleFinish}>
              Get started
            </Button>
          )}
          {isFirst && (
            <button
              type="button"
              onClick={handleFinish}
              className="text-sm text-gray-500 underline-offset-2 hover:underline dark:text-gray-400 sm:flex-none sm:self-center"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
