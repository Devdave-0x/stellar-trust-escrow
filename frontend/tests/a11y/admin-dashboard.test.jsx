/**
 * Accessibility Tests — Admin Dashboard
 *
 * Covers the charts, meters, and metric tiles added to /admin, in both colour
 * schemes. The `dark` class is what ThemeProvider stamps on <html>, so toggling
 * it here exercises the same code path the theme switch does.
 */

import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import EscrowStatusChart from '@/components/admin/EscrowStatusChart';
import DisputeResolutionChart from '@/components/admin/DisputeResolutionChart';
import MetricCard from '@/components/admin/MetricCard';
import Meter from '@/components/admin/Meter';
import { deriveMetrics } from '@/components/admin/chartTheme';

expect.extend(toHaveNoViolations);

jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const { cloneElement } = jest.requireActual('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 400, height: 200 }),
  };
});

const axeRunner = global.axe || axe;

const metrics = deriveMetrics({
  escrows: { total: 20, active: 8, completed: 9, disputed: 2 },
  users: { total: 33 },
  disputes: { open: 3, resolved: 5 },
});

const emptyMetrics = deriveMetrics({
  escrows: { total: 0, active: 0, completed: 0, disputed: 0 },
  users: { total: 0 },
  disputes: { open: 0, resolved: 0 },
});

function withTheme(mode, fn) {
  if (mode === 'dark') document.documentElement.classList.add('dark');
  try {
    return fn();
  } finally {
    document.documentElement.classList.remove('dark');
  }
}

describe.each(['light', 'dark'])('Accessibility — admin dashboard (%s mode)', (mode) => {
  it('EscrowStatusChart has no violations', async () => {
    const { container } = withTheme(mode, () => render(<EscrowStatusChart metrics={metrics} />));
    expect(await axeRunner(container)).toHaveNoViolations();
  });

  it('EscrowStatusChart has no violations in its empty state', async () => {
    const { container } = withTheme(mode, () =>
      render(<EscrowStatusChart metrics={emptyMetrics} />),
    );
    expect(await axeRunner(container)).toHaveNoViolations();
  });

  it('DisputeResolutionChart has no violations', async () => {
    const { container } = withTheme(mode, () =>
      render(<DisputeResolutionChart metrics={metrics} />),
    );
    expect(await axeRunner(container)).toHaveNoViolations();
  });

  it('DisputeResolutionChart has no violations in its empty state', async () => {
    const { container } = withTheme(mode, () =>
      render(<DisputeResolutionChart metrics={emptyMetrics} />),
    );
    expect(await axeRunner(container)).toHaveNoViolations();
  });

  it('MetricCard has no violations', async () => {
    const { container } = withTheme(mode, () =>
      render(
        <MetricCard
          hero
          label="Total escrows"
          value="20"
          sub="8 active · 9 completed"
          accent="#4f46e5"
        />,
      ),
    );
    expect(await axeRunner(container)).toHaveNoViolations();
  });

  it('Meter has no violations', async () => {
    const { container } = withTheme(mode, () =>
      render(<Meter label="Resolution rate" value={0.625} valueText="62.5% — 5 of 8 resolved" />),
    );
    expect(await axeRunner(container)).toHaveNoViolations();
  });
});
