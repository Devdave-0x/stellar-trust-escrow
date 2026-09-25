/**
 * App wiring for the transaction retry queue: MMKV storage, the broadcast
 * endpoint, and a connectivity listener that flushes the queue when the
 * device comes back online. UI subscribes to be told when the queue changes.
 */

import NetInfo from '@react-native-community/netinfo';
import { escrowApi } from '../lib/api';
import { storage } from '../lib/storage';
import {
  dismissQueued,
  processQueue,
  readQueue,
  submitOrQueue,
  type QueueDeps,
  type QueuedTransaction,
  type SubmitOutcome,
} from './txRetryQueue';

const deps: QueueDeps = {
  store: storage,
  broadcast: (xdr, idempotencyKey) => escrowApi.broadcast(xdr, idempotencyKey).then((r) => r.data),
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeTxQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTxQueue(): QueuedTransaction[] {
  return readQueue(storage);
}

export async function submitSignedTransaction(xdr: string): Promise<SubmitOutcome> {
  const outcome = await submitOrQueue(xdr, deps);
  if (outcome.status === 'queued') notify();
  return outcome;
}

let flushing = false;

export async function flushTxQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const { submitted, failed } = await processQueue(deps);
    if (submitted.length || failed.length) notify();
  } finally {
    flushing = false;
  }
}

export function dismissTx(id: string): void {
  dismissQueued(storage, id);
  notify();
}

/** Retry queued transactions whenever connectivity returns. Returns an unsubscribe. */
export function startTxRetryQueue(): () => void {
  void flushTxQueue();
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) void flushTxQueue();
  });
}
