'use client';

import { cn } from '../../lib/utils';

export type EvidenceKind = 'pdf' | 'image';

export interface Evidence {
  id: string;
  name: string;
  kind: EvidenceKind;
  url: string;
}

interface EvidenceViewerProps {
  evidence: Evidence;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * Renders a piece of dispute evidence. Handles three visual states required by
 * the design system: loading, loaded (PDF via iframe / image via <img>), and a
 * gateway error with a retry affordance.
 */
export default function EvidenceViewer({
  evidence,
  isLoading = false,
  error = null,
  onRetry,
}: EvidenceViewerProps) {
  const panel = 'w-full max-w-xl rounded-xl border border-gray-700 bg-gray-800/60 p-4';

  if (isLoading) {
    return (
      <div
        className={cn(panel, 'flex items-center gap-3 text-gray-300')}
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-indigo-400"
        />
        <span className="text-sm">Loading {evidence.name}…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(panel, 'border-red-700 bg-red-900/30')} role="alert">
        <p className="text-sm font-medium text-red-300">Could not load evidence</p>
        <p className="mt-1 text-xs text-red-200/80">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-600 px-3 py-1.5 text-xs font-medium text-red-200 transition-colors hover:bg-red-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          Retry from gateway
        </button>
      </div>
    );
  }

  return (
    <div className={panel}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-medium text-white">{evidence.name}</h3>
        <span className="text-xs uppercase tracking-wide text-gray-500">{evidence.kind}</span>
      </div>
      {evidence.kind === 'image' ? (
        <img
          src={evidence.url}
          alt={`Evidence preview for ${evidence.name}`}
          className="max-h-80 w-full rounded-lg object-contain"
        />
      ) : (
        <iframe
          title={`PDF preview for ${evidence.name}`}
          src={evidence.url}
          className="h-80 w-full rounded-lg border border-gray-700 bg-white"
        />
      )}
    </div>
  );
}
