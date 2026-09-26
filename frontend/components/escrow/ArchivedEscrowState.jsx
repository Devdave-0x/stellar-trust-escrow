'use client';

export default function ArchivedEscrowState({ escrowId, archivedAt }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
      <p className="text-sm font-semibold text-gray-200">Escrow archived</p>
      <p className="mt-1 text-sm text-gray-400">
        This escrow is no longer active and is kept for records only.
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-500 sm:grid-cols-2">
        {escrowId && (
          <>
            <dt>Escrow ID</dt>
            <dd className="font-mono text-gray-300">{escrowId}</dd>
          </>
        )}
        {archivedAt && (
          <>
            <dt>Archived</dt>
            <dd className="text-gray-300">{new Date(archivedAt).toLocaleString()}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
