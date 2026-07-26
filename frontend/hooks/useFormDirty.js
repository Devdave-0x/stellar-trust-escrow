'use client';

/**
 * useFormDirty Hook
 *
 * Tracks whether any form field has been changed from its initial value.
 * When isDirty is true:
 *  - Intercepts the browser's beforeunload event (tab close, refresh, external navigation)
 *  - Intercepts popstate (browser back/forward) and shows confirmation
 *
 * The guard is disabled after a successful form submission via submitForm().
 *
 * Usage:
 *   const { isDirty, markDirty, submitForm, resetForm } = useFormDirty();
 *
 *   // In your form, call markDirty() on any field change
 *   <input onChange={() => { handleChange(); markDirty(); }} />
 *
 *   // On successful submit
 *   await saveData();
 *   submitForm();
 *
 * @returns {{ isDirty: boolean, markDirty: () => void, submitForm: () => void, resetForm: () => void }}
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const CONFIRMATION_MESSAGE = 'You have unsaved changes. Leave anyway?';

export function useFormDirty() {
  const [isDirty, setIsDirty] = useState(false);
  const dirtyRef = useRef(false);
  const submittedRef = useRef(false);

  // Keep ref in sync with state for event handlers
  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  // beforeunload: tab close, refresh, external navigation
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (dirtyRef.current && !submittedRef.current) {
        e.preventDefault();
        // Modern browsers ignore custom messages; this line triggers the built-in dialog
        e.returnValue = CONFIRMATION_MESSAGE;
        return CONFIRMATION_MESSAGE;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // popstate: browser back/forward navigation
  useEffect(() => {
    const handlePopState = (e) => {
      if (dirtyRef.current && !submittedRef.current) {
        const confirmed = window.confirm(CONFIRMATION_MESSAGE);
        if (!confirmed) {
          // Push state back to prevent navigation
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const markDirty = useCallback(() => {
    if (!submittedRef.current) {
      setIsDirty(true);
    }
  }, []);

  const submitForm = useCallback(() => {
    submittedRef.current = true;
    setIsDirty(false);
    dirtyRef.current = false;
  }, []);

  const resetForm = useCallback(() => {
    submittedRef.current = false;
    setIsDirty(false);
    dirtyRef.current = false;
  }, []);

  return { isDirty, markDirty, submitForm, resetForm };
}
