'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const NotificationContext = createContext(null);

export const ESCROW_EVENT_TYPES = {
  CREATED: 'escrow_created',
  FUNDED: 'escrow_funded',
  MILESTONE_SUBMITTED: 'milestone_submitted',
  MILESTONE_APPROVED: 'milestone_approved',
  DISPUTE_OPENED: 'dispute_opened',
  DISPUTE_RESOLVED: 'dispute_resolved',
  RELEASED: 'escrow_released',
  CANCELLED: 'escrow_cancelled',
};

let nextId = 1;

/**
 * App-wide store for escrow lifecycle notifications (created, funded,
 * milestone submitted/approved, disputed, released, cancelled, ...).
 * Consume with `useNotifications()`; render with `NotificationBell`.
 */
export function NotificationProvider({ children, initialNotifications = [] }) {
  const [notifications, setNotifications] = useState(initialNotifications);

  const addNotification = useCallback((notification) => {
    setNotifications((prev) => [
      {
        id: `notif-${nextId++}`,
        read: false,
        createdAt: new Date().toISOString(),
        type: ESCROW_EVENT_TYPES.CREATED,
        title: '',
        message: '',
        ...notification,
      },
      ...prev,
    ]);
  }, []);

  const markAsRead = useCallback((id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      dismiss,
      clearAll,
    }),
    [notifications, unreadCount, addNotification, markAsRead, markAllAsRead, dismiss, clearAll],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
