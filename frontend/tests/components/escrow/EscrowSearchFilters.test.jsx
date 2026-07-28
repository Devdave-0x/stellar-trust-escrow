import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EscrowSearchFilters from '../../../components/escrow/EscrowSearchFilters';

function setup(overrides = {}) {
  const setFilter = jest.fn();
  const resetFilters = jest.fn();
  const filters = {
    search: '',
    status: '',
    minAmount: '',
    maxAmount: '',
    dateFrom: '',
    dateTo: '',
    ...overrides.filters,
  };
  render(
    <EscrowSearchFilters
      filters={filters}
      setFilter={setFilter}
      resetFilters={resetFilters}
      activeCount={overrides.activeCount ?? 0}
    />,
  );
  return { setFilter, resetFilters };
}

describe('EscrowSearchFilters', () => {
  it('renders the search box and status select', () => {
    setup();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('calls setFilter when typing in the search box', () => {
    const { setFilter } = setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'escrow-123' } });
    expect(setFilter).toHaveBeenCalledWith('search', 'escrow-123');
  });

  it('calls setFilter when changing status', () => {
    const { setFilter } = setup();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'active' } });
    expect(setFilter).toHaveBeenCalledWith('status', 'active');
  });

  it('advanced panel is collapsed by default and toggles via the Advanced button', async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole('button', { name: /advanced/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Min amount')).toBeVisible();
  });

  it('does not show the Clear button when no filters are active', () => {
    setup({ activeCount: 0 });
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('shows and wires up the Clear button when filters are active', () => {
    const { resetFilters } = setup({ activeCount: 2 });
    const clearBtn = screen.getByRole('button', { name: /clear \(2\)/i });
    fireEvent.click(clearBtn);
    expect(resetFilters).toHaveBeenCalledTimes(1);
  });

  it('advanced fields update min/max amount and date range', async () => {
    const user = userEvent.setup();
    const { setFilter } = setup();
    await user.click(screen.getByRole('button', { name: /advanced/i }));

    fireEvent.change(screen.getByLabelText('Min amount'), { target: { value: '10' } });
    expect(setFilter).toHaveBeenCalledWith('minAmount', '10');

    fireEvent.change(screen.getByLabelText('Max amount'), { target: { value: '500' } });
    expect(setFilter).toHaveBeenCalledWith('maxAmount', '500');

    fireEvent.change(screen.getByLabelText('Created from'), { target: { value: '2026-01-01' } });
    expect(setFilter).toHaveBeenCalledWith('dateFrom', '2026-01-01');

    fireEvent.change(screen.getByLabelText('Created to'), { target: { value: '2026-07-01' } });
    expect(setFilter).toHaveBeenCalledWith('dateTo', '2026-07-01');
  });

  it('is keyboard accessible: Enter toggles the advanced panel', () => {
    setup();
    const toggle = screen.getByRole('button', { name: /advanced/i });
    toggle.focus();
    fireEvent.keyDown(toggle, { key: 'Enter' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
