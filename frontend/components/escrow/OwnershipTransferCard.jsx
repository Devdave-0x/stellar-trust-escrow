'use client';

import Badge from '../ui/Badge';
import Button from '../ui/Button';

const STATUS_META = {
  pending: {
    label: 'Awaiting acceptance',
    variant: 'warning',
    message: 'Ownership transfer requested. Waiting for the new owner to accept.',
  },
  accepted: {
    label: 'Transfer accepted',
    variant: 'success',
    message: 'Ownership transferred. The new owner now controls this escrow role.',
  },
  rejected: {
    label: 'Transfer rejected',
    variant: 'error',
    message: 'The ownership transfer was rejected. You remain the owner.',
  },
  expired: {
    label: 'Request expired',
    variant: 'neutral',
    message: 'This transfer request expired before it was accepted.',
  },
  cancelled: {
    label: 'Request cancelled',
    variant: 'neutral',
    message: 'The ownership transfer request was cancelled.',
  },
};

function truncateAddress(address) {
  if (!address) return 'Not assigned';
  if (address.length <= 16) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export default function OwnershipTransferCard({
  transfer,
  loading = false,
  error,
  onAccept,
  onReject,
  onCancel,
}) {
  if (!transfer) {
    return (
      <section className="w-full max-w-xl rounded-xl border border-gray-800 bg-gray-900 p-5 text-gray-300">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">Ownership transfer</h3>
          <Badge variant="neutral">No request</Badge>
        </div>
        <p className="text-sm text-gray-400">There is no active ownership transfer request.</p>
      </section>
    );
  }

  const meta = STATUS_META[transfer.status] ?? STATUS_META.pending;
  const canRespond = transfer.status === 'pending' && transfer.direction === 'incoming';
  const canCancel = transfer.status === 'pending' && transfer.direction !== 'incoming';

  return (
    <section className="w-full max-w-xl rounded-xl border border-gray-800 bg-gray-900 p-5 text-gray-300">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Ownership transfer</h3>
          <p className="mt-1 text-sm text-gray-400">{meta.message}</p>
        </div>
        <Badge variant={meta.variant} dot>
          {meta.label}
        </Badge>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <dl className="grid gap-3 rounded-lg border border-gray-800 bg-gray-950/60 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase text-gray-500">Escrow</dt>
          <dd className="mt-1 font-medium text-gray-100">{transfer.escrowTitle}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-gray-500">Role</dt>
          <dd className="mt-1 font-medium capitalize text-gray-100">{transfer.role}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-gray-500">Current owner</dt>
          <dd className="mt-1 font-mono text-xs text-gray-100" title={transfer.fromAddress}>
            {truncateAddress(transfer.fromAddress)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-gray-500">New owner</dt>
          <dd className="mt-1 font-mono text-xs text-gray-100" title={transfer.toAddress}>
            {truncateAddress(transfer.toAddress)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-gray-500">Requested</dt>
          <dd className="mt-1 text-gray-100">{transfer.requestedAt}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-gray-500">Expires</dt>
          <dd className="mt-1 text-gray-100">{transfer.expiresAt}</dd>
        </div>
      </dl>

      {(canRespond || canCancel) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canRespond && (
            <>
              <Button size="sm" onClick={onAccept} isLoading={loading}>
                Accept transfer
              </Button>
              <Button size="sm" variant="danger" onClick={onReject} disabled={loading}>
                Reject transfer
              </Button>
            </>
          )}
          {canCancel && (
            <Button size="sm" variant="danger" onClick={onCancel} isLoading={loading}>
              Cancel request
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
