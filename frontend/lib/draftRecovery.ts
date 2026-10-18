export type DraftRecoveryStatus = 'idle' | 'loading' | 'empty' | 'success' | 'failure';

export interface DraftRecoveryState<T> {
  status: DraftRecoveryStatus;
  draft: T | null;
  error: string | null;
}

export interface DraftRecoveryResult<T> {
  draft: T | null;
  error: string | null;
}

/**
 * Loads a persisted escrow creation draft and maps the outcome to an explicit
 * recovery state. The caller's current in-progress input is always preserved:
 * on loading/empty/failure the provided `currentDraft` is retained so a
 * recoverable failure never discards what the user has typed.
 */
export async function recoverDraft<T>(
  load: () => Promise<T | null>,
  currentDraft: T | null,
): Promise<DraftRecoveryState<T>> {
  try {
    const draft = await load();
    if (draft === null || draft === undefined) {
      return { status: 'empty', draft: currentDraft, error: null };
    }
    return { status: 'success', draft, error: null };
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : 'Unable to recover draft';
    return { status: 'failure', draft: currentDraft, error: message };
  }
}

/**
 * Synchronous variant for already-resolved draft sources (e.g. local storage
 * reads). Mirrors {@link recoverDraft} state semantics without async work.
 */
export function recoverDraftSync<T>(
  load: () => T | null,
  currentDraft: T | null,
): DraftRecoveryState<T> {
  try {
    const draft = load();
    if (draft === null || draft === undefined) {
      return { status: 'empty', draft: currentDraft, error: null };
    }
    return { status: 'success', draft, error: null };
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : 'Unable to recover draft';
    return { status: 'failure', draft: currentDraft, error: message };
  }
}

export function initialDraftRecoveryState<T>(draft: T | null): DraftRecoveryState<T> {
  return { status: 'idle', draft, error: null };
}
