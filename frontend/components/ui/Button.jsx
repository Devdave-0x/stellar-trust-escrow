/**
 * Button Component
 *
 * Reusable button with variant and size support.
 * Can render as an <a> tag (href prop) or <button>.
 *
 * @param {object}  props
 * @param {'primary'|'secondary'|'danger'|'ghost'} [props.variant='primary']
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {string}  [props.href]          — renders as Next.js Link if provided
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.isLoading]     — TODO (contributor — easy): add spinner
 * @param {Function} [props.onClick]
 * @param {React.ReactNode} props.children
 */

import Link from 'next/link';

const VARIANTS = {
  primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700',
  danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30',
  ghost: 'hover:bg-gray-800 text-gray-400 hover:text-white',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  href,
  disabled,
  isLoading,
  onClick,
  className = '',
  ...rest
}) {
  const base = `inline-flex items-center justify-center gap-2 font-medium
                transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                disabled:opacity-50 disabled:cursor-not-allowed`;

  const classes = `${base} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;

  // TODO (contributor — easy): add isLoading spinner state
  if (href && !disabled) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} disabled={disabled || isLoading} onClick={onClick} {...rest}>
      {isLoading ? '…' : children}
    </button>
  );
}
