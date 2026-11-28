/**
 * MilestoneItem Component
 *
 * Renders a single milestone row with its status, amount,
 * and contextual action buttons based on the viewer's role.
 */

'use client';

import { useEffect, useState } from 'react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import CurrencyAmount from '../ui/CurrencyAmount';
import { useI18n } from '../../i18n/index.jsx';
import { useToast } from '../../contexts/ToastContext';
import {
  contentGatewayUrl,
  isPublishedDescriptionHash,
  resolveVerifiedDescription,
} from '../../lib/verifyDescriptionHash';

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
  const [description, setDescription] = useState({ status: 'idle' });
  const { t, formatDate } = useI18n();
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    if (!isPublishedDescriptionHash(milestone.descriptionHash)) {
      setDescription({ status: 'missing' });
      return undefined;
    }
    setDescription({ status: 'loading' });
    resolveVerifiedDescription(milestone.descriptionHash).then((result) => {
      if (!cancelled) setDescription(result);
    });
    return () => {
      cancelled = true;
    };
  }, [milestone.descriptionHash]);

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
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ring-2 ring-gray-900 ${dotColor}`}
        />
        {!isLast && <div className="w-px flex-1 bg-gray-800 mt-1 min-h-[24px]" />}
      </div>

      <div className="flex-1 pb-4">
        <div className="card space-y-3">
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

          <DescriptionPanel description={description} hash={milestone.descriptionHash} />

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

function DescriptionPanel({ description, hash }) {
  if (description.status === 'loading' || description.status === 'idle') {
    return <p className="text-xs text-gray-600">Verifying description…</p>;
  }
  if (description.status === 'missing') {
    return <p className="text-xs text-gray-600">Description not published on-chain.</p>;
  }
  if (description.status === 'mismatch') {
    return (
      <p className="text-xs text-red-400" role="alert">
        Description hash mismatch — off-chain content was rejected.
      </p>
    );
  }
  if (description.status === 'timeout') {
    return (
      <div className="text-xs text-amber-400 space-y-1">
        <p>Description gateway timed out. Escrow actions remain available.</p>
        {contentGatewayUrl(hash) && (
          <a
            href={contentGatewayUrl(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 hover:text-indigo-300 underline"
          >
            Retry via gateway
          </a>
        )}
      </div>
    );
  }
  if (description.status === 'ok') {
    return (
      <div className="text-xs text-gray-300 space-y-1">
        <p className="whitespace-pre-wrap">{description.text}</p>
        <p className="font-mono break-all text-gray-500">{hash}</p>
      </div>
    );
  }
  return <p className="text-xs text-gray-600">Description unavailable.</p>;
}

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