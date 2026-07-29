'use client';

import { cn } from '../../lib/utils';

const VARIANT_STYLES = {
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  error: 'bg-red-500/15 text-red-300 border-red-500/30',
  info: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  neutral: 'bg-gray-700/60 text-gray-300 border-gray-600/60',
};

const DOT_STYLES = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  neutral: 'bg-gray-400',
};

const STATUS_VARIANTS = {
  Active: 'success',
  Completed: 'neutral',
  Disputed: 'error',
  Cancelled: 'neutral',
  Pending: 'neutral',
  Submitted: 'info',
  Approved: 'success',
  Rejected: 'error',
  ReleaseRequested: 'warning',
  Released: 'success',
  Created: 'neutral',
  Funded: 'info',
  InProgress: 'info',
  Resolved: 'success',
  Init: 'info',
  Processing: 'warning',
  Declined: 'error',
  NEW: 'neutral',
  TRUSTED: 'info',
  VERIFIED: 'info',
  EXPERT: 'warning',
  ELITE: 'success',
  Passed: 'success',
  Defeated: 'error',
  Queued: 'warning',
  Executed: 'success',
  Open: 'warning',
};

const SIZE_STYLES = {
  sm: 'text-[11px] px-2 py-0.5 gap-1.5',
  md: 'text-xs px-2.5 py-1 gap-1.5',
  lg: 'text-sm px-3 py-1.5 gap-2',
};

const DOT_SIZES = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
};

function resolveVariant({ status, variant }) {
  if (variant && VARIANT_STYLES[variant]) return variant;
  if (status && STATUS_VARIANTS[status]) return STATUS_VARIANTS[status];
  if (status && VARIANT_STYLES[status]) return status;
  return variant && VARIANT_STYLES[variant] ? variant : 'neutral';
}

function resolveLabel({ children, status, variant }) {
  if (children !== undefined && children !== null) return children;
  if (status !== undefined && status !== null) return status;
  return variant ?? 'Badge';
}

export default function Badge({
  status,
  variant,
  size = 'md',
  dot = false,
  children,
  className,
}) {
  const resolvedVariant = resolveVariant({ status, variant });
  const label = resolveLabel({ children, status, variant });
  const sizeStyles = SIZE_STYLES[size] ?? SIZE_STYLES.md;
  const dotStyles = DOT_SIZES[size] ?? DOT_SIZES.md;
  const ariaLabel =
    typeof label === 'string' || typeof label === 'number' ? `Status: ${label}` : undefined;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      data-variant={resolvedVariant}
      data-size={size}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border font-medium leading-none',
        sizeStyles,
        VARIANT_STYLES[resolvedVariant],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('shrink-0 rounded-full', dotStyles, DOT_STYLES[resolvedVariant])}
        />
      )}
      <span>{label}</span>
    </span>
  );
}
