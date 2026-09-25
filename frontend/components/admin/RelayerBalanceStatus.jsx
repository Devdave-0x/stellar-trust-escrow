'use client';

const STATUS_STYLES = {
  normal: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  critical: 'border-red-500/30 bg-red-500/10 text-red-200',
  unavailable: 'border-gray-700 bg-gray-800/60 text-gray-300',
};

export function getRelayerBalanceState({ status, balanceXlm, thresholds = {} }) {
  if (status !== 'active' || balanceXlm === null || balanceXlm === undefined) return 'unavailable';
  const critical = Number(thresholds.criticalXlm ?? 2);
  const warning = Number(thresholds.warningXlm ?? 10);
  if (balanceXlm <= critical) return 'critical';
  if (balanceXlm <= warning) return 'warning';
  return 'normal';
}

export default function RelayerBalanceStatus({ data, onRefresh, refreshing = false }) {
  const state = getRelayerBalanceState(data || {});
  const balance = data?.balanceXlm;
  const stateLabel = state === 'normal' ? 'Normal' : state === 'warning' ? 'Warning' : state === 'critical' ? 'Critical' : 'Unavailable';

  return (
    <section className={`card border ${STATUS_STYLES[state]}`} data-testid="relayer-balance-status">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider opacity-70">Relayer account health</p>
          <h2 className="mt-1 text-xl font-semibold">{stateLabel}</h2>
          <p className="mt-1 text-sm opacity-80">
            {data?.relayerAddress ? `Account ${data.relayerAddress.slice(0, 8)}…${data.relayerAddress.slice(-6)}` : 'Relayer is not configured'}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-lg border border-current/30 px-3 py-1.5 text-sm transition-opacity disabled:cursor-wait disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
        <div>
          <dt className="opacity-70">Balance</dt>
          <dd className="mt-1 font-semibold">{balance == null ? 'Unavailable' : `${balance.toLocaleString()} XLM`}</dd>
        </div>
        <div>
          <dt className="opacity-70">Warning threshold</dt>
          <dd className="mt-1 font-semibold">{data?.thresholds?.warningXlm ?? 10} XLM</dd>
        </div>
        <div>
          <dt className="opacity-70">Last checked</dt>
          <dd className="mt-1 font-semibold">{data?.lastCheckedAt ? new Date(data.lastCheckedAt).toLocaleString() : 'Never'}</dd>
        </div>
      </dl>
      {data?.balanceError && <p className="mt-4 text-xs opacity-80">{data.balanceError}</p>}
    </section>
  );
}
