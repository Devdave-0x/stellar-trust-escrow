'use client';

/**
 * /profile
 *
 * The signed-in user's own profile: reputation summary, quick links to
 * edit their profile, and their full escrow history (as client and as
 * counterparty). Requires a connected wallet — shows a connect prompt
 * otherwise.
 */

import Link from 'next/link';
import Button from '../../components/ui/Button';
import ReputationBadge from '../../components/ui/ReputationBadge';
import TruncatedAddress from '../../components/ui/TruncatedAddress';
import EscrowHistoryList from '../../components/profile/EscrowHistoryList';
import { useWalletStore } from '../../store/app-store';
import { useUserEscrows } from '../../hooks/useEscrow';
import { useReputation } from '../../hooks/useReputation';

function ConnectPrompt() {
  return (
    <div
      role="status"
      className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-gray-200
                 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900"
    >
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
        Connect your wallet to view your profile
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Your profile, reputation score, and escrow history are tied to your connected Stellar
        wallet.
      </p>
    </div>
  );
}

export default function ProfilePage() {
  const { address, isConnected } = useWalletStore();
  const { escrows, isLoading, error } = useUserEscrows(address, 'all');
  const { reputation } = useReputation(address);

  if (!isConnected || !address) {
    return <ConnectPrompt />;
  }

  const completedCount = escrows.filter((e) => e.status === 'released' || e.status === 'resolved')
    .length;
  const activeCount = escrows.filter((e) =>
    ['funded', 'in_progress', 'release_requested'].includes(e.status),
  ).length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-start">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-xl font-bold text-indigo-600 dark:bg-indigo-600/30 dark:text-indigo-300">
          {address.slice(1, 3)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-xl font-bold text-gray-900 dark:text-white">
              <TruncatedAddress address={address} />
            </h1>
            {reputation?.score != null && <ReputationBadge score={reputation.score} />}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Active escrows</dt>
              <dd className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {activeCount}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Completed</dt>
              <dd className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {completedCount}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Total escrows</dt>
              <dd className="mt-0.5 font-semibold text-gray-900 dark:text-white">
                {escrows.length}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button href="/profile/edit" variant="secondary" size="sm">
              Edit profile
            </Button>
            <Link
              href={`/profile/${address}`}
              className="inline-flex items-center text-sm text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded dark:text-indigo-400"
            >
              View public profile
            </Link>
          </div>
        </div>
      </div>

      <EscrowHistoryList escrows={escrows} isLoading={isLoading} error={error} />
    </div>
  );
}
