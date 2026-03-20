/**
 * Spinner Component
 *
 * Animated loading indicator.
 *
 * @param {object} props
 * @param {'sm'|'md'|'lg'} [props.size='md']
 * @param {string}          [props.label='Loading…'] — screen reader text
 */
export default function Spinner({ size = 'md', label = 'Loading…' }) {
  const sizeClass =
    size === 'sm'
      ? 'w-4 h-4 border-2'
      : size === 'lg'
        ? 'w-10 h-10 border-[3px]'
        : 'w-6 h-6 border-2';

  return (
    <div className="inline-flex items-center gap-2" role="status">
      <div
        className={`${sizeClass} border-indigo-500 border-t-transparent
                    rounded-full animate-spin`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
