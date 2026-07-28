'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotifications, ESCROW_EVENT_TYPES } from '../../contexts/NotificationContext';
import { useRelativeTime } from '../../hooks/useRelativeTime';
import { cn } from '../../lib/utils';

const EVENT_META = {
  [ESCROW_EVENT_TYPES.CREATED]: { icon: '✚', color: 'text-blue-600 dark:text-blue-400' },
  [ESCROW_EVENT_TYPES.FUNDED]: { icon: '💰', color: 'text-green-600 dark:text-green-400' },
  [ESCROW_EVENT_TYPES.MILESTONE_SUBMITTED]: {
    icon: '📤',
    color: 'text-indigo-600 dark:text-indigo-400',
  },
  [ESCROW_EVENT_TYPES.MILESTONE_APPROVED]: {
    icon: '✔',
    color: 'text-green-600 dark:text-green-400',
  },
  [ESCROW_EVENT_TYPES.DISPUTE_OPENED]: { icon: '⚠', color: 'text-amber-600 dark:text-amber-400' },
  [ESCROW_EVENT_TYPES.DISPUTE_RESOLVED]: {
    icon: '⚖',
    color: 'text-amber-600 dark:text-amber-400',
  },
  [ESCROW_EVENT_TYPES.RELEASED]: { icon: '🏁', color: 'text-green-600 dark:text-green-400' },
  [ESCROW_EVENT_TYPES.CANCELLED]: { icon: '✕', color: 'text-red-600 dark:text-red-400' },
};

function NotificationItem({ notification, onMarkAsRead, onDismiss }) {
  const meta = EVENT_META[notification.type] ?? { icon: '🔔', color: 'text-gray-500' };
  const timeLabel = useRelativeTime(notification.createdAt);

  return (
    <li
      className={cn(
        'flex gap-3 border-b border-gray-100 dark:border-gray-800 px-4 py-3 last:border-b-0',
        !notification.read && 'bg-indigo-50/60 dark:bg-indigo-900/10',
      )}
    >
      <span aria-hidden="true" className={cn('text-lg leading-none', meta.color)}>
        {meta.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {notification.title}
        </p>
        {notification.message && (
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            {notification.message}
          </p>
        )}
        <div className="mt-1 flex items-center gap-3">
          <time className="text-xs text-gray-400 dark:text-gray-500">{timeLabel}</time>
          {!notification.read && (
            <button
              type="button"
              onClick={() => onMarkAsRead(notification.id)}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
            >
              Mark as read
            </button>
          )}
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
          >
            Dismiss
          </button>
        </div>
      </div>
      {!notification.read && (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden="true" />
      )}
    </li>
  );
}

/**
 * Bell trigger + dropdown panel showing escrow lifecycle notifications.
 * Fully keyboard operable (Escape closes, focus returns to the trigger)
 * and screen-reader friendly (aria-live region announces the unread count).
 */
export default function NotificationBell({ className }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismiss, clearAll } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const handleClickOutside = (event) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target) &&
        !buttonRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notification-center-panel"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {unreadCount > 0 ? `${unreadCount} unread notifications` : ''}
      </span>

      {open && (
        <div
          id="notification-center-panel"
          ref={panelRef}
          role="region"
          aria-label="Notification center"
          className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Notifications
            </h2>
            <div className="flex gap-3">
              {notifications.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                  >
                    Mark all read
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onDismiss={dismiss}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
