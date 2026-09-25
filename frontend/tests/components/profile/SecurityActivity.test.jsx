import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SecurityActivity from '../../../components/profile/SecurityActivity';

jest.mock('../../../lib/api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));

const page = (n, total) => ({
  data: [{ type: 'PASSKEY_ADDED', label: `Passkey added (page ${n})`, occurredAt: '2026-01-01T00:00:00Z', ip: '203.0.113.x' }],
  pagination: { page: n, limit: 1, total, totalPages: total },
});

describe('SecurityActivity', () => {
  it('shows the empty state', async () => {
    render(<SecurityActivity fetchPage={jest.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } })} />);
    expect(await screen.findByTestId('security-activity-empty')).toBeInTheDocument();
  });

  it('shows entries with masked IPs and paginates', async () => {
    const fetchPage = jest.fn((n) => Promise.resolve(page(n, 2)));
    render(<SecurityActivity fetchPage={fetchPage} />);
    expect(await screen.findByText('Passkey added (page 1)')).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.x/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(2));
    expect(await screen.findByText('Passkey added (page 2)')).toBeInTheDocument();
  });
});
