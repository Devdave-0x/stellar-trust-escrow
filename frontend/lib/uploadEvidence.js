const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_EVIDENCE_TYPES = new Set([
  'text/plain',
  'application/pdf',
  'image/png',
  'image/jpeg',
]);

/**
 * Upload dispute evidence and return the verified content hash from the API.
 * @param {number|string} escrowId
 * @param {File|Blob} file
 * @param {{ onProgress?: (pct: number) => void }} [opts]
 * @returns {Promise<string>}
 */
export async function uploadDisputeEvidence(escrowId, file, opts = {}) {
  if (!file) throw new Error('Choose a file to upload.');
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error('File exceeds the 10MB upload limit.');
  }
  const type = file.type || 'application/octet-stream';
  if (!ACCEPTED_EVIDENCE_TYPES.has(type)) {
    throw new Error('Unsupported file type. Use PDF, PNG, JPEG, or plain text.');
  }

  opts.onProgress?.(10);

  const body = new FormData();
  body.append('file', file, file.name || 'dispute-evidence');

  const res = await fetch(`${API_URL}/api/disputes/${escrowId}/evidence`, {
    method: 'POST',
    body,
  });

  opts.onProgress?.(70);

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.message || payload?.error || `Upload failed (${res.status})`);
  }

  const data = await res.json();
  const hash = data?.ipfsCid || data?.cid || data?.hash || data?.contentHash;
  if (!hash) {
    throw new Error('Upload succeeded but no content hash was returned.');
  }

  opts.onProgress?.(100);
  return hash;
}
