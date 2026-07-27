/**
 * ToastContext
 *
 * Provides global access to toast notifications.
 * Wrap your app with ToastProvider at the root level.
 * Supports 4 variants: success, error, warning, info
 * Max 3 toasts visible at once; older ones are queued
 *
 * @example
 * // In layout.jsx or app.jsx
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 *
 * @example
 * // In any component
 * const { showToast } = useToast();
 * showToast('Transaction successful!', 'success', 5000);
 * showToast('Failed to submit', 'error');
 * showToast('Warning: large amount', 'warning');
 */
'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/ui/Toast';

const ToastContext = createContext(null);
const MAX_VISIBLE_TOASTS = 3;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(
    (message, type = 'success', duration = 5000) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => {
        const updated = [...prev, { id, message, type, duration }];
        // Keep only the last 3 visible; older ones stay in queue
        return updated;
      });
    },
    [],
  );

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Show only the last MAX_VISIBLE_TOASTS
  const visibleToasts = toasts.slice(-MAX_VISIBLE_TOASTS);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
        {visibleToasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
