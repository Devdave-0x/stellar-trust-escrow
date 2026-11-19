import { uploadDisputeEvidence, MAX_EVIDENCE_BYTES } from '../../lib/uploadEvidence';

describe('uploadDisputeEvidence', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('rejects oversized files', async () => {
    const big = { size: MAX_EVIDENCE_BYTES + 1, type: 'application/pdf', name: 'x.pdf' };
    await expect(uploadDisputeEvidence(1, big)).rejects.toThrow(/10MB/);
  });

  it('rejects unsupported types', async () => {
    const file = { size: 10, type: 'application/zip', name: 'x.zip' };
    await expect(uploadDisputeEvidence(1, file)).rejects.toThrow(/Unsupported/);
  });

  it('returns hash on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ hash: 'abc123' }),
    });
    const file = { size: 10, type: 'text/plain', name: 'a.txt' };
    await expect(uploadDisputeEvidence(9, file)).resolves.toBe('abc123');
  });
});
