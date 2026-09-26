import { render, screen } from '@testing-library/react';
import ArbiterWorkloadHeatmap, { HIGH_LOAD } from '../../../components/admin/ArbiterWorkloadHeatmap';

const base = { weeks: 2, weekStarts: ['2026-01-01T00:00:00Z', '2026-01-08T00:00:00Z'], generatedAt: '2026-01-15T00:00:00Z' };

describe('ArbiterWorkloadHeatmap', () => {
  it('renders the empty state with no data', () => {
    render(<ArbiterWorkloadHeatmap data={{ ...base, arbiters: [] }} />);
    expect(screen.getByTestId('workload-empty')).toBeInTheDocument();
  });

  it('flags arbiters under high load', () => {
    const busy = 'GBUSY' + 'A'.repeat(51);
    const calm = 'GCALM' + 'B'.repeat(51);
    render(
      <ArbiterWorkloadHeatmap
        data={{
          ...base,
          arbiters: [
            { address: busy, weekly: [HIGH_LOAD + 2, 1], total: HIGH_LOAD + 3, open: 4, avgResolutionHours: 30, reputation: 80 },
            { address: calm, weekly: [0, 1], total: 1, open: 0, avgResolutionHours: null, reputation: null },
          ],
        }}
      />,
    );
    expect(screen.getByTestId('high-load-warning')).toHaveTextContent('1 arbiter(s)');
    expect(screen.getByTestId(`cell-${busy}-0`)).toHaveClass('bg-red-600');
    expect(screen.getByTestId(`cell-${calm}-0`)).toHaveTextContent('');
  });
});
