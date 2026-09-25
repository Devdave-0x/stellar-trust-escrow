import { resolveShareLink, ShareLinkError } from '@/lib/api/shareLinks';

const payload = {
  escrow: {
    id: '42',
    status: 'Active',
    totalAmount: '1000',
    remainingBalance: '1000',
    deadline: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    milestones: [{ id: 1, title: 'Design', amount: '1000', status: 'Pending' }],
  },
  sharedAt: '2026-09-02T10:00:00.000Z',
  expiresAt: null,
};

function fakeFetch(status, body) {
  return jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('resolveShareLink', () => {
  it('returns the validated share-link payload', async () => {
    const fetchImpl = fakeFetch(200, payload);

    await expect(resolveShareLink('abc', { fetchImpl })).resolves.toEqual(payload);
    expect(fetchImpl).toHaveBeenCalledWith('/api/share/abc');
  });

  it('rejects a payload that does not match the shared schema', async () => {
    const drifted = { ...payload, escrow: { ...payload.escrow, totalAmount: 1000 } };

    await expect(resolveShareLink('abc', { fetchImpl: fakeFetch(200, drifted) })).rejects.toEqual(
      new ShareLinkError('Share link response has an unexpected shape', 0),
    );
  });

  it('surfaces expired and missing links with their status', async () => {
    const expired = resolveShareLink('abc', {
      fetchImpl: fakeFetch(410, { error: 'Share link has expired' }),
    });
    await expect(expired).rejects.toMatchObject({ status: 410, message: 'Share link has expired' });

    const missing = resolveShareLink('abc', { fetchImpl: fakeFetch(404, {}) });
    await expect(missing).rejects.toMatchObject({ status: 404, message: 'Share link not found' });
  });
});
