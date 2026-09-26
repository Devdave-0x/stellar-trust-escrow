'use client';

/**
 * Heatmap of disputes assigned per arbiter per week. Cells darken with load;
 * weeks at or above HIGH_LOAD are flagged so overloaded arbiters stand out.
 */

export const HIGH_LOAD = 5;

function cellClass(count, max) {
  if (count === 0) return 'bg-gray-900 text-gray-600';
  if (count >= HIGH_LOAD) return 'bg-red-600 text-white font-semibold';
  const ratio = count / Math.max(max, 1);
  if (ratio > 0.66) return 'bg-orange-500 text-white';
  if (ratio > 0.33) return 'bg-amber-500/70 text-white';
  return 'bg-emerald-600/60 text-white';
}

const short = (address) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export default function ArbiterWorkloadHeatmap({ data }) {
  if (!data || data.arbiters.length === 0) {
    return (
      <div className="card p-6 text-center" data-testid="workload-empty">
        <p className="text-white font-medium">No disputes assigned to arbiters in this period</p>
        <p className="text-sm text-gray-400 mt-1">Try a longer window or another tenant.</p>
      </div>
    );
  }

  const max = Math.max(...data.arbiters.flatMap((a) => a.weekly));
  const overloaded = data.arbiters.filter((a) => a.weekly.some((c) => c >= HIGH_LOAD));

  return (
    <div className="space-y-3">
      {overloaded.length > 0 && (
        <p role="status" className="text-sm text-red-400" data-testid="high-load-warning">
          {overloaded.length} arbiter(s) had {HIGH_LOAD}+ disputes assigned in a single week.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-1" aria-label="Arbiter workload heatmap">
          <thead>
            <tr className="text-gray-400">
              <th className="text-left px-2">Arbiter</th>
              {data.weekStarts.map((w) => (
                <th key={w} className="px-1 font-normal">
                  {new Date(w).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </th>
              ))}
              <th className="px-2">Open</th>
              <th className="px-2">Avg resolution</th>
              <th className="px-2">Reputation</th>
            </tr>
          </thead>
          <tbody>
            {data.arbiters.map((a) => (
              <tr key={a.address}>
                <td className="px-2 font-mono text-gray-300" title={a.address}>
                  {short(a.address)}
                </td>
                {a.weekly.map((count, i) => (
                  <td
                    key={i}
                    className={`w-10 h-8 text-center rounded ${cellClass(count, max)}`}
                    title={`${count} dispute(s) week of ${new Date(data.weekStarts[i]).toLocaleDateString()}`}
                    data-testid={`cell-${a.address}-${i}`}
                  >
                    {count || ''}
                  </td>
                ))}
                <td className="px-2 text-center text-gray-300">{a.open}</td>
                <td className="px-2 text-center text-gray-300">
                  {a.avgResolutionHours === null ? '—' : `${a.avgResolutionHours} h`}
                </td>
                <td className="px-2 text-center text-gray-300">{a.reputation ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
