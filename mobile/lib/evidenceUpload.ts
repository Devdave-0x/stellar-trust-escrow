/**
 * Dispute evidence upload with progress, retry and virus-scan status.
 *
 * Uploads go to POST /api/disputes/:id/evidence (multipart field "files").
 * The backend scans each file and records scanStatus
 * (pending | clean | infected | error); the client polls the evidence list
 * until the scan settles, with a bounded number of attempts.
 */

import { api } from './api';

export type ScanStatus = 'pending' | 'clean' | 'infected' | 'error';

export type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; progress: number }
  | { phase: 'scanning'; evidenceId: number }
  | { phase: 'done'; evidenceId: number; scanStatus: Exclude<ScanStatus, 'pending'> }
  | { phase: 'failed'; error: string };

export type UploadEvent =
  | { type: 'start' }
  | { type: 'progress'; loaded: number; total?: number }
  | { type: 'uploaded'; evidenceId: number; scanStatus: ScanStatus }
  | { type: 'scanned'; scanStatus: ScanStatus }
  | { type: 'failed'; error: string };

/** Pure state machine for the uploader (tested). */
export function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  switch (event.type) {
    case 'start':
      return { phase: 'uploading', progress: 0 };
    case 'progress': {
      if (state.phase !== 'uploading' || !event.total) return state;
      const progress = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
      return { phase: 'uploading', progress: Math.max(state.progress, progress) };
    }
    case 'uploaded':
      return event.scanStatus === 'pending'
        ? { phase: 'scanning', evidenceId: event.evidenceId }
        : { phase: 'done', evidenceId: event.evidenceId, scanStatus: event.scanStatus };
    case 'scanned':
      if (state.phase !== 'scanning' || event.scanStatus === 'pending') return state;
      return { phase: 'done', evidenceId: state.evidenceId, scanStatus: event.scanStatus };
    case 'failed':
      return { phase: 'failed', error: event.error };
    default:
      return state;
  }
}

export type EvidenceFile = { uri: string; name: string; mimeType: string };

type EvidenceRecord = { id: number; scanStatus?: ScanStatus | null };

const unwrap = (body: any): EvidenceRecord[] => body?.data?.evidence ?? body?.evidence ?? body?.data ?? [];

/** Upload one file; reports progress and resolves with the created evidence record. */
export async function uploadEvidenceFile(
  disputeId: string | number,
  file: EvidenceFile,
  onProgress: (loaded: number, total?: number) => void,
): Promise<EvidenceRecord> {
  const form = new FormData();
  // React Native FormData accepts { uri, name, type } file descriptors.
  form.append('files', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  const res = await api.post(`/api/disputes/${disputeId}/evidence`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress(e.loaded, e.total ?? undefined),
  });
  const record = unwrap(res.data)[0];
  if (!record) throw new Error('Upload succeeded but no evidence record was returned');
  return record;
}

/** Poll the evidence list until the scan for `evidenceId` settles (bounded). */
export async function waitForScan(
  disputeId: string | number,
  evidenceId: number,
  { attempts = 20, intervalMs = 3000 }: { attempts?: number; intervalMs?: number } = {},
): Promise<ScanStatus> {
  for (let i = 0; i < attempts; i++) {
    const res = await api.get(`/api/disputes/${disputeId}/evidence`);
    const status = unwrap(res.data).find((e) => e.id === evidenceId)?.scanStatus ?? 'pending';
    if (status !== 'pending') return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return 'pending';
}
