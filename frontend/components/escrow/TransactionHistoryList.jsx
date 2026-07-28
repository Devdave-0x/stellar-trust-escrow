'use client';

/**
 * TransactionHistoryList — full chronological ledger of on-chain events
 * for a single escrow (creation, funding, milestone actions, disputes,
 * cancellation, release), each linking out to the Stellar block explorer.
 *
 * Renders an accessible ordered list (role="list") with a visible
 * scrollable region for long histories, keyboard-focusable rows, and
 * aria-live status text summarizing the entry count.
 */

import { CopyButton } from '../ui/CopyButton';

const EVENT_META = {
  created: { label: 'Escrow Created', icon: '✦', tone: 'text-indigo-400 bg-indigo-500/10' },
  funded: { label: 'Funded', icon: '↓', tone: 'text-emerald-400 bg-emerald-500/10' },
  milestone_submitted: {
    label: 'Milestone Submitted',
    icon: '↑',
    tone: 'text-blue-400 bg-blue-500/10',
  },
  milestone_approved: {
    label: 'Milestone Approved',
    icon: '✓',
    tone: 'text-emerald-400 bg-emerald-500/10',
  },
  milestone_rejected: {
    label: 'Milestone Rejected',
    icon: '✕',
    tone: 'text-red-400 bg-red-500/10',
  },
  dispute_raised: { label: 'Dispute Raised', icon: '⚠', tone: 'text-amber-400 bg-amber-500/10' },
  dispute_resolved: {
    label: 'Dispute Resolved',
    icon: '⚖',
    tone: 'text-amber-400 bg-amber-500/10',
  },
  cancelled: { label: 'Escrow Cancelled', icon: '⊘', tone: 'text-gray-400 bg-gray-500/10' },
  released: { label: 'Funds Released', icon: '⇒', tone: 'text-emerald-400 bg-emerald-500/10' },
};

function explorerUrl(hash, network) {
  const base =
    network === 'mainnet'
      ? 'https://stellar.expert/explorer/public/tx'
      : 'https://stellar.expert/explorer/testnet/tx';
  return `${base}/${hash}`;
}

function truncateHash(hash) {
  if (!hash) return '—';
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

function HistoryRow({ event, network }) {
  const meta = EVENT_META[event.type] || {
    label: event.type,
    icon: '•',
    tone: 'text-gray-400 bg-gray-500/10',
  };
  const timestamp = event.timestamp ? new Date(event.timestamp) : null;

  return (
    <li
      className="relative flex gap-3 py-4 px-1 border-b border-gray-800 last:border-b-0
                 focus-within:bg-gray-800/40 hover:bg-gray-800/30 transition-colors rounded-lg"
    >
      <span
        aria-hidden="true"
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-sm ${meta.tone}`}
      >
        {meta.icon}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium text-white">{meta.label}</p>
          {timestamp && (
            <time dateTime={timestamp.toISOString()} className="text-xs text-gray-500 tabular-nums">
              {timestamp.toLocaleString()}
            </time>
          )}
        </div>

        {event.description && (
          <p className="text-xs text-gray-400 mt-0.5">{event.description}</p>
        )}

        {event.amount && (
          <p className="text-xs text-gray-300 mt-0.5 font-mono">{event.amount}</p>
        )}

        {event.txHash && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs font-mono text-gray-500" title={event.txHash}>
              {truncateHash(event.txHash)}
            </span>
            <CopyButton value={event.txHash} label={`${meta.label} transaction hash`} />
            <a
              href={explorerUrl(event.txHash, network)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
              aria-label={`View ${meta.label} transaction on Stellar Expert (opens in a new tab)`}
            >
              View ↗
            </a>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * @param {{ history: Array<{ id: string|number, type: string, description?: string,
 *   amount?: string, txHash?: string, timestamp?: string|number }>, network?: string,
 *   className?: string }} props
 */
export default function TransactionHistoryList({ history = [], network, className = '' }) {
  const sorted = [...history].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  return (
    <section aria-labelledby="tx-history-heading" className={className}>
      <div className="flex items-center justify-between mb-3">
        <h2 id="tx-history-heading" className="text-lg font-semibold text-white">
          Transaction History
        </h2>
        <span className="sr-only" role="status" aria-live="polite">
          {sorted.length} transaction{sorted.length === 1 ? '' : 's'} recorded
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">No on-chain activity yet.</p>
      ) : (
        <ol
          role="list"
          aria-label="Escrow transaction history, most recent first"
          className="max-h-96 overflow-y-auto pr-1"
        >
          {sorted.map((event) => (
            <HistoryRow key={event.id} event={event} network={network} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Derives a best-effort transaction history from an escrow + its milestones
 * when the API has not yet supplied a dedicated `transactionHistory` array.
 */
export function buildHistoryFromEscrow(escrow) {
  if (!escrow) return [];
  if (Array.isArray(escrow.transactionHistory) && escrow.transactionHistory.length > 0) {
    return escrow.transactionHistory;
  }

  const events = [];

  if (escrow.createdAt) {
    events.push({
      id: 'created',
      type: 'created',
      description: `Escrow initialized for ${escrow.totalAmount || 'an agreed amount'}`,
      txHash: escrow.txHash,
      timestamp: escrow.createdAt,
    });
  }

  if (escrow.transactionHash) {
    events.push({
      id: 'funded',
      type: 'funded',
      description: 'Funds deposited into the escrow contract',
      amount: escrow.totalAmount,
      txHash: escrow.transactionHash,
      timestamp: escrow.createdAt,
    });
  }

  (escrow.milestones || []).forEach((milestone) => {
    if (milestone.submittedAt) {
      events.push({
        id: `milestone-${milestone.id}-submitted`,
        type: milestone.status === 'Approved' ? 'milestone_approved' : 'milestone_submitted',
        description: milestone.title,
        amount: milestone.amount,
        txHash: milestone.txHash,
        timestamp: milestone.submittedAt,
      });
    }
  });

  return events;
}
