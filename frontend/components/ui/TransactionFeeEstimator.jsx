'use client';

/**
 * TransactionFeeEstimator — itemized breakdown of the network fee for a
 * multi-operation Stellar transaction (e.g. creating an escrow with several
 * milestones bundles create + fund + N milestone operations into one
 * transaction).
 *
 * Pure/deterministic (no network calls) so it can sit inside forms like the
 * escrow creation wizard and update instantly as operations are added or
 * removed; pairs with GasEstimator (which fetches live Horizon fee stats) by
 * accepting a `baseFeeStroops` prop sourced from it.
 *
 * @param {object}   props
 * @param {Array<{label: string, operations?: number}>} props.operations
 *        e.g. [{ label: 'Create escrow', operations: 1 }, { label: 'Fund milestone', operations: 3 }]
 * @param {number}   [props.baseFeeStroops=100]  — per-operation base fee, in stroops
 * @param {number}   [props.xlmUsdRate]          — optional, renders a USD estimate when provided
 * @param {string}   [props.className]
 */

import { cn } from '../../lib/utils';

const STROOPS_PER_XLM = 10_000_000;

function stroopsToXlm(stroops) {
  return stroops / STROOPS_PER_XLM;
}

function formatXlm(stroops) {
  return `${stroopsToXlm(stroops).toFixed(7).replace(/0+$/, '').replace(/\.$/, '.0')} XLM`;
}

export function computeFeeBreakdown(operations, baseFeeStroops) {
  const items = operations.map((op) => {
    const count = op.operations ?? 1;
    const feeStroops = count * baseFeeStroops;
    return { ...op, operations: count, feeStroops };
  });
  const totalStroops = items.reduce((sum, item) => sum + item.feeStroops, 0);
  const totalOperations = items.reduce((sum, item) => sum + item.operations, 0);
  return { items, totalStroops, totalOperations };
}

export default function TransactionFeeEstimator({
  operations = [],
  baseFeeStroops = 100,
  xlmUsdRate,
  className,
}) {
  const { items, totalStroops, totalOperations } = computeFeeBreakdown(operations, baseFeeStroops);
  const totalUsd = xlmUsdRate != null ? stroopsToXlm(totalStroops) * xlmUsdRate : null;

  if (items.length === 0) {
    return (
      <p className={cn('text-sm text-gray-500 dark:text-gray-400', className)}>
        No operations to estimate yet.
      </p>
    );
  }

  return (
    <section
      aria-labelledby="fee-estimator-heading"
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 p-4',
        className,
      )}
    >
      <h3
        id="fee-estimator-heading"
        className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3"
      >
        Estimated network fee
      </h3>

      <dl className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <dt className="text-gray-600 dark:text-gray-400">
              {item.label}
              {item.operations > 1 && (
                <span className="text-gray-400 dark:text-gray-500"> &times;{item.operations}</span>
              )}
            </dt>
            <dd className="font-mono text-gray-800 dark:text-gray-200">{formatXlm(item.feeStroops)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          Total ({totalOperations} operation{totalOperations === 1 ? '' : 's'})
        </span>
        <div className="text-right">
          <p
            className="font-mono font-semibold text-gray-900 dark:text-white"
            aria-label={`Total estimated fee: ${formatXlm(totalStroops)}`}
          >
            {formatXlm(totalStroops)}
          </p>
          {totalUsd != null && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              &asymp; ${totalUsd < 0.01 ? totalUsd.toFixed(6) : totalUsd.toFixed(2)} USD
            </p>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Actual fee may vary with network congestion at submission time.
      </p>
    </section>
  );
}
