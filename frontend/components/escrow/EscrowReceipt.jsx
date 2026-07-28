'use client';

import { formatCurrency, formatDateTime } from '../../lib/formatCurrency';

/**
 * Print/PDF-friendly, self-contained receipt for a single escrow.
 * Rendered inside ReceiptExportButton's print area; also usable standalone.
 */
export default function EscrowReceipt({ escrow }) {
  if (!escrow) return null;

  const {
    id,
    status,
    amount,
    currency = 'USD',
    counterparty,
    client,
    description,
    createdAt,
    releasedAt,
    milestones = [],
    transactionHash,
  } = escrow;

  return (
    <article
      aria-label={`Receipt for escrow ${id}`}
      className="mx-auto w-full max-w-2xl rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-gray-900 dark:text-gray-100 print:border-0 print:shadow-none print:text-black print:bg-white"
    >
      <header className="flex items-start justify-between border-b border-gray-200 dark:border-gray-800 pb-4 print:border-black">
        <div>
          <h1 className="text-lg font-bold">Trustchain Escrow Receipt</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 print:text-gray-700">
            Escrow #{id}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide print:border print:border-black">
          {status}
        </span>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-gray-500 dark:text-gray-400 print:text-gray-700">Amount</dt>
          <dd className="font-semibold">{formatCurrency(amount, currency)}</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400 print:text-gray-700">Created</dt>
          <dd>{formatDateTime(createdAt)}</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400 print:text-gray-700">Client</dt>
          <dd>{client || '—'}</dd>
        </div>
        <div>
          <dt className="text-gray-500 dark:text-gray-400 print:text-gray-700">Counterparty</dt>
          <dd>{counterparty || '—'}</dd>
        </div>
        {releasedAt && (
          <div>
            <dt className="text-gray-500 dark:text-gray-400 print:text-gray-700">Released</dt>
            <dd>{formatDateTime(releasedAt)}</dd>
          </div>
        )}
        {transactionHash && (
          <div className="col-span-2">
            <dt className="text-gray-500 dark:text-gray-400 print:text-gray-700">
              Transaction Hash
            </dt>
            <dd className="break-all font-mono text-xs">{transactionHash}</dd>
          </div>
        )}
      </dl>

      {description && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 print:text-gray-700">
            Description
          </h2>
          <p className="mt-1 text-sm">{description}</p>
        </div>
      )}

      {milestones.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 print:text-gray-700">
            Milestones
          </h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left print:border-black">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Title
                </th>
                <th scope="col" className="py-1 pr-2 font-medium">
                  Amount
                </th>
                <th scope="col" className="py-1 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0 print:border-gray-300">
                  <td className="py-1 pr-2">{m.title}</td>
                  <td className="py-1 pr-2">{formatCurrency(m.amount, currency)}</td>
                  <td className="py-1">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-3 text-xs text-gray-400 dark:text-gray-500 print:border-black print:text-gray-600">
        Generated {formatDateTime(new Date())} · This receipt is a record of on-chain escrow
        activity and does not constitute a tax document.
      </footer>
    </article>
  );
}
