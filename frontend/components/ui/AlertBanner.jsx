/**
 * AlertBanner Component
 *
 * Displays dismissible system messages: errors, warnings, info, and success
 * as banners at the top of content areas.
 *
 * @param {object}   props
 * @param {'success'|'warning'|'error'|'info'} props.variant - Banner variant
 * @param {string}   props.title - Banner title
 * @param {string}   [props.description] - Optional description text
 * @param {Function} [props.onDismiss] - Called when dismiss button clicked. If omitted, banner is persistent (no dismiss button)
 */

'use client';

import { useState, useCallback } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

const VARIANT_CONFIG = {
  success: {
    icon: CheckCircle,
    iconColor: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    titleColor: 'text-emerald-400',
    textColor: 'text-emerald-300',
    dismissHover: 'hover:text-emerald-300',
    role: 'status',
  },
  warning: {
    icon: AlertCircle,
    iconColor: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
    titleColor: 'text-amber-400',
    textColor: 'text-amber-300',
    dismissHover: 'hover:text-amber-300',
    role: 'alert',
  },
  error: {
    icon: XCircle,
    iconColor: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30',
    titleColor: 'text-red-400',
    textColor: 'text-red-300',
    dismissHover: 'hover:text-red-300',
    role: 'alert',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
    titleColor: 'text-blue-400',
    textColor: 'text-blue-300',
    dismissHover: 'hover:text-blue-300',
    role: 'status',
  },
};

export default function AlertBanner({ variant, title, description, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);
  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.info;
  const Icon = config.icon;

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (isExiting && onDismiss) {
      onDismiss();
    }
  }, [isExiting, onDismiss]);

  if (!variant || !title) return null;

  const isDismissible = typeof onDismiss === 'function';

  return (
    <div
      className={`border rounded-lg p-4 flex items-start gap-3 ${
        isExiting ? 'animate-banner-exit' : 'animate-banner-enter'
      } ${config.bg}`}
      role={config.role}
      aria-live={variant === 'error' || variant === 'warning' ? 'assertive' : 'polite'}
      onAnimationEnd={handleAnimationEnd}
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${config.iconColor}`} aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <h3 className={`font-semibold text-sm ${config.titleColor}`}>{title}</h3>
        {description && (
          <p className={`text-sm mt-1 break-words ${config.textColor}`}>{description}</p>
        )}
      </div>

      {isDismissible && (
        <button
          onClick={handleDismiss}
          className={`flex-shrink-0 p-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${config.iconColor} ${config.dismissHover}`}
          aria-label={`Dismiss ${variant} message`}
          type="button"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
