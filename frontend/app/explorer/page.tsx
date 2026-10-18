'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ExplorerItem = {
  id: string;
  title: string;
};

type ExplorerPage = {
  items: ExplorerItem[];
  nextCursor: string | null;
};

type FetchState = 'idle' | 'loading' | 'success' | 'error';

const PAGE_SIZE = 20;

async function fetchExplorerPage(cursor: string | null): Promise<ExplorerPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) {
    params.set('cursor', cursor);
  }

  const response = await fetch(`/api/explorer?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to load explorer page (status ${response.status})`);
  }

  const data = (await response.json()) as ExplorerPage;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    nextCursor: data.nextCursor ?? null,
  };
}

export default function ExplorerPage() {
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<FetchState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const requestIdRef = useRef(0);

  const loadPage = useCallback(async (cursor: string | null, append: boolean) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setState('loading');
    setError(null);

    try {
      const page = await fetchExplorerPage(cursor);
      if (requestIdRef.current !== requestId) {
        return;
      }

      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
      setHasLoadedOnce(true);
      setState('success');
    } catch (err) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setError(err instanceof Error ? err.message : 'Failed to load explorer results');
      setState('error');
    }
  }, []);

  useEffect(() => {
    void loadPage(null, false);
  }, [loadPage]);

  const handleRetry = useCallback(() => {
    void loadPage(nextCursor, items.length > 0);
  }, [items.length, loadPage, nextCursor]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || state === 'loading') {
      return;
    }
    void loadPage(nextCursor, true);
  }, [loadPage, nextCursor, state]);

  const isInitialLoading = state === 'loading' && !hasLoadedOnce;
  const isInitialError = state === 'error' && !hasLoadedOnce;
  const isEmpty = state === 'success' && items.length === 0;
  const isPaginationError = state === 'error' && hasLoadedOnce;

  return (
    <main className="explorer">
      <h1>Explorer</h1>

      {isInitialLoading && (
        <div role="status" aria-live="polite" className="explorer-loading">
          Loading results…
        </div>
      )}

      {isInitialError && (
        <div role="alert" className="explorer-error">
          <p>{error ?? 'Failed to load explorer results'}</p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {isEmpty && (
        <div role="status" className="explorer-empty">
          No results found.
        </div>
      )}

      {items.length > 0 && (
        <ul className="explorer-list">
          {items.map((item) => (
            <li key={item.id}>{item.title}</li>
          ))}
        </ul>
      )}

      {isPaginationError && (
        <div role="alert" className="explorer-error">
          <p>{error ?? 'Failed to load more results'}</p>
          <button type="button" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      {state === 'loading' && hasLoadedOnce && (
        <div role="status" aria-live="polite" className="explorer-loading">
          Loading more results…
        </div>
      )}

      {nextCursor && state !== 'loading' && state !== 'error' && (
        <button type="button" onClick={handleLoadMore}>
          Load more
        </button>
      )}

      {hasLoadedOnce && !nextCursor && items.length > 0 && state === 'success' && (
        <p className="explorer-end">End of results.</p>
      )}
    </main>
  );
}
