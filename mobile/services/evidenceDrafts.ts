/**
 * Offline drafts of dispute evidence.
 *
 * Users can write evidence for a disputed escrow while offline. Drafts are
 * kept in MMKV (so they survive restarts), can be deleted before they are
 * sent, and are uploaded as text evidence once the device is online. A draft
 * is removed only after the server accepted it; if the server rejects it, it
 * is kept as `failed` with the reason so the user can decide what to do.
 *
 * Drafts hold the evidence text only. File attachments are not drafted.
 */

export interface EvidenceDraft {
  id: string;
  escrowId: string;
  description: string;
  createdAt: number;
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface KeyValueStore {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}

export interface DraftSyncDeps {
  store: KeyValueStore;
  /** Dispute id for an escrow (the evidence endpoint is keyed by dispute). */
  resolveDisputeId: (escrowId: string) => Promise<number>;
  submitEvidence: (disputeId: number, description: string) => Promise<void>;
  now?: () => number;
  newId?: () => string;
}

export const EVIDENCE_DRAFTS_STORAGE_KEY = 'evidence_drafts';
export const MAX_DESCRIPTION_LENGTH = 5_000;

export class DraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DraftValidationError';
  }
}

// === Persistence

export function readDrafts(store: KeyValueStore): EvidenceDraft[] {
  const raw = store.getString(EVIDENCE_DRAFTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EvidenceDraft[]) : [];
  } catch {
    return [];
  }
}

function writeDrafts(store: KeyValueStore, drafts: EvidenceDraft[]): void {
  store.set(EVIDENCE_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

function defaultId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// === Operations

export function draftsForEscrow(store: KeyValueStore, escrowId: string): EvidenceDraft[] {
  return readDrafts(store).filter((draft) => draft.escrowId === escrowId);
}

export function saveDraft(
  store: KeyValueStore,
  escrowId: string,
  description: string,
  { now = Date.now, newId = defaultId }: Pick<DraftSyncDeps, 'now' | 'newId'> = {},
): EvidenceDraft {
  const text = description.trim();
  if (!text) throw new DraftValidationError('Write some evidence before saving.');
  if (text.length > MAX_DESCRIPTION_LENGTH) {
    throw new DraftValidationError(`Evidence must be under ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  const draft: EvidenceDraft = {
    id: newId(),
    escrowId,
    description: text,
    createdAt: now(),
    status: 'pending',
  };
  writeDrafts(store, [...readDrafts(store), draft]);
  return draft;
}

export function deleteDraft(store: KeyValueStore, id: string): void {
  writeDrafts(
    store,
    readDrafts(store).filter((draft) => draft.id !== id),
  );
}

interface HttpLikeError {
  response?: { status?: number; data?: { error?: unknown; message?: unknown } };
  message?: string;
}

function isRetryable(err: unknown): boolean {
  const status = (err as HttpLikeError)?.response?.status;
  return status === undefined || status >= 500 || status === 429;
}

function errorMessage(err: unknown): string {
  const e = err as HttpLikeError;
  const data = e?.response?.data;
  const serverMessage = data?.error ?? data?.message;
  if (typeof serverMessage === 'string') return serverMessage;
  if (serverMessage && typeof serverMessage === 'object' && 'message' in serverMessage) {
    return String((serverMessage as { message: unknown }).message);
  }
  return e?.message ?? 'Upload failed';
}

export interface SyncResult {
  uploaded: string[];
  failed: string[];
}

/**
 * Upload every pending draft. Uploaded drafts are removed; drafts the server
 * rejects become `failed`; drafts that hit a network error stay pending for
 * the next sync.
 */
export async function syncDrafts(deps: DraftSyncDeps): Promise<SyncResult> {
  const result: SyncResult = { uploaded: [], failed: [] };
  const remaining: EvidenceDraft[] = [];

  for (const draft of readDrafts(deps.store)) {
    if (draft.status !== 'pending') {
      remaining.push(draft);
      continue;
    }
    try {
      const disputeId = await deps.resolveDisputeId(draft.escrowId);
      await deps.submitEvidence(disputeId, draft.description);
      result.uploaded.push(draft.id);
    } catch (err) {
      if (isRetryable(err)) {
        remaining.push(draft);
      } else {
        remaining.push({ ...draft, status: 'failed', lastError: errorMessage(err) });
        result.failed.push(draft.id);
      }
    }
  }

  // Drafts created or deleted while the uploads were in flight must not be
  // lost or resurrected: merge against the current stored list.
  const current = readDrafts(deps.store);
  const done = new Set(result.uploaded);
  const updated = new Map(remaining.map((draft) => [draft.id, draft]));
  writeDrafts(
    deps.store,
    current.filter((draft) => !done.has(draft.id)).map((draft) => updated.get(draft.id) ?? draft),
  );
  return result;
}
