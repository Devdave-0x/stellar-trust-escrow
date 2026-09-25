import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShareLinkPanel from '../../../components/escrow/ShareLinkPanel';

describe('ShareLinkPanel', () => {
  it('shows a newly-created token once and masks listed tokens', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ links: [{ id: 'l1', tokenMasked: 'abcd…wxyz', expiresAt: '2030-01-01' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ shareUrl: 'https://example.test/share/raw-token', token: 'raw-token' }) });
    render(<ShareLinkPanel escrowId="42" />);
    await waitFor(() => expect(screen.getByText('abcd…wxyz')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(screen.getByText('https://example.test/share/raw-token')).toBeInTheDocument());
  });
});
