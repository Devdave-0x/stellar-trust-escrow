/**
 * App wiring for offline evidence drafts: MMKV storage, the dispute API, and
 * a connectivity listener that uploads pending drafts when the device comes
 * back online. UI subscribes to be told when the drafts change.
 */

import NetInfo from '@react-native-community/netinfo';
import { disputeApi } from '../lib/api';
import { storage } from '../lib/storage';
import {
  deleteDraft,
  draftsForEscrow,
  saveDraft,
  syncDrafts,
  type DraftSyncDeps,
  type EvidenceDraft,
} from './evidenceDrafts';

const deps: DraftSyncDeps = {
  store: storage,
  resolveDisputeId: async (escrowId) => (await disputeApi.get(escrowId)).data.id,
  submitEvidence: async (disputeId, description) => {
    await disputeApi.submitTextEvidence(disputeId, description);
  },
};

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeEvidenceDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEvidenceDrafts(escrowId: string): EvidenceDraft[] {
  return draftsForEscrow(storage, escrowId);
}

export function saveEvidenceDraft(escrowId: string, description: string): EvidenceDraft {
  const draft = saveDraft(storage, escrowId, description);
  notify();
  void syncEvidenceDrafts();
  return draft;
}

export function deleteEvidenceDraft(id: string): void {
  deleteDraft(storage, id);
  notify();
}

let syncing = false;

export async function syncEvidenceDrafts(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const { isConnected } = await NetInfo.fetch();
    if (!isConnected) return;
    const { uploaded, failed } = await syncDrafts(deps);
    if (uploaded.length || failed.length) notify();
  } finally {
    syncing = false;
  }
}

/** Upload pending drafts whenever connectivity returns. Returns an unsubscribe. */
export function startEvidenceDraftSync(): () => void {
  void syncEvidenceDrafts();
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) void syncEvidenceDrafts();
  });
}
