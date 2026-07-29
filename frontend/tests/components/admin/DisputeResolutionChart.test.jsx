import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DisputeResolutionChart from '@/components/admin/DisputeResolutionChart';
import { deriveMetrics } from '@/components/admin/chartTheme';

// jsdom reports every element as 0×0, so ResponsiveContainer would size the plot
// to nothing and warn. Hand the chart explicit dimensions instead, which also
// lets the SVG marks actually render.
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const { cloneElement } = jest.requireActual('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 400, height: 200 }),
  };
});

const metrics = deriveMetrics({
  escrows: { total: 20, active: 8, completed: 9, disputed: 2 },
  users: { total: 33 },
  disputes: { open: 3, resolved: 5 },
});

const noDisputes = deriveMetrics({
  escrows: { total: 4, active: 4, completed: 0, disputed: 0 },
  disputes: { open: 0, resolved: 0 },
});

describe('DisputeResolutionChart', () => {
  it('names the chart with a heading its section points at', () => {
    render(<DisputeResolutionChart metrics={metrics} />);
    const section = screen.getByRole('region', { name: 'Dispute resolution' });
    expect(within(section).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Dispute resolution',
    );
  });

  it('exposes both rates as meters with a spoken readout, not colour alone', () => {
    render(<DisputeResolutionChart metrics={metrics} />);

    const resolution = screen.getByRole('progressbar', { name: 'Resolution rate' });
    expect(resolution).toHaveAttribute('aria-valuenow', '63');
    expect(resolution).toHaveAttribute('aria-valuetext', '62.5% — 5 of 8 resolved');

    const disputeRate = screen.getByRole('progressbar', { name: 'Escrow dispute rate' });
    expect(disputeRate).toHaveAttribute('aria-valuenow', '10');
    expect(disputeRate).toHaveAttribute('aria-valuetext', '10% — 2 of 20 escrows');
  });

  it('omits aria-valuenow when there is no denominator, rather than claiming 0%', () => {
    render(<DisputeResolutionChart metrics={noDisputes} />);

    const resolution = screen.getByRole('progressbar', { name: 'Resolution rate' });
    expect(resolution).not.toHaveAttribute('aria-valuenow');
    expect(resolution).toHaveAttribute('aria-valuetext', 'No disputes raised');
  });

  it('carries every plotted and derived value in the table view', () => {
    render(<DisputeResolutionChart metrics={metrics} />);

    const table = screen.getByRole('table', {
      name: 'Dispute counts by state, with resolution and dispute rates',
    });
    expect(
      within(table).getByRole('rowheader', { name: 'Open disputes' }).parentElement,
    ).toHaveTextContent('3');
    expect(
      within(table).getByRole('rowheader', { name: 'Resolved disputes' }).parentElement,
    ).toHaveTextContent('5');
    expect(
      within(table).getByRole('rowheader', { name: 'Resolution rate' }).parentElement,
    ).toHaveTextContent('62.5%');
    expect(
      within(table).getByRole('rowheader', { name: 'Escrow dispute rate' }).parentElement,
    ).toHaveTextContent('10%');
  });

  it('toggles the table view from the keyboard', async () => {
    const user = userEvent.setup();
    render(<DisputeResolutionChart metrics={metrics} />);

    const wrapper = document.getElementById('dispute-resolution-table');
    expect(wrapper).toHaveClass('sr-only');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Show data table' })).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(wrapper).not.toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Hide data table' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('renders an empty state instead of an empty plot when no disputes exist', () => {
    render(<DisputeResolutionChart metrics={noDisputes} />);
    expect(screen.getByText('No disputes have been raised yet.')).toBeInTheDocument();
  });

  it('marks the card busy while refetching without dropping the previous values', () => {
    render(<DisputeResolutionChart metrics={metrics} busy />);
    const section = screen.getByRole('region', { name: 'Dispute resolution' });
    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('progressbar', { name: 'Resolution rate' })).toHaveAttribute(
      'aria-valuenow',
      '63',
    );
  });
});
