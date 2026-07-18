import { cn } from '../../lib/utils';

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  escrowId?: string;
  escrowLink?: string;
}

interface NotificationItemProps {
  notification: NotificationData;
  onOpen?: (id: string) => void;
  onMarkRead?: (id: string) => void;
}

/**
 * A single notification row. The read/unread state is conveyed with a visible
 * dot AND a text label so it is not dependent on colour alone.
 */
export default function NotificationItem({
  notification,
  onOpen,
  onMarkRead,
}: NotificationItemProps) {
  const { id, title, body, timestamp, read, escrowId } = notification;

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        read ? 'border-gray-700 bg-gray-800/40' : 'border-indigo-600 bg-indigo-950/30',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
          read ? 'bg-gray-600' : 'bg-indigo-400',
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          <span className="shrink-0 text-xs text-gray-500">{timestamp}</span>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">{body}</p>
        {escrowId && (
          <p className="mt-1 text-xs text-indigo-400">
            Related escrow: <span className="font-mono">{escrowId}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {!read && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300">
            New
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpen?.(id)}
          className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Open
        </button>
        {!read && (
          <button
            type="button"
            onClick={() => onMarkRead?.(id)}
            className="text-[10px] text-gray-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            Mark read
          </button>
        )}
      </div>
    </li>
  );
}
