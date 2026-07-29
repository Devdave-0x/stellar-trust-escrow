import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EscrowStatusChart from '@/components/admin/EscrowStatusChart';
import { CHART_THEME, deriveMetrics } from '@/components/admin/chartTheme';

const metrics = deriveMetrics({
  escrows: { total: 20, active: 8, completed: 9, disputed: 2 },
  users: { total: 33 },
  disputes: { open: 1, resolved: 1 },
});

const emptyMetrics = deriveMetrics({
  escrows: { total: 0, active: 0, completed: 0, disputed: 0 },
  disputes: { open: 0, resolved: 0 },
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('EscrowStatusChart', () => {
  it('names the chart with a heading its section points at', () => {
    render(<EscrowStatusChart metrics={metrics} />);
    const section = screen.getByRole('region', { name: 'Escrow status distribution' });
    expect(within(section).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Escrow status distribution',
    );
  });

  it('labels every segment with its count and share, including ones too small to label inline', () => {
    render(<EscrowStatusChart metrics={metrics} />);
    const legend = screen.getByLabelText('Escrow status legend');

    // 1 of 20 = 5%, below the inline-label threshold — the legend still carries it.
    const other = within(legend).getByText('Other').closest('div');
    expect(other).toHaveTextContent('1');
    expect(other).toHaveTextContent('(5%)');

    const active = within(legend).getByText('Active').closest('div');
    expect(active).toHaveTextContent('8');
    expect(active).toHaveTextContent('(40%)');
  });

  it('inline-labels only the wide, label-bearing segments', () => {
    const { container } = render(<EscrowStatusChart metrics={metrics} />);
    const stack = container.querySelector('.flex.h-6');
    const inlineLabels = Array.from(stack.querySelectorAll('span')).map((el) => el.textContent);

    // Active 40% and Completed 45% clear the threshold; Disputed is 10% (too
    // narrow) and Other is the de-emphasis gray (never labelled inline).
    expect(inlineLabels).toEqual(['40%', '45%']);
  });

  it('exposes every value through a table view that assistive tech always reaches', () => {
    render(<EscrowStatusChart metrics={metrics} />);

    const table = screen.getByRole('table', {
      name: 'Escrow count and share of total, by lifecycle status',
    });
    const rows = within(table).getAllByRole('row');
    // header + 4 statuses + total
    expect(rows).toHaveLength(6);
    expect(
      within(table).getByRole('rowheader', { name: 'Completed' }).parentElement,
    ).toHaveTextContent('45%');
    expect(within(table).getByRole('rowheader', { name: 'Total' }).parentElement).toHaveTextContent(
      '100%',
    );
  });

  it('toggles the table between visible and screen-reader-only', async () => {
    const user = userEvent.setup();
    render(<EscrowStatusChart metrics={metrics} />);

    const toggle = screen.getByRole('button', { name: 'Show data table' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    const wrapper = document.getElementById('escrow-status-table');
    expect(wrapper).toHaveClass('sr-only');

    await user.click(toggle);

    expect(screen.getByRole('button', { name: 'Hide data table' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(wrapper).not.toHaveClass('sr-only');
  });

  it('is reachable and operable by keyboard alone', async () => {
    const user = userEvent.setup();
    render(<EscrowStatusChart metrics={metrics} />);

    await user.tab();
    const toggle = screen.getByRole('button', { name: 'Show data table' });
    expect(toggle).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Hide data table' })).toBeInTheDocument();
  });

  it('shows the hovered segment value and restores the total on leave', async () => {
    const user = userEvent.setup();
    const { container } = render(<EscrowStatusChart metrics={metrics} />);

    expect(screen.getByText('20 escrows total')).toBeInTheDocument();

    const [activeSegment] = container.querySelectorAll('[style*="width"]');
    await user.hover(activeSegment);
    expect(screen.getByText('active escrows')).toBeInTheDocument();

    await user.unhover(activeSegment);
    expect(screen.getByText('20 escrows total')).toBeInTheDocument();
  });

  it('renders an empty state instead of a zero-width stack', () => {
    render(<EscrowStatusChart metrics={emptyMetrics} />);
    expect(screen.getByText('No escrows have been created yet.')).toBeInTheDocument();

    const legend = screen.getByLabelText('Escrow status legend');
    expect(within(legend).getByText('Active').closest('div')).toHaveTextContent('(—)');
  });

  it('holds the frame at reduced opacity while refetching instead of flashing a skeleton', () => {
    render(<EscrowStatusChart metrics={metrics} busy />);
    const section = screen.getByRole('region', { name: 'Escrow status distribution' });
    expect(section).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('20 escrows total')).toBeInTheDocument();
  });

  it('uses the light palette by default and the dark steps when the dark class is set', () => {
    const { container, unmount } = render(<EscrowStatusChart metrics={metrics} />);
    const lightSwatch = container.querySelector('dt span');
    expect(lightSwatch).toHaveStyle({ backgroundColor: CHART_THEME.light.series.active });
    unmount();

    document.documentElement.classList.add('dark');
    const dark = render(<EscrowStatusChart metrics={metrics} />);
    expect(dark.container.querySelector('dt span')).toHaveStyle({
      backgroundColor: CHART_THEME.dark.series.active,
    });
  });

  it('keeps the plot out of the accessibility tree, since the table carries the data', () => {
    const { container } = render(<EscrowStatusChart metrics={metrics} />);
    const plot = container.querySelector('[aria-hidden="true"]');
    expect(plot).toBeInTheDocument();
    // Nothing focusable may live inside an aria-hidden subtree.
    expect(plot.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
  });
});
