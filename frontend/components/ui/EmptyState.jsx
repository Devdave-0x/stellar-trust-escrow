/**
 * EmptyState Component
 *
 * Displays a contextual SVG illustration, a title, a supporting message,
 * and an optional call-to-action when a list or page has no content.
 *
 * @param {object}   props
 * @param {string}   [props.title='No content found']
 * @param {string}   [props.description]
 * @param {'escrows' | 'disputes' | 'notifications' | 'search'} [props.type='escrows']
 * @param {string}   [props.actionLabel]   — label for the CTA button
 * @param {string}   [props.actionHref]    — renders CTA as a link if provided
 * @param {Function} [props.onAction]      — renders CTA as a button if provided
 * @param {string}   [props.className]
 */

import Link from 'next/link';
import {
  NoEscrowsIllustration,
  NoDisputesIllustration,
  NoNotificationsIllustration,
  SearchNoResultsIllustration,
} from './EmptyStateIllustrations';

export default function EmptyState({
  title = 'No content found',
  description,
  type = 'escrows',
  actionLabel,
  actionHref,
  onAction,
  className = '',
}) {
  const hasAction = actionLabel && (actionHref || onAction);

  const illustrations = {
    escrows: <NoEscrowsIllustration className="mb-6" />,
    disputes: <NoDisputesIllustration className="mb-6" />,
    notifications: <NoNotificationsIllustration className="mb-6" />,
    search: <SearchNoResultsIllustration className="mb-6" />,
  };

  return (
    <div
      className={`flex flex-col items-center justify-center py-20 text-center ${className}`}
      data-testid="empty-state"
    >
      {illustrations[type]}

      {/* Title */}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>

      {/* Supporting message */}
      {description && <p className="text-sm text-gray-400 max-w-xs mb-6">{description}</p>}

      {/* Call-to-action */}
      {hasAction &&
        (actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600
                       hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            {actionLabel}
          </Link>
        ) : (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600
                       hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            {actionLabel}
          </button>
        ))}
    </div>
  );
}
