'use client';

import { useState, useEffect } from 'react';
import { useEscrow } from '../../../hooks/useEscrow';
import { useRelativeTime } from '../../../hooks/useRelativeTime';
import { useWallet } from '../../../hooks/useWallet';
import { useToast } from '../../../contexts/ToastContext';
import MilestoneList from '../../../components/escrow/MilestoneList';
import DisputeModal from '../../../components/escrow/DisputeModal';
import CancelEscrowModal from '../../../components/escrow/CancelEscrowModal';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import ReputationBadge from '../../../components/ui/ReputationBadge';
import CurrencyAmount from '../../../components/ui/CurrencyAmount';
import TransactionHash from '../../../components/ui/TransactionHash';
import TruncatedAddress from '../../../components/ui/TruncatedAddress';
import Avatar from '../../../components/ui/Avatar';
import Spinner from '../../../components/ui/Spinner';
import ErrorBoundary from '../../../components/error/ErrorBoundary';
import EscrowReceipt, { openReceiptWindow } from '../../../components/escrow/EscrowReceipt';
import {
  buildApproveMilestoneTx,
  buildSubmitMilestoneTx,
  buildRaiseDisputeTx,
  broadcastTransaction,
} from '../../../lib/stellar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const STELLAR_NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK;

const PLACEHOLDER_ESCROW = {
  id: 1,
  title: 'Smart Contract Audit',
  status: 'Active',
  txHash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  clientAddress: 'GABCD...1234',
  freelancerAddress: 'GXYZ...5678',
  totalAmount: '2,000 USDC',
  remainingBalance: '1,500 USDC',
  createdAt: '2025-03-01',
  deadline: '2025-04-01',
  transactionHash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2',
  terms: '',
  evidenceHashes: [],
  arbiterAddress: null,
  disputeDescription: null,
  milestones: [
    {
      id: 0,
      title: 'Codebase Review',
      amount: '500 USDC',
      status: 'Approved',
      submittedAt: '2025-03-05',
    },
    {
      id: 1,
      title: 'Vulnerability Report',
      amount: '1,000 USDC',
      status: 'Submitted',
      submittedAt: '2025-03-12',
    },
    {
      id: 2,
      title: 'Final Sign-off',
      amount: '500 USDC',
      status: 'Pending',
      submittedAt: null,
    },
  ],
};

function stellarExpertUrl(hash, type = 'tx') {
  const net = STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/${type}/${hash}`;
}

export default function EscrowDetailPage({ params }) {
  const { id } = params;
  const [isDisputeOpen, setDisputeOpen] = useState(false);
  const [isCancelOpen, setCancelOpen] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const { escrow: fetchedEscrow, isLoading, mutate } = useEscrow(id);
  const { address, signTx } = useWallet();
  const relativeTime = useRelativeTime(lastRefreshed);
  const { showToast } = useToast();

  const escrow = fetchedEscrow ?? PLACEHOLDER_ESCROW;

  useEffect(() => {
    setLastRefreshed(new Date());
  }, [fetchedEscrow]);

  useEffect(() => {
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    if (!id) return;
    setEventsLoading(true);
    fetch(`${API_BASE}/api/escrows/${id}/events`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setEvents(Array.isArray(data) ? data : data?.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await mutate();
      setLastRefreshed(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  const connectedRole = address
    ? address === escrow.clientAddress
      ? 'client'
      : address === escrow.freelancerAddress
        ? 'freelancer'
        : address === escrow.arbiterAddress
          ? 'arbiter'
          : 'observer'
    : 'observer';

  const handleApproveMilestone = async (milestoneId) => {
    setIsActionLoading(true);
    try {
      if (!address) throw new Error('Please connect your wallet first');
      const unsignedXdr = await buildApproveMilestoneTx({
        sourceAddress: address,
        escrowId: BigInt(id).toString(),
        milestoneId: Number(milestoneId),
      });
      const signedXdr = await signTx(unsignedXdr);
      await broadcastTransaction(signedXdr);
      showToast('Milestone approved', 'success');
      await mutate();
    } catch (err) {
      showToast(err.message || 'Failed to approve milestone', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSubmitMilestone = async (milestoneId) => {
    setIsActionLoading(true);
    try {
      if (!address) throw new Error('Please connect your wallet first');
      const unsignedXdr = await buildSubmitMilestoneTx({
        sourceAddress: address,
        escrowId: BigInt(id).toString(),
        milestoneId: Number(milestoneId),
      });
      const signedXdr = await signTx(unsignedXdr);
      await broadcastTransaction(signedXdr);
      showToast('Milestone submitted', 'success');
      await mutate();
    } catch (err) {
      showToast(err.message || 'Failed to submit milestone', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRejectMilestone = async (milestoneId) => {
    setIsActionLoading(true);
    try {
      if (!address) throw new Error('Please connect your wallet first');
      showToast('Milestone rejection not yet implemented', 'warning');
    } catch (err) {
      showToast(err.message || 'Failed to reject milestone', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancelEscrow = async () => {
    setIsActionLoading(true);
    try {
      if (!address) throw new Error('Please connect your wallet first');
      showToast('Escrow cancellation not yet implemented', 'warning');
      setCancelOpen(false);
    } catch (err) {
      showToast(err.message || 'Failed to cancel escrow', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading && !fetchedEscrow) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-gray-400">
        Loading escrow…
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{escrow.title}</h1>
            <Badge status={escrow.status} />
          </div>
          <p className="text-gray-400 text-sm">Escrow #{id}</p>
          {escrow.txHash && (
            <StellarExpertLink txHash={escrow.txHash} />
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              openReceiptWindow({
                escrow: { ...escrow, clientName: escrow.clientName, freelancerName: escrow.freelancerName },
                network: STELLAR_NETWORK,
              })
            }
          >
            ⤓ Download PDF
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              openReceiptWindow({
                escrow: { ...escrow, clientName: escrow.clientName, freelancerName: escrow.freelancerName },
                network: STELLAR_NETWORK,
              })
            }
          >
            🖨 Print
          </Button>
          {escrow.status === 'Active' && (
            <>
              <Button variant="danger" size="sm" onClick={() => setDisputeOpen(true)}>
                ⚠ Raise Dispute
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCancelOpen(true)}>
                Cancel Escrow
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Refresh bar */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span data-testid="last-refreshed">
          {relativeTime ? `Last updated: ${relativeTime}` : 'Loading…'}
        </span>
        <Button variant="ghost" size="sm" onClick={handleRefresh} isLoading={isRefreshing} aria-label="Refresh escrow data">
          ↻ Refresh
        </Button>
      </div>

      {/* Two-column layout: main info left, event timeline right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column (main info) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCell label="Total" value={escrow.totalAmount} isAmount />
            <InfoCell label="Remaining" value={escrow.remainingBalance} isAmount />
            <InfoCell label="Created" value={escrow.createdAt} />
            <InfoCell label="Deadline" value={escrow.deadline || 'None'} />
          </div>

          {/* Transaction Hash */}
          {escrow.transactionHash && (
            <div className="card">
              <TransactionHash
                hash={escrow.transactionHash}
                label="Transaction Hash"
                explorerUrl={stellarExpertUrl(escrow.transactionHash)}
              />
            </div>
          )}

          {/* Parties */}
          <div className="card grid grid-cols-1 md:grid-cols-2 gap-6">
            <PartyCard role="Client" address={escrow.clientAddress} score={92} isYou={connectedRole === 'client'} />
            <PartyCard role="Freelancer" address={escrow.freelancerAddress} score={78} isYou={connectedRole === 'freelancer'} />
            {escrow.arbiterAddress && (
              <PartyCard role="Arbiter" address={escrow.arbiterAddress} score={null} isYou={connectedRole === 'arbiter'} />
            )}
          </div>

          {/* Terms */}
          {escrow.terms && (
            <ErrorBoundary>
              <div className="card">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Terms</h2>
                <p className="text-gray-200 text-sm whitespace-pre-wrap">{escrow.terms}</p>
              </div>
            </ErrorBoundary>
          )}

          {/* Evidence Hashes */}
          {escrow.evidenceHashes && escrow.evidenceHashes.length > 0 && (
            <ErrorBoundary>
              <div className="card space-y-3">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Evidence on Chain</h2>
                {escrow.evidenceHashes.map((hash, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <code className="font-mono text-xs text-indigo-300 truncate flex-1">{hash}</code>
                    <a
                      href={stellarExpertUrl(hash, 'tx')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex-shrink-0"
                      title="Verify on Stellar Expert"
                    >
                      Verify ↗
                    </a>
                  </div>
                ))}
                <p className="text-xs text-gray-500">
                  To verify: click "Verify" to view the transaction on Stellar Expert and confirm the evidence hash matches the on-chain data field.
                </p>
              </div>
            </ErrorBoundary>
          )}

          {/* Dispute section visible to arbiters */}
          {connectedRole === 'arbiter' && escrow.status === 'Disputed' && (
            <ErrorBoundary>
              <div className="card border border-red-500/20 space-y-3">
                <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">Dispute Details</h2>
                {escrow.disputeDescription && (
                  <p className="text-gray-200 text-sm">{escrow.disputeDescription}</p>
                )}
                {escrow.evidenceHashes && escrow.evidenceHashes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Submitted Evidence</p>
                    {escrow.evidenceHashes.map((hash, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <code className="font-mono text-xs text-indigo-300 truncate flex-1">{hash}</code>
                        <a
                          href={stellarExpertUrl(hash, 'tx')}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          Verify ↗
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ErrorBoundary>
          )}

          {/* Milestones */}
          <ErrorBoundary>
            <section>
              <h2 className="text-lg font-semibold text-white mb-4">Milestones</h2>
              <MilestoneList
                milestones={escrow.milestones}
                role={connectedRole}
                onApprove={handleApproveMilestone}
                onReject={handleRejectMilestone}
                onSubmit={handleSubmitMilestone}
              />
            </section>
          </ErrorBoundary>
        </div>

        {/* Right column: event timeline */}
        <div className="lg:col-span-1">
          <ErrorBoundary>
            <div className="card sticky top-6">
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Event History</h2>
              {eventsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="sm" />
                </div>
              ) : events.length === 0 ? (
                <p className="text-gray-500 text-sm">No events recorded yet.</p>
              ) : (
                <EventTimeline events={events} />
              )}
            </div>
          </ErrorBoundary>
        </div>
      </div>

      {/* Dispute Modal */}
      <DisputeModal
        isOpen={isDisputeOpen}
        onClose={() => setDisputeOpen(false)}
        escrowId={id}
        onSuccess={async () => await mutate()}
      />

      {/* Cancel Escrow Modal */}
      <CancelEscrowModal
        isOpen={isCancelOpen}
        onClose={() => setCancelOpen(false)}
        escrowId={id}
        onConfirm={handleCancelEscrow}
      />
    </div>
  );
}

function EventTimeline({ events }) {
  return (
    <ol className="relative border-l border-gray-700 ml-2 space-y-6">
      {events.map((event, i) => (
        <li key={i} className="ml-4">
          <span className="absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-gray-900" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">
              {event.type || event.state || event.event || 'State change'}
            </p>
            {event.timestamp && (
              <time className="text-xs text-gray-500 block">
                {new Date(event.timestamp).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            )}
            {event.actor && (
              <p className="text-xs text-gray-500">
                by <span className="font-mono text-gray-400">{event.actor}</span>
              </p>
            )}
            {event.txHash && (
              <a
                href={stellarExpertUrl(event.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
              >
                <span className="font-mono">{event.txHash.slice(0, 8)}…{event.txHash.slice(-4)}</span>
                <span>↗</span>
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function InfoCell({ label, value, isAmount = false }) {
  return (
    <div className="card py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      {isAmount ? (
        <CurrencyAmount amount={value} showUsdc size="md" className="mt-1" />
      ) : (
        <p className="text-white font-semibold mt-1">{value}</p>
      )}
    </div>
  );
}

function PartyCard({ role, address, score, isYou }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{role}</p>
      <div className="flex items-center gap-3">
        <Avatar address={address} size="md" className="rounded-full" />
        <div>
          <TruncatedAddress address={address} />
          {isYou && (
            <span className="ml-2 text-xs bg-indigo-600/20 text-indigo-400 px-1.5 py-0.5 rounded">
              You
            </span>
          )}
        </div>
        {score !== null && <ReputationBadge score={score} size="sm" />}
      </div>
    </div>
  );
}

function StellarExpertLink({ txHash }) {
  return (
    <a
      href={stellarExpertUrl(txHash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
    >
      View on Stellar Expert
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}
