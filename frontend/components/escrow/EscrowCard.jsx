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
 * @param {string}  [props.escrow.transactionHash]
 * @param {string|number} [props.escrow.deadline] — ISO date or timestamp
 */

import Link from 'next/link';
import { AlertTriangle, Clock } from 'lucide-react';
import Badge from '../ui/Badge';
import CurrencyAmount from '../ui/CurrencyAmount';
// CopyButton is a named export, not a default one — importing it as default
// made this component crash whenever an escrow had a transaction hash.
import { CopyButton } from '../ui/CopyButton';
import EscrowCardSkeleton from '../ui/EscrowCardSkeleton';
import { useI18n } from '../../i18n/index.jsx';

function getTimeRemaining(deadline) {
  if (!deadline) return null;
  const diffMs = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return null;
  if (diffMs <= 0) return 'Deadline passed';
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  return `${hours} hour${hours === 1 ? '' : 's'} left`;
}

export default function EscrowCard({ escrow, isLoading = false }) {
  const { t } = useI18n();
  if (isLoading) return <EscrowCardSkeleton />;
  const {
    id,
    title,
    status,
    totalAmount,
    milestoneProgress,
    counterparty,
    role,
    transactionHash,
    deadline,
  } = escrow;

  const [done, total] = milestoneProgress?.split(' / ').map(Number) ?? [0, 0];
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isDisputed = status === 'Disputed';
  const remaining = getTimeRemaining(deadline);

  const handleKeyDown = (event) => {
    // Activate on Enter or Space key
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cardRef.current?.click();
    }
  };

  const stopLinkNavigation = (event) => event.preventDefault();

  return (
    <Link
      href={`/escrow/${id}`}
      ref={cardRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="card block hover:border-gray-300 dark:hover:border-gray-700 hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/30 transition-all duration-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
      role="button"
      aria-label={`View details for escrow: ${title}`}
    >
      {/* Disputed warning banner */}
      {isDisputed && (
        <div
          role="alert"
          className="flex items-center gap-1.5 mb-3 -mt-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                     bg-red-100 text-red-700 border border-red-200
                     dark:bg-red-900/20 dark:text-red-300 dark:border-red-900/40"
        >
          <AlertTriangle size={13} aria-hidden="true" />
          Disputed — awaiting mediator review
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-900 dark:text-white font-semibold truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {title}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {role === 'client' ? t('escrow.fields.freelancer') : t('escrow.fields.client')}
            {': '}
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
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Milestone progress: ${milestoneProgress}`}
        >
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Time remaining */}
      {remaining && (
        <div className="flex items-center gap-1.5 mt-3 text-xs text-gray-500">
          <Clock size={12} aria-hidden="true" />
          <span>{remaining}</span>
        </div>
      )}

      {/* Transaction Hash */}
      {transactionHash && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">TX:</span>
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
              {transactionHash.slice(0, 16)}...
            </span>
            <div onClick={stopLinkNavigation}>
              <CopyButton text={transactionHash} label="Copy" size="sm" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-800">
        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-600">
          #{id}
          <span onClick={stopLinkNavigation}>
            <CopyButton text={String(id)} label="escrow ID" size="sm" />
          </span>
        </span>
        <span
          className={`text-xs font-medium ${
            role === 'client' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          You are {role === 'client' ? t('escrow.fields.client') : t('escrow.fields.freelancer')}
        </span>
      </div>
    </article>
  );
}
