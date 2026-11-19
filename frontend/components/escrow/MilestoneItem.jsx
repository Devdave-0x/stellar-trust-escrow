/**
 * MilestoneItem Component
 *
 * Renders a single milestone row with its status, amount,
 * and contextual action buttons based on the viewer's role.
 *
 * Action matrix:
 *  ┌──────────────┬─────────────────────────────────────────────┐
 *  │ Status       │ Client can         │ Freelancer can         │
 *  ├──────────────┼────────────────────┼────────────────────────┤
 *  │ Pending      │ —                  │ Submit Work            │
 *  │ Submitted    │ Approve / Reject   │ —                      │
 *  │ Approved     │ — (funds released) │ —                      │
 *  │ Rejected     │ —                  │ Submit Work (retry)    │
 *  └──────────────┴────────────────────┴────────────────────────┘
 *
 * Multisig (Issue #928):
 *  When signer weight / approval threshold / current approvals are provided
 *  (either as explicit props or via `milestone.multisig`), the card shows the
 *  signer weight, the approval threshold, and how many approvals remain before
 *  the milestone action becomes effective.
 *
 * @param {object}   props
 * @param {object}   props.milestone
 * @param {number}   props.index           — for display numbering
 * @param {'client'|'freelancer'|'observer'} props.role
 * @param {Function} props.onApprove(id)
 * @param {Function} props.onReject(id)
 * @param {Function} props.onSubmit(id)
 * @param {boolean}  props.isLast
 * @param {number}   [props.signerWeight]   — weight of the current signer
 * @param {number}   [props.approvalThreshold] — approvals required to be effective
 * @param {Array|number} [props.approvals]  — current approvals (list or count)
 *
 * TODO (contributor — medium, Issue #40):
 * - Add confirmation modal before approve/reject
 * - Show tx hash link (Stellar Expert) after approval
 * - Add "View deliverable" link (IPFS hash)
 * - Handle loading state while tx is pending
 */

'use client';

import { useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import CurrencyAmount from '../ui/CurrencyAmount';
import { useI18n } from '../../i18n/index.jsx';
import { useToast } from '../../contexts/ToastContext';

/**
 * Normalises the approvals input into a numeric count.
 * Accepts a number, an array of approvals, or an object with a `count` field.
 */
function resolveApprovalCount(approvals) {
  if (approvals == null) return null;
  if (typeof approvals === 'number') return Number.isFinite(approvals) ? approvals : null;
  if (Array.isArray(approvals)) return approvals.length;
  if (typeof approvals === 'object' && typeof approvals.count === 'number') {
    return Number.isFinite(approvals.count) ? approvals.count : null;
  }
  return null;
}

/**
 * Resolves multisig data from explicit props, falling back to `milestone.multisig`.
 */
function resolveMultisig(milestone, signerWeight, approvalThreshold, approvals) {
  const source = milestone?.multisig ?? {};

  const weight =
    signerWeight != null ? signerWeight : (source.signerWeight ?? source.weight ?? null);
  const threshold =
    approvalThreshold != null
      ? approvalThreshold
      : (source.approvalThreshold ?? source.threshold ?? null);
  const approvalCount =
    approvals != null
      ? resolveApprovalCount(approvals)
      : resolveApprovalCount(source.approvals ?? source.approvalCount ?? null);

  const hasWeight = typeof weight === 'number' && Number.isFinite(weight);
  const hasThreshold = typeof threshold === 'number' && Number.isFinite(threshold);

  if (!hasWeight && !hasThreshold && approvalCount == null) {
    return null;
  }

  const remaining =
    hasThreshold && approvalCount != null ? Math.max(threshold - approvalCount, 0) : null;
  const isEffective = hasThreshold && approvalCount != null && approvalCount >= threshold;

  return {
    weight: hasWeight ? weight : null,
    threshold: hasThreshold ? threshold : null,
    approvals: approvalCount,
    remaining,
    isEffective,
  };
}

export default function MilestoneItem({
  milestone,
  index,
  role,
  onApprove,
  onReject,
  onSubmit,
  isLast,
  signerWeight,
  approvalThreshold,
  approvals,
}) {
  const [isActing, setIsActing] = useState(false);
  const { t, formatDate } = useI18n();
  const { showToast } = useToast();

  const handleAction = async (actionFn, actionName) => {
    setIsActing(true);
    try {
      await actionFn(milestone.id);
      showToast(`${actionName} milestone successful!`, 'success');
    } catch (err) {
      showToast(`Failed to ${actionName.toLowerCase()} milestone`, 'error');
      console.error(`${actionName} failed:`, err.message);
    } finally {
      setIsActing(false);
    }
  };

  // Determine which status icon to show in the timeline dot
  const dotColor =
    milestone.status === 'Approved'
      ? 'bg-emerald-500'
      : milestone.status === 'Submitted'
        ? 'bg-blue-500'
        : milestone.status === 'Rejected'
          ? 'bg-red-500'
          : 'bg-gray-700';

  const multisig = resolveMultisig(milestone, signerWeight, approvalThreshold, approvals);

  return (
    <div className="relative flex gap-4">
      {/* Timeline dot + connector */}
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ring-2 ring-gray-900 ${dotColor}`}
        />
        {!isLast && <div className="w-px flex-1 bg-gray-800 mt-1 min-h-[24px]" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="card space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-mono">
                  #{String(index + 1).padStart(2, '0')}
                </span>
                <h4 className="text-white font-medium">{milestone.title}</h4>
              </div>
              {milestone.submittedAt && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('milestone.status.submitted')}: {formatDate(milestone.submittedAt)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <CurrencyAmount amount={milestone.amount} size="sm" />
              <Badge status={milestone.status} size="sm" />
            </div>
          </div>

          {/* Multisig approval info (Issue #928) */}
          {multisig && <MultisigInfo multisig={multisig} t={t} />}

          {/* TODO (contributor — Issue #40): show description / IPFS link */}

          {/* Action Buttons */}
          {!isActing ? (
            <ActionButtons
              status={milestone.status}
              role={role}
              onApprove={() => handleAction(onApprove, 'approve')}
              onReject={() => handleAction(onReject, 'reject')}
              onSubmit={() => handleAction(onSubmit, 'submit')}
              t={t}
            />
          ) : (
            <p className="text-xs text-indigo-400 animate-pulse">{t('common.loading')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Renders signer weight, approval threshold, and remaining approvals.
 */
function MultisigInfo({ multisig, t }) {
  const { weight, threshold, approvals, remaining, isEffective } = multisig;

  return (
    <div
      className="rounded-md border border-gray-800 bg-gray-900/40 px-3 py-2 text-xs space-y-1"
      data-testid="multisig-info"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-400">
        {weight != null && (
          <span data-testid="multisig-signer-weight">
            {t('escrow.multisig.signerWeight')}:{' '}
            <span className="text-white font-medium">{weight}</span>
          </span>
        )}
        {threshold != null && (
          <span data-testid="multisig-threshold">
            {t('escrow.multisig.threshold')}:{' '}
            <span className="text-white font-medium">{threshold}</span>
          </span>
        )}
        {approvals != null && (
          <span data-testid="multisig-approvals">
            {t('escrow.multisig.approvals')}:{' '}
            <span className="text-white font-medium">{approvals}</span>
          </span>
        )}
      </div>

      {isEffective ? (
        <p className="text-emerald-400" data-testid="multisig-effective">
          ✓ {t('escrow.multisig.effective')}
        </p>
      ) : (
        remaining != null && (
          <p className="text-amber-400" data-testid="multisig-remaining">
            {t('escrow.multisig.remaining')}:{' '}
            <span className="font-medium">{remaining}</span>
          </p>
        )
      )}
    </div>
  );
}

/**
 * Renders the correct set of action buttons based on role + status.
 */
function ActionButtons({ status, role, onApprove, onReject, onSubmit, t }) {
  if (role === 'client' && status === 'Submitted') {
    return (
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={onApprove}>
          ✓ {t('escrow.actions.approve')}
        </Button>
        <Button variant="danger" size="sm" onClick={onReject}>
          ✗ {t('escrow.actions.reject')}
        </Button>
      </div>
    );
  }

  if (role === 'freelancer' && (status === 'Pending' || status === 'Rejected')) {
    return (
      <Button variant="secondary" size="sm" onClick={onSubmit}>
        📤 {t('escrow.actions.submit')}
      </Button>
    );
  }

  if (status === 'Approved') {
    return <p className="text-xs text-emerald-400">✓ {t('escrow.actions.approve')}</p>;
  }

  return null;
}