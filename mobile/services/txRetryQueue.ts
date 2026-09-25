/**
 * Retry queue for signed transaction submissions.
 *
 * When the API cannot be reached, a signed XDR is kept in MMKV and submitted
 * again when connectivity returns, so the user does not have to re-sign or
 * re-paste it. Every attempt carries the transaction hash as its
 * `Idempotency-Key`, so a retry of a submission that did reach the server
 * returns the stored result instead of broadcasting twice. Permanent errors
 * (the server rejected the transaction) are kept as failed entries so the UI
 * can show them; they are never retried.
 */

import { TransactionBuilder } from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from '../lib/stellar';

export interface QueuedTransaction {
  /** Transaction hash (hex); also the idempotency key. */
  id: string;
  xdr: string;
  enqueuedAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface BroadcastResult {
  hash: string;
  status: string;
}

export type SubmitOutcome =
  | { status: 'submitted'; result: BroadcastResult }
  | { status: 'queued'; id: string };

/** The server rejected the transaction; retrying cannot help. */
export class PermanentSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentSubmissionError';
  }
}

export interface KeyValueStore {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}

export interface QueueDeps {
  store: KeyValueStore;
  broadcast: (xdr: string, idempotencyKey: string) => Promise<BroadcastResult>;
  now?: () => number;
}

export const TX_QUEUE_STORAGE_KEY = 'tx_retry_queue';
export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5_000;
const MAX_BACKOFF_MS = 5 * 60_000;

// === Hashing and error classification

/** Hash of the signed transaction, used to de-duplicate submissions. */
export function transactionId(xdr: string, passphrase: string = NETWORK_PASSPHRASE): string {
  try {
    return TransactionBuilder.fromXDR(xdr, passphrase).hash().toString('hex');
  } catch {
    throw new PermanentSubmissionError('The signed transaction XDR is not valid.');
  }
}

interface HttpLikeError {
  response?: { status?: number; data?: { error?: unknown; message?: unknown } };
  message?: string;
}

/**
 * Retryable: no response at all (offline, DNS, timeout), 5xx, 429, or 409
 * (the same idempotency key is still in flight). Anything else from the
 * server is a rejection of the transaction itself.
 */
export function isRetryable(err: unknown): boolean {
  const status = (err as HttpLikeError)?.response?.status;
  if (status === undefined) return true;
  return status >= 500 || status === 429 || status === 409;
}

function errorMessage(err: unknown): string {
  const e = err as HttpLikeError;
  const serverMessage = e?.response?.data?.error ?? e?.response?.data?.message;
  if (typeof serverMessage === 'string') return serverMessage;
  return e?.message ?? 'Transaction submission failed';
}

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

// === Persistence

export function readQueue(store: KeyValueStore): QueuedTransaction[] {
  const raw = store.getString(TX_QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedTransaction[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(store: KeyValueStore, queue: QueuedTransaction[]): void {
  store.set(TX_QUEUE_STORAGE_KEY, JSON.stringify(queue));
}

// === Operations

/**
 * Submit a signed transaction, queueing it for retry if the API is
 * unreachable. Throws PermanentSubmissionError if the server rejects it.
 */
export async function submitOrQueue(xdr: string, deps: QueueDeps): Promise<SubmitOutcome> {
  const now = deps.now ?? Date.now;
  const id = transactionId(xdr);

  try {
    const result = await deps.broadcast(xdr, id);
    return { status: 'submitted', result };
  } catch (err) {
    if (!isRetryable(err)) throw new PermanentSubmissionError(errorMessage(err));

    const queue = readQueue(deps.store);
    if (!queue.some((entry) => entry.id === id)) {
      queue.push({
        id,
        xdr,
        enqueuedAt: now(),
        attempts: 1,
        nextAttemptAt: now() + backoffMs(1),
        status: 'pending',
        lastError: errorMessage(err),
      });
      writeQueue(deps.store, queue);
    }
    return { status: 'queued', id };
  }
}

export interface ProcessResult {
  submitted: string[];
  failed: string[];
}

/**
 * Retry every pending entry that is due. Successful submissions are removed;
 * permanent rejections, and entries that exhaust MAX_ATTEMPTS, become
 * `failed` so the UI can show them.
 */
export async function processQueue(deps: QueueDeps): Promise<ProcessResult> {
  const now = deps.now ?? Date.now;
  const result: ProcessResult = { submitted: [], failed: [] };
  const remaining: QueuedTransaction[] = [];

  for (const entry of readQueue(deps.store)) {
    if (entry.status !== 'pending' || entry.nextAttemptAt > now()) {
      remaining.push(entry);
      continue;
    }
    try {
      await deps.broadcast(entry.xdr, entry.id);
      result.submitted.push(entry.id);
    } catch (err) {
      const attempts = entry.attempts + 1;
      const permanent = !isRetryable(err) || attempts >= MAX_ATTEMPTS;
      remaining.push({
        ...entry,
        attempts,
        nextAttemptAt: now() + backoffMs(attempts),
        status: permanent ? 'failed' : 'pending',
        lastError: errorMessage(err),
      });
      if (permanent) result.failed.push(entry.id);
    }
  }

  writeQueue(deps.store, remaining);
  return result;
}

/** Remove an entry (for example after the user has seen a failure). */
export function dismissQueued(store: KeyValueStore, id: string): void {
  writeQueue(
    store,
    readQueue(store).filter((entry) => entry.id !== id),
  );
}
