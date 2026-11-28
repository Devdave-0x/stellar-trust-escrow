/**
 * EscrowCard Component
 *
 * Summary card shown in list views (Dashboard, Explorer).
 * Links to the full Escrow Details page.
 *
 * TOUCH AUDIT (Issue #1444):
 * - The whole card is a single tappable <Link> (large hit area).
 * - The inline CopyButton was given a min 44x44px hit area (see CopyButton.jsx).
 * - The transaction-hash row uses a divider so it never overflows on 375px.
 * - Card widths are driven by the parent grid (single column on mobile).
 *
 * @param {object} props
 * @param {object} props.escrow
 * @param {number}  props.escrow.id
 * @param {string}  props.escrow.title
 * @param {string}  props.escrow.status         — EscrowStatus
 * @param {string}  props.escrow.totalAmount
 * @param {string}  props.escrow.milestoneProgress  — e.g. "2 / 4"
 * @param {string}  props.escrow.counterparty    — truncated address
 * @param {'client'|'freelancer'} props.escrow.role
 *
 * TODO (contributor — easy, Issue #39):
 * - Add hover animation (subtle lift)
 * - Show milestone progress bar (filled segments)
 * - Show time remaining if deadline is set
 * - Add "disputed" warning banner if status === Disputed
 */
'use client';

import Link from 'next/link';
import Badge from '../ui/Badge';
import CopyButton from '../ui/CopyButton';
import CurrencyAmount from '../ui/CurrencyAmount';
import EscrowCardSkeleton from '../ui/EscrowCardSkeleton';
import { useI18n } from '../../i18n/index.jsx';
import { useRelativeTime } from '../../hooks/useRelativeTime';
import { useRef, useMemo } from 'react';
import { cn } from '../../lib/utils';

const ACTION_REQUIRED_STATUSES = new Set(['ReleaseRequested']);

function formatTimeRemaining(deadline) {
  if (!deadline) return null;

  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const diffMs = deadlineTime - now;

  if (diffMs <= 0) return 'Past due';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d remaining`;
  if (hours > 0) return `${hours}h remaining`;
  if (minutes > 0) return `${minutes}m remaining`;
  return 'Due soon';
}

export default function EscrowCard({
  escrow,
  isLoading = false,
  actionRequired,
}) {
  const { t } = useI18n();
  const cardRef = useRef(null);

  if (isLoading || !escrow) {
    return (
      <div role="status" aria-live="polite" aria-label="Loading escrow card">
        <EscrowCardSkeleton />
      </div>
    );
  }

  const {
    id,
    title,
    status,
    totalAmount,
    counterparty,
    role,
    deadline,
    assetSymbol = 'USDC',
  } = escrow;

  const requiresAction = actionRequired ?? ACTION_REQUIRED_STATUSES.has(status);
  const timeLabel = useRelativeTime(deadline, 60_000);
  const remaining = useMemo(() => formatTimeRemaining(deadline), [deadline]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cardRef.current?.click();
    }
  };

  return (
    <Link
      href={`/escrow/${id}`}
      ref={cardRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        'card block hover:border-gray-700 transition-colors group focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-950',
        requiresAction && 'border-amber-500/40 hover:border-amber-500/60',
      )}
      role="button"
      aria-label={`View details for escrow: ${title}`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate group-hover:text-indigo-400 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {role === 'client'
              ? `${t('escrow.fields.freelancer')}:`
              : `${t('escrow.fields.client')}:`}{' '}
            <span className="font-mono">{counterparty}</span>
          </p>
        </div>
        <Badge status={status} size="sm" />
      </div>

      {/* Amount with asset symbol */}
      <CurrencyAmount
        amount={totalAmount}
        showUsdc={false}
        size="md"
        className="mb-3"
      />
      {assetSymbol && (
        <span className="text-xs text-gray-500 -mt-2 mb-3 block">
          {assetSymbol}
        </span>
      )}

      {/* Time Remaining / Deadline */}
      {deadline && (
        <div className="flex items-center gap-2 text-xs mb-3">
          <span
            className={cn(
              remaining === 'Past due' ? 'text-red-400' : 'text-gray-400',
            )}
          >
            {remaining}
          </span>
          <span className="text-gray-600">•</span>
          <span className="text-gray-500">{timeLabel}</span>
        </div>
      )}

      {/* Action Required Banner */}
      {requiresAction && (
        <div className="flex items-center gap-2 mt-2 pt-3 border-t border-amber-500/20">
          <span className="text-xs font-medium text-amber-400">
            Action required
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
        <span className="flex items-center gap-2">
          <span className="text-xs text-gray-600">#{id}</span>
          <div onClick={(e) => e.preventDefault()}>
            <CopyButton text={String(id)} label="Escrow ID" />
          </div>
        </span>
        <span
          className={cn(
            'text-xs font-medium',
            role === 'client' ? 'text-blue-400' : 'text-emerald-400',
          )}
        >
          {role === 'client'
            ? t('escrow.fields.client')
            : t('escrow.fields.freelancer')}
        </span>
      </div>
    </Link>
  );
}
