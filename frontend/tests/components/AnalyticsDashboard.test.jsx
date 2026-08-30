import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnalyticsDashboard from '../../components/AnalyticsDashboard';

describe('AnalyticsDashboard Component', () => {
  const mockData = {
    total: 10,
    active: 3,
    completed: 6,
    disputed: 1,
    totalValueLocked: '5,000 USDC',
    successRate: 85,
  };

  it('renders loading state with ARIA attributes when loading prop is true', () => {
    render(<AnalyticsDashboard loading={true} />);

    const loadingRegion = screen.getByLabelText('Loading analytics dashboard');
    expect(loadingRegion).toBeInTheDocument();
    expect(loadingRegion).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Fetching data…')).toBeInTheDocument();
  });

  it('renders metrics when data is resolved', () => {
    render(<AnalyticsDashboard data={mockData} loading={false} />);

    expect(screen.getByText('Analytics Overview')).toBeInTheDocument();
    expect(screen.getByText('Total Escrows')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Disputed')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('renders error state when error prop is provided', () => {
    render(<AnalyticsDashboard error="Network Connection Error" />);

    expect(
      screen.getByText(/Could not load analytics: Network Connection Error/i),
    ).toBeInTheDocument();
  });

  it('triggers onRetry callback when retry button is clicked', () => {
    const onRetryMock = jest.fn();
    render(<AnalyticsDashboard error="Fetch failed" onRetry={onRetryMock} />);

    const retryBtn = screen.getByRole('button', { name: /Retry Loading/i });
    fireEvent.click(retryBtn);
    expect(onRetryMock).toHaveBeenCalledTimes(1);
  });

  it('keeps rendered data visible during background refresh', () => {
    render(<AnalyticsDashboard data={mockData} loading={true} />);

    // Primary metrics remain visible
    expect(screen.getByText('Total Escrows')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    // Background updating indicator is displayed
    expect(screen.getByText('Updating…')).toBeInTheDocument();
  });

  it('fetches data internally when address prop is passed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    });

    render(<AnalyticsDashboard address="GCLIENT12345" />);

    expect(screen.getByLabelText('Loading analytics dashboard')).toHaveAttribute(
      'aria-busy',
      'true',
    );

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/escrows/stats/GCLIENT12345'),
    );
  });
});
