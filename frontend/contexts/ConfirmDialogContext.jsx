'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

const ConfirmDialogContext = createContext(null);

const DEFAULT_STATE = {
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
};

/**
 * App-wide confirmation dialog provider.
 *
 * Wrap the app once, then anywhere a destructive action needs a confirmation
 * step, call `useConfirm()` instead of building a bespoke modal:
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({
 *     title: 'Delete API key',
 *     message: 'This cannot be undone. Requests using this key will start failing immediately.',
 *     confirmLabel: 'Delete key',
 *     danger: true,
 *   });
 *   if (ok) await deleteKey(id);
 */
export function ConfirmDialogProvider({ children }) {
  const [state, setState] = useState(DEFAULT_STATE);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ ...DEFAULT_STATE, ...options, open: true });
    });
  }, []);

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.title}
        message={state.message}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        danger={state.danger}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmDialogContext.Provider>
  );
}

/**
 * @returns {(options: { title: string, message: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean }) => Promise<boolean>}
 */
export function useConfirm() {
  const context = useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return context;
}
