'use client';

/**
 * useOptimisticAction — apply a UI update immediately, then reconcile with
 * the server response. Rolls back to the previous state automatically if
 * the async action rejects, and exposes the error so callers can surface it.
 *
 * Usage:
 *   const { state, run, isPending, error } = useOptimisticAction(initialState);
 *   run({
 *     optimisticUpdate: (prev) => ({ ...prev, status: 'Approved' }),
 *     action: () => api.approveEscrow(id),
 *     onSuccess: (result, prev) => ({ ...prev, ...result }),
 *   });
 */

import { useCallback, useRef, useState } from 'react';

export function useOptimisticAction(initialState) {
  const [state, setState] = useState(initialState);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(null);
  const rollbackRef = useRef(initialState);

  const run = useCallback(
    async ({ optimisticUpdate, action, onSuccess, onError }) => {
      setError(null);
      let previous;
      setState((prev) => {
        previous = prev;
        rollbackRef.current = prev;
        return optimisticUpdate(prev);
      });
      setIsPending(true);

      try {
        const result = await action();
        setState((prev) => (onSuccess ? onSuccess(result, prev) : prev));
        return result;
      } catch (err) {
        setState(rollbackRef.current ?? previous);
        setError(err);
        if (onError) onError(err, rollbackRef.current ?? previous);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  const reset = useCallback((next) => {
    setState(next);
    rollbackRef.current = next;
    setError(null);
  }, []);

  return { state, setState: reset, run, isPending, error };
}

/**
 * useOptimisticList — same principle applied to a keyed collection (e.g. a
 * list of milestones or escrow rows). `getId` identifies which item an
 * optimistic patch/removal applies to.
 */
export function useOptimisticList(initialItems, getId = (item) => item.id) {
  const [items, setItems] = useState(initialItems);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const snapshotRef = useRef(initialItems);

  const patchItem = useCallback(
    async (id, patch, action) => {
      snapshotRef.current = items;
      setItems((prev) => prev.map((item) => (getId(item) === id ? { ...item, ...patch } : item)));
      setPendingIds((prev) => new Set(prev).add(id));

      try {
        const result = await action();
        setItems((prev) =>
          prev.map((item) => (getId(item) === id ? { ...item, ...(result || {}) } : item)),
        );
        return result;
      } catch (err) {
        setItems(snapshotRef.current);
        throw err;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [items, getId],
  );

  const removeItem = useCallback(
    async (id, action) => {
      snapshotRef.current = items;
      setItems((prev) => prev.filter((item) => getId(item) !== id));
      setPendingIds((prev) => new Set(prev).add(id));

      try {
        return await action();
      } catch (err) {
        setItems(snapshotRef.current);
        throw err;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [items, getId],
  );

  return { items, setItems, patchItem, removeItem, isPending: (id) => pendingIds.has(id) };
}
