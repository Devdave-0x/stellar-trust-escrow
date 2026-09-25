import {
  DraftValidationError,
  deleteDraft,
  draftsForEscrow,
  readDrafts,
  saveDraft,
  syncDrafts,
  type DraftSyncDeps,
  type KeyValueStore,
} from '../services/evidenceDrafts';

function memoryStore(backing = new Map<string, string>()): KeyValueStore {
  return { getString: (k) => backing.get(k), set: (k, v) => void backing.set(k, v) };
}

let seq = 0;
const ids = { newId: () => `d${++seq}`, now: () => 1_000 };

function deps(store: KeyValueStore, overrides: Partial<DraftSyncDeps> = {}): DraftSyncDeps {
  return {
    store,
    resolveDisputeId: jest.fn().mockResolvedValue(7),
    submitEvidence: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('evidence drafts', () => {
  it('persist across app restarts', () => {
    const backing = new Map<string, string>();
    saveDraft(memoryStore(backing), '42', '  Delivered files on 3 Sept  ', ids);

    const afterRestart = memoryStore(backing);
    expect(draftsForEscrow(afterRestart, '42')).toEqual([
      {
        id: 'd1',
        escrowId: '42',
        description: 'Delivered files on 3 Sept',
        createdAt: 1_000,
        status: 'pending',
      },
    ]);
  });

  it('are kept per escrow', () => {
    const store = memoryStore();
    saveDraft(store, '42', 'A', ids);
    saveDraft(store, '43', 'B', ids);

    expect(draftsForEscrow(store, '42').map((d) => d.description)).toEqual(['A']);
  });

  it('reject empty or oversized evidence', () => {
    const store = memoryStore();
    expect(() => saveDraft(store, '42', '   ', ids)).toThrow(DraftValidationError);
    expect(() => saveDraft(store, '42', 'x'.repeat(5_001), ids)).toThrow(DraftValidationError);
    expect(readDrafts(store)).toEqual([]);
  });

  it('can be deleted before upload', () => {
    const store = memoryStore();
    const draft = saveDraft(store, '42', 'Oops', ids);

    deleteDraft(store, draft.id);

    expect(readDrafts(store)).toEqual([]);
  });
});

describe('syncDrafts', () => {
  it('uploads pending drafts to the escrow dispute and removes them', async () => {
    const store = memoryStore();
    const draft = saveDraft(store, '42', 'Evidence text', ids);
    const d = deps(store);

    const result = await syncDrafts(d);

    expect(d.resolveDisputeId).toHaveBeenCalledWith('42');
    expect(d.submitEvidence).toHaveBeenCalledWith(7, 'Evidence text');
    expect(result).toEqual({ uploaded: [draft.id], failed: [] });
    expect(readDrafts(store)).toEqual([]);
  });

  it('keeps drafts pending when offline or the server is down', async () => {
    const store = memoryStore();
    saveDraft(store, '42', 'Evidence', ids);

    await syncDrafts(
      deps(store, { submitEvidence: jest.fn().mockRejectedValue(new Error('Network Error')) }),
    );
    await syncDrafts(
      deps(store, { submitEvidence: jest.fn().mockRejectedValue({ response: { status: 503 } }) }),
    );

    expect(readDrafts(store)).toMatchObject([{ status: 'pending' }]);
  });

  it('marks a draft failed, with the reason, when the server rejects it', async () => {
    const store = memoryStore();
    const draft = saveDraft(store, '42', 'Evidence', ids);
    const rejection = {
      response: { status: 403, data: { error: 'Access denied' } },
    };

    const result = await syncDrafts(
      deps(store, { submitEvidence: jest.fn().mockRejectedValue(rejection) }),
    );

    expect(result.failed).toEqual([draft.id]);
    expect(readDrafts(store)).toMatchObject([{ status: 'failed', lastError: 'Access denied' }]);

    // A failed draft is not retried, but can still be deleted.
    const again = deps(store);
    await syncDrafts(again);
    expect(again.submitEvidence).not.toHaveBeenCalled();
    deleteDraft(store, draft.id);
    expect(readDrafts(store)).toEqual([]);
  });

  it('keeps drafts added, and drops drafts deleted, while a sync is in flight', async () => {
    const store = memoryStore();
    const uploading = saveDraft(store, '42', 'First', ids);
    const deletedMidway = saveDraft(store, '42', 'Second', ids);

    const d = deps(store, {
      submitEvidence: jest.fn().mockImplementation(async (_id: number, text: string) => {
        if (text === 'First') {
          saveDraft(store, '42', 'Added during sync', ids);
          deleteDraft(store, deletedMidway.id);
        }
        throw new Error('Network Error');
      }),
    });
    await syncDrafts(d);

    expect(readDrafts(store).map((draft) => draft.description)).toEqual([
      'First',
      'Added during sync',
    ]);
    expect(readDrafts(store).some((draft) => draft.id === uploading.id)).toBe(true);
  });
});
