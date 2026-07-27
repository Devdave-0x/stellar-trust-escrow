/**
 * LoadingButton Component
 *
 * Wraps `Button` to give async action buttons (form submits, API calls)
 * consistent loading feedback: a spinner replaces the label, the button is
 * disabled, and the button's width is preserved (the label stays in the
 * layout, just hidden, instead of being swapped for shorter/longer text).
 *
 * @param {object}   props
 * @param {boolean}  [props.isLoading=false]
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.className]
 * @param {React.ReactNode} props.children
 */

import Button from './Button';
import Spinner from './Spinner';

export default function LoadingButton({
  children,
  isLoading = false,
  disabled,
  className = '',
  ...rest
}) {
  return (
    <Button
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={`relative ${className}`}
      {...rest}
    >
      <span className={isLoading ? 'invisible' : undefined}>{children}</span>
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="sm" />
        </span>
      )}
    </Button>
  );
}
