import { cn } from '../../lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContainerProps {
  toasts: ToastItem[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  className?: string;
}

const positionClasses: Record<NonNullable<ToastContainerProps['position']>, string> = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
};

/**
 * Stacks multiple `Toast` notifications in a fixed corner. Each toast is
 * responsible for its own auto-dismiss; this container only lays them out and
 * forwards the close intent to `onClose`.
 */
export default function ToastContainer({
  toasts,
  onClose,
  position = 'top-right',
  className,
}: ToastContainerProps) {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className={cn(
        'pointer-events-none fixed z-50 flex w-full max-w-sm flex-col gap-3',
        positionClasses[position],
        className,
      )}
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastView message={toast.message} type={toast.type} onClose={() => onClose(toast.id)} />
        </div>
      ))}
    </div>
  );
}

// Re-exported lightweight renderer so the container does not depend on the
// auto-dismissing behaviour of the standalone Toast during composition.
function ToastView({
  message,
  type,
  onClose,
}: {
  message: string;
  type: ToastType;
  onClose: () => void;
}) {
  const icons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    warning: '!',
    info: 'i',
  };
  const colors: Record<ToastType, string> = {
    success: 'border-green-500 text-green-400',
    error: 'border-red-500 text-red-400',
    warning: 'border-yellow-500 text-yellow-400',
    info: 'border-blue-500 text-blue-400',
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex items-center gap-3 rounded-lg border-l-4 bg-gray-900 px-4 py-3 shadow-lg',
        colors[type],
      )}
    >
      <span aria-hidden="true" className="text-sm font-bold">
        {icons[type]}
      </span>
      <p className="flex-1 text-sm font-medium text-white">{message}</p>
      <button
        onClick={onClose}
        aria-label="Close notification"
        className="text-gray-400 transition-colors hover:text-white"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
