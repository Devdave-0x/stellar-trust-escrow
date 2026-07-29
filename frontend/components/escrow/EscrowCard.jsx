/**
 * EscrowCard Component
 *
 * Summary card shown in list views (Dashboard, Explorer).
 * Links to the full Escrow Details page.
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

import Link from 'next/link';
import Badge from '../ui/Badge';
import TruncatedAddress from '../ui/TruncatedAddress';
import CurrencyAmount from '../ui/CurrencyAmount';
// CopyButton is a named export, not a default one — importing it as default
// made this component crash whenever an escrow had a transaction hash.
import { CopyButton } from '../ui/CopyButton';
import EscrowCardSkeleton from '../ui/EscrowCardSkeleton';
import { useI18n } from '../../i18n/index.jsx';

export default function EscrowCard({ escrow, isLoading = false }) {
  const { t } = useI18n();
  if (isLoading) return <EscrowCardSkeleton />;
  const { id, title, status, totalAmount, milestoneProgress, counterparty, role, transactionHash } =
    escrow;

  const [done, total] = milestoneProgress?.split(' / ').map(Number) ?? [0, 0];
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  /*
    The whole card is clickable, but the card itself is not the control: the
    heading holds a real <Link> whose ::after is stretched over the card. That
    keeps native link semantics and a single tab stop while letting the copy
    and address buttons inside the card stay independently reachable — a link
    with role="button" wrapping other controls violated WCAG 4.1.2.
  */
  return (
    <article className="card relative block transition-colors hover:border-gray-300 dark:hover:border-gray-700 group focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-gray-950">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-900 dark:text-white font-semibold truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
            <Link
              href={`/escrow/${id}`}
              aria-label={`View details for escrow: ${title}`}
              className="after:absolute after:inset-0 after:rounded-xl after:content-[''] focus:outline-none"
            >
              {title}
            </Link>
          </h3>
          <p className="relative z-10 w-fit text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {role === 'client' ? 'Freelancer:' : 'Client:'}{' '}
            <TruncatedAddress address={counterparty} />
            {role === 'client'
              ? `${t('escrow.fields.freelancer')}:`
              : `${t('escrow.fields.client')}:`}{' '}
            <span className="font-mono">{counterparty}</span>
          </p>
        </div>
        <Badge status={status} size="sm" />
      </div>

      {/* Amount — converted to user's selected currency */}
      <CurrencyAmount amount={totalAmount} showUsdc size="md" className="mb-3" />

      {/* Milestone Progress Bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
          <span>{t('escrow.fields.milestones')}</span>
          <span>{milestoneProgress}</span>
        </div>
        <div
          className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden shadow-inner"
          role="progressbar"
          aria-label={`Milestone progress for ${title}`}
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${milestoneProgress ?? `${progressPct}%`} milestones complete`}
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Transaction Hash */}
      {transactionHash && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-400">TX:</span>
            <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
              {transactionHash.slice(0, 16)}...
            </span>
            {/* Raised above the card link's stretched ::after so it stays clickable. */}
            <span className="relative z-10">
              <CopyButton value={transactionHash} label="transaction hash" />
            </span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
        <span className="text-xs text-gray-600 dark:text-gray-400">#{id}</span>
        <span
          className={`text-xs font-medium ${
            role === 'client'
              ? 'text-blue-700 dark:text-blue-400'
              : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          You are {role === 'client' ? t('escrow.fields.client') : t('escrow.fields.freelancer')}
        </span>
      </div>
    </article>
  );
}
