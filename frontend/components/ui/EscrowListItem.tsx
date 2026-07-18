import { cn } from '../../lib/utils';

export type EscrowStatus = 'active' | 'disputed' | 'completed' | 'cancelled';

export interface EscrowListItemData {
  id: string;
  title: string;
  amount: string;
  counterparty: string;
  status: EscrowStatus;
  updatedAt: string;
}

interface EscrowListItemProps {
  escrow: EscrowListItemData;
  onSelect?: (id: string) => void;
  onRaiseDispute?: (id: string) => void;
}

const statusStyles: Record<EscrowStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-900/40 text-green-300 border-green-700' },
  disputed: { label: 'Disputed', className: 'bg-red-900/40 text-red-300 border-red-700' },
  completed: { label: 'Completed', className: 'bg-blue-900/40 text-blue-300 border-blue-700' },
  cancelled: { label: 'Cancelled', className: 'bg-gray-700/40 text-gray-300 border-gray-600' },
};

/**
 * A single row in an escrow list. Conveys the escrow status both through a
 * coloured badge AND a text label so the information is not colour-only
 * (accessibility requirement).
 */
export default function EscrowListItem({ escrow, onSelect, onRaiseDispute }: EscrowListItemProps) {
  const status = statusStyles[escrow.status];

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-800/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        onClick={() => onSelect?.(escrow.id)}
        className="flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
              status.className,
            )}
          >
            {status.label}
          </span>
          <h3 className="truncate text-sm font-semibold text-white">{escrow.title}</h3>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400 sm:grid-cols-3">
          <div>
            <dt className="sr-only">Escrow id</dt>
            <dd className="font-mono">{escrow.id}</dd>
          </div>
          <div>
            <dt className="sr-only">Amount</dt>
            <dd>{escrow.amount} XLM</dd>
          </div>
          <div>
            <dt className="sr-only">Counterparty</dt>
            <dd className="truncate">{escrow.counterparty}</dd>
          </div>
        </dl>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-gray-500">Updated {escrow.updatedAt}</span>
        {escrow.status === 'active' && (
          <button
            type="button"
            onClick={() => onRaiseDispute?.(escrow.id)}
            className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            Raise dispute
          </button>
        )}
      </div>
    </li>
  );
}
