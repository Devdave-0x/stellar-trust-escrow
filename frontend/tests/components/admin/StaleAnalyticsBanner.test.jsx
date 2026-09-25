import { render, screen } from '@testing-library/react';
import StaleAnalyticsBanner from '../../../components/admin/StaleAnalyticsBanner';

jest.mock('../../../store/admin', () => ({ adminFetch: jest.fn() }));

describe('StaleAnalyticsBanner', () => {
  it('lists stale metrics with their last generated time', async () => {
    const fetchFreshness = jest.fn().mockResolvedValue({
      hasSnapshots: true,
      stale: [{ metric: 'escrows_active', period: 'hourly', lastGeneratedAt: '2026-01-01T00:00:00Z', ageMinutes: 300 }],
    });
    render(<StaleAnalyticsBanner apiKey="k" fetchFreshness={fetchFreshness} />);
    expect(await screen.findByTestId('stale-analytics-banner')).toHaveTextContent('escrows_active');
    expect(screen.getByText(/check again/)).toBeInTheDocument();
  });

  it('renders nothing when all snapshots are fresh', async () => {
    const fetchFreshness = jest.fn().mockResolvedValue({ hasSnapshots: true, stale: [] });
    const { container } = render(<StaleAnalyticsBanner apiKey="k" fetchFreshness={fetchFreshness} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('warns when no snapshots exist yet', async () => {
    const fetchFreshness = jest.fn().mockResolvedValue({ hasSnapshots: false, stale: [] });
    render(<StaleAnalyticsBanner apiKey="k" fetchFreshness={fetchFreshness} />);
    expect(await screen.findByText(/No analytics snapshots/)).toBeInTheDocument();
  });
});
