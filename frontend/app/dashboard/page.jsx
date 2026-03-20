/**
 * Dashboard Page — /dashboard
 *
 * The main landing page after wallet connection. Shows:
 * - Summary stats (active escrows, total value locked, reputation score)
 * - Recent active escrows (as client and freelancer)
 * - Quick action buttons (Create Escrow, View Profile)
 *
 * TODO (contributor — medium, Issue #32):
 * - Connect to API: GET /api/users/:address/escrows
 * - Connect to API: GET /api/users/:address/stats
 * - Connect to API: GET /api/reputation/:address
 * - Replace all placeholder data with real SWR fetches
 * - Add empty state when user has no escrows
 * - Add redirect to home if wallet not connected
 */

import EscrowCard from '../../components/escrow/EscrowCard';
import ReputationBadge from '../../components/ui/ReputationBadge';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';

// TODO (contributor): Replace with real data fetched via SWR
const PLACEHOLDER_STATS = {
  activeEscrows: 3,
  totalValueLocked: '4,250 USDC',
  reputationScore: 87,
  completedEscrows: 12,
};

const PLACEHOLDER_ESCROWS = [
  {
    id: 1,
    title: 'Logo Design Project',
    counterparty: 'GBXYZ...1234',
    role: 'client',
    status: 'Active',
    totalAmount: '500 USDC',
    milestoneProgress: '2 / 4',
  },
  {
    id: 2,
    title: 'Smart Contract Audit',
    counterparty: 'GABC...5678',
    role: 'freelancer',
    status: 'Active',
    totalAmount: '2,000 USDC',
    milestoneProgress: '1 / 3',
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            {/* TODO (contributor): show connected wallet address (truncated) */}
            Welcome back, <span className="text-indigo-400">GABCD...1234</span>
          </p>
        </div>
        <Button href="/escrow/create" variant="primary">
          + New Escrow
        </Button>
      </div>

      {/* Stats Row */}
      {/*
        TODO (contributor — Issue #32):
        Fetch real stats from GET /api/users/:address/stats
        and replace PLACEHOLDER_STATS
      */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Escrows" value={PLACEHOLDER_STATS.activeEscrows} icon="🔒" />
        <StatCard label="Total Locked" value={PLACEHOLDER_STATS.totalValueLocked} icon="💰" />
        <StatCard label="Completed" value={PLACEHOLDER_STATS.completedEscrows} icon="✅" />
        <div className="card flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Reputation</p>
          <ReputationBadge score={PLACEHOLDER_STATS.reputationScore} />
        </div>
      </div>

      {/* Active Escrows */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Your Active Escrows</h2>

        {/*
          TODO (contributor — Issue #32):
          Map over SWR-fetched escrows instead of PLACEHOLDER_ESCROWS.
          Show a loading skeleton while data is fetching.
          Show empty state if no escrows exist.
        */}
        <div className="grid gap-4 md:grid-cols-2">
          {PLACEHOLDER_ESCROWS.map((escrow) => (
            <EscrowCard key={escrow.id} escrow={escrow} />
          ))}
        </div>
      </section>
    </div>
  );
}
