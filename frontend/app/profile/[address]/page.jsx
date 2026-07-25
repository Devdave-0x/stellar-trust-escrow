import ReputationBadge from '../../../components/ui/ReputationBadge';
import Badge from '../../../components/ui/Badge';
import TruncatedAddress from '../../../components/ui/TruncatedAddress';
import Button from '../../../components/ui/Button';
import StatCard from '../../../components/ui/StatCard';
import ErrorBoundary from '../../../components/error/ErrorBoundary';

const PLACEHOLDER_USER = {
  reputationScore: 87,
  badge: 'TRUSTED',
  completedEscrows: 12,
  disputedEscrows: 1,
  totalVolume: '18,450 USDC',
  memberSince: 'January 2025',
  completionRate: 92,
  totalEscrows: 13,
};

async function getProfile(address) {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${base}/api/users/${address}`, { next: { revalidate: 10 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getUserEscrows(address) {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${base}/api/users/${address}/escrows?limit=50`, {
      next: { revalidate: 10 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.escrows ?? data?.data ?? [];
  } catch {
    return [];
  }
}

export default async function ProfilePage({ params }) {
  const { address } = params;
  const [dbUser, rawEscrows] = await Promise.all([
    getProfile(address),
    getUserEscrows(address),
  ]);

  const user = { ...PLACEHOLDER_USER, ...(dbUser || {}) };

  const disputeRate =
    user.totalEscrows > 0
      ? ((user.disputedEscrows / user.totalEscrows) * 100).toFixed(1)
      : '0.0';

  const recentlyResolved = rawEscrows
    .filter((e) => e.status === 'Released')
    .slice(0, 5);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Profile card */}
      <ErrorBoundary>
        <div className="card flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 flex items-center justify-center text-indigo-300 font-bold text-xl flex-shrink-0">
            {address.slice(1, 3)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white font-mono">
                {user.displayName ? (
                  <span>{user.displayName}</span>
                ) : (
                  <TruncatedAddress address={address} />
                )}
              </h1>
              {user.badge && <Badge status={user.badge} />}
            </div>

            <p className="text-gray-500 text-xs font-mono break-all mt-1">{address}</p>

            {user.bio && <p className="text-gray-300 mt-2">{user.bio}</p>}
            <p className="text-gray-500 text-sm mt-1">Member since {user.memberSince}</p>
          </div>

          <div className="text-center flex-shrink-0">
            <ReputationBadge score={user.reputationScore} size="lg" />
            <p className="text-xs text-gray-500 mt-1">Reputation Score</p>
            <div className="mt-3">
              <Button variant="secondary" size="sm">
                Share Profile
              </Button>
            </div>
          </div>
        </div>
      </ErrorBoundary>

      {/* Summary stats */}
      <ErrorBoundary>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Escrows" value={user.totalEscrows ?? user.completedEscrows} />
          <StatCard label="Total Volume" value={user.totalVolume} />
          <StatCard label="Completion Rate" value={`${user.completionRate}%`} />
          <StatCard label="Dispute Rate" value={`${disputeRate}%`} />
        </div>
      </ErrorBoundary>

      {/* Recently resolved */}
      {recentlyResolved.length > 0 && (
        <ErrorBoundary>
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">Recently Resolved</h2>
            <ul className="space-y-3">
              {recentlyResolved.map((e) => (
                <li key={e.id}>
                  <a
                    href={`/escrow/${e.id}`}
                    className="flex items-center justify-between card hover:border-gray-700 transition-colors"
                  >
                    <span className="text-white text-sm">{e.title || `Escrow #${e.id}`}</span>
                    <span className="text-xs text-gray-500 font-mono">#{e.id}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </ErrorBoundary>
      )}
    </div>
  );
}
