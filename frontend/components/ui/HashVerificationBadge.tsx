import { cn } from '../../lib/utils';

export type HashVerificationStatus = 'verified' | 'mismatch' | 'verifying';

interface HashVerificationBadgeProps {
  status: HashVerificationStatus;
  hash?: string;
  label?: string;
  className?: string;
}

const meta: Record<HashVerificationStatus, { text: string; className: string; icon: string }> = {
  verified: { text: 'Verified', className: 'border-green-600 text-green-300', icon: '✓' },
  mismatch: { text: 'Mismatch', className: 'border-red-600 text-red-300', icon: '✕' },
  verifying: { text: 'Verifying…', className: 'border-yellow-600 text-yellow-300', icon: '◌' },
};

/**
 * Badge that shows whether an on-chain hash matches the expected value. Status
 * is conveyed with both text and colour.
 */
export default function HashVerificationBadge({
  status,
  hash,
  label,
  className,
}: HashVerificationBadgeProps) {
  const m = meta[status];

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        m.className,
        className,
      )}
    >
      <span aria-hidden="true" className={status === 'verifying' ? 'animate-spin' : ''}>
        {m.icon}
      </span>
      <span>{label ?? m.text}</span>
      {hash && <span className="font-mono opacity-80">{hash}</span>}
    </span>
  );
}
