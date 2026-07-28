'use client';

/**
 * TermsDiff
 *
 * Visual diff between two versions of escrow/contract terms, shown in the
 * dispute flow so both parties and the mediator can see exactly what
 * changed between the original agreement and a proposed amendment.
 *
 * Word-level changes render inside semantic <ins>/<del> elements with
 * visually-hidden "(added)"/"(removed)" text, so the change type is never
 * conveyed by color alone. A "Side by side" view is available for
 * comparing the full original and proposed text independently.
 *
 * @param {object} props
 * @param {string} props.before               - original terms text
 * @param {string} props.after                - proposed/amended terms text
 * @param {string} [props.beforeLabel='Original Terms']
 * @param {string} [props.afterLabel='Proposed Terms']
 * @param {string} [props.className]
 */

import { useMemo, useState } from 'react';
import { diffWords } from '../../lib/textDiff';

function DiffedText({ before, after }) {
  const parts = useMemo(() => diffWords(before ?? '', after ?? ''), [before, after]);

  return (
    <p className="whitespace-pre-wrap leading-relaxed text-sm text-gray-800 dark:text-gray-200">
      {parts.map((part, idx) => {
        if (part.type === 'equal') {
          return <span key={idx}>{part.value}</span>;
        }
        if (part.type === 'added') {
          return (
            <ins
              key={idx}
              className="no-underline rounded px-0.5 bg-emerald-100 text-emerald-800
                         dark:bg-emerald-500/20 dark:text-emerald-300"
            >
              {part.value}
              <span className="sr-only"> (added)</span>
            </ins>
          );
        }
        return (
          <del
            key={idx}
            className="rounded px-0.5 bg-red-100 text-red-700 line-through decoration-red-400
                       dark:bg-red-500/20 dark:text-red-300 dark:decoration-red-500"
          >
            {part.value}
            <span className="sr-only"> (removed)</span>
          </del>
        );
      })}
    </p>
  );
}

export default function TermsDiff({
  before,
  after,
  beforeLabel = 'Original Terms',
  afterLabel = 'Proposed Terms',
  className = '',
}) {
  const [view, setView] = useState('unified');

  const stats = useMemo(() => {
    const parts = diffWords(before ?? '', after ?? '');
    return parts.reduce(
      (acc, p) => {
        if (p.type === 'added') acc.added += 1;
        if (p.type === 'removed') acc.removed += 1;
        return acc;
      },
      { added: 0, removed: 0 },
    );
  }, [before, after]);

  const hasChanges = stats.added > 0 || stats.removed > 0;

  const tabs = [
    { id: 'unified', label: 'Unified' },
    { id: 'split', label: 'Side by side' },
  ];

  const handleTabKeyDown = (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    setView((current) => (current === 'unified' ? 'split' : 'unified'));
  };

  return (
    <section
      aria-label="Contract terms comparison"
      className={`rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900 p-4 sm:p-5 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Terms Comparison</h3>

        <div className="flex items-center gap-3 text-xs" role="status" aria-live="polite">
          {hasChanges ? (
            <>
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-sm bg-emerald-500" aria-hidden="true" />
                {stats.added} addition{stats.added === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400">
                <span className="w-2 h-2 rounded-sm bg-red-500" aria-hidden="true" />
                {stats.removed} removal{stats.removed === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span className="text-gray-500">No changes detected</span>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Diff view mode"
        className="inline-flex rounded-lg border border-gray-200 dark:border-gray-800 p-0.5 mb-4"
      >
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`terms-diff-tab-${id}`}
            aria-selected={view === id}
            aria-controls={`terms-diff-panel-${id}`}
            tabIndex={view === id ? 0 : -1}
            onClick={() => setView(id)}
            onKeyDown={handleTabKeyDown}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
              ${
                view === id
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'unified' ? (
        <div id="terms-diff-panel-unified" role="tabpanel" aria-labelledby="terms-diff-tab-unified">
          <DiffedText before={before} after={after} />
        </div>
      ) : (
        <div
          id="terms-diff-panel-split"
          role="tabpanel"
          aria-labelledby="terms-diff-tab-split"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {beforeLabel}
            </h4>
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {before}
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {afterLabel}
            </h4>
            <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {after}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
