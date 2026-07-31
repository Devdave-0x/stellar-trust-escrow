/** @jsxImportSource react */
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const Progress = ({
  className,
  value,
  max = 100,
  indeterminate = false,
  size = 'md',
  label = 'Progress',
  ...props
}) => {
  if (indeterminate) {
    const sizeClasses = {
      sm: 'w-4 h-4',
      md: 'w-6 h-6',
      lg: 'w-10 h-10',
    };
    return (
      <div className="flex items-center gap-2" role="status">
        <Loader2 className={cn('animate-spin', sizeClasses[size], className)} aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  const percentage = (value / max) * 100;

  // role="progressbar" needs an accessible name to satisfy WCAG 4.1.2; callers
  // can override the default via `label`.
  return (
    <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
      <div
        className="bg-brand-500 h-2 rounded-full transition-all duration-300"
        style={{ width: `${percentage}%` }}
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={`${Math.round(percentage)}%`}
        {...props}
      />
    </div>
  );
};

Progress.displayName = 'Progress';

export { Progress };
export default Progress;
