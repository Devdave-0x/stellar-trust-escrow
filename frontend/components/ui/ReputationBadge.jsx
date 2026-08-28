/**
 * ReputationBadge Component
 *
 * Displays a numerical reputation score with a color-coded ring and hover tooltip.
 * Reads tier threshold values from process.env with fallbacks.
 *
 * @param {object} props
 * @param {number} props.score  — 0–1000+
 * @param {'sm'|'md'|'lg'} [props.size='md']
 */

'use client';

import Tooltip from './Tooltip';

export default function ReputationBadge({ score, size = 'md' }) {
  const eliteThreshold = Number(process.env.NEXT_PUBLIC_REPUTATION_TIER_ELITE ?? 1000);
  const expertThreshold = Number(process.env.NEXT_PUBLIC_REPUTATION_TIER_EXPERT ?? 500);
  const verifiedThreshold = Number(process.env.NEXT_PUBLIC_REPUTATION_TIER_VERIFIED ?? 250);
  const trustedThreshold = Number(process.env.NEXT_PUBLIC_REPUTATION_TIER_TRUSTED ?? 100);

  const color =
    score >= eliteThreshold
      ? 'text-yellow-500 ring-yellow-500/30'
      : score >= expertThreshold
        ? 'text-amber-400 ring-amber-400/30'
        : score >= verifiedThreshold
          ? 'text-purple-400 ring-purple-400/30'
          : score >= trustedThreshold
            ? 'text-indigo-400 ring-indigo-400/30'
            : 'text-gray-400 ring-gray-600/30';

  const sizeClass =
    size === 'sm'
      ? 'w-10 h-10 text-sm'
      : size === 'lg'
        ? 'w-16 h-16 text-xl'
        : 'w-12 h-12 text-base';

  const getTier = (score) => {
    if (score >= eliteThreshold) return 'Elite';
    if (score >= expertThreshold) return 'Excellent';
    if (score >= verifiedThreshold) return 'Good';
    if (score >= trustedThreshold) return 'Fair';
    return 'New';
  };

  const tooltipContent = `${getTier(score)} • Score: ${score}`;

  return (
    <Tooltip content={tooltipContent} position="top">
      <div
        className={`${sizeClass} ${color} rounded-full ring-2 flex items-center justify-center font-bold cursor-help`}
        aria-label={`Reputation: ${getTier(score)} (${score} points)`}
      >
        {score}
      </div>
    </Tooltip>
  );
}
