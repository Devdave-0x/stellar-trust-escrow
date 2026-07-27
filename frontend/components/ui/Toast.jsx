/**
 * Toast Component
 *
 * A notification toast that appears to inform users of success or error states.
 * Auto-dismisses after a timeout and can be manually closed.
 * Supports 4 variants: success, error, warning, info.
 * Includes a visible progress bar showing time until auto-dismiss.
 *
 * @param {object} props
 * @param {string} props.message - The message to display
 * @param {'success' | 'error' | 'warning' | 'info'} props.type - Type of toast
 * @param {Function} props.onClose - Callback when toast is closed
 * @param {number} [props.duration=5000] - Auto-dismiss duration in ms
 */

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose, duration = 5000 }) {
  const [remainingTime, setRemainingTime] = useState(duration);

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    const interval = setInterval(() => {
      setRemainingTime((prev) => Math.max(prev - 50, 0));
    }, 50);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-500" />,
    error: <XCircle className="w-5 h-5 text-red-500" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
    info: <Info className="w-5 h-5 text-blue-500" />,
  };

  const bgColors = {
    success: 'bg-gray-900 border-green-500',
    error: 'bg-gray-900 border-red-500',
    warning: 'bg-gray-900 border-yellow-500',
    info: 'bg-gray-900 border-blue-500',
  };

  const progressColors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };

  const progressPercent = (remainingTime / duration) * 100;

  return (
    <div
      className={`flex flex-col gap-2 px-4 py-3 rounded-lg border-l-4 shadow-lg ${bgColors[type]} animate-slide-in`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center gap-3">
        {icons[type]}
        <p className="text-white text-sm font-medium flex-1">{message}</p>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${progressColors[type]} transition-all`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
