'use client';

import Skeleton from './ui/Skeleton';
import Spinner from './ui/Spinner';

export default function KycStatusBanner({ status = 'Pending', isLoading = false, loading = false }) {
  const isFetching = isLoading || loading;

  if (isFetching) {
    return (
      <div
        className="flex items-center justify-between p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-h-[56px]"
        role="status"
        aria-label="Loading KYC status"
      >
        <div className="flex items-center gap-3 w-full">
          <Spinner size="sm" label="Fetching KYC status..." />
          <Skeleton className="h-4 w-32 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-between p-4 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-h-[56px]"
      role="status"
      aria-label={`KYC status: ${status}`}
    >
      <span>{status}</span>
    </div>
  );
}
