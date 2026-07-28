import { screen, fireEvent } from '@testing-library/react';
import EscrowHistoryList from '../../../components/profile/EscrowHistoryList';
import { renderWithAppProviders } from '../../test-utils';

const render = (ui) => renderWithAppProviders(ui);

const escrows = [
  {
    id: 1,
    status: 'in_progress',
    role: 'client',
    counterparty: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNOP',
    amount: '1000000000',
    createdAt: '2026-01-15T00:00:00.000Z',
  },
  {
    id: 2,
    status: 'released',
    role: 'freelancer',
    counterparty: 'GZYXWVUTSRQPONMLKJIHGFEDCBA234567890ABCDEFGHIJKLMNOP',
    amount: '2500000000',
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 3,
    status: 'disputed',
    role: 'client',
    counterparty: 'GDISPUTE234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHI',
    amount: '500000000',
    createdAt: '2026-03-01T00:00:00.000Z',
  },
];

describe('EscrowHistoryList', () => {
  it('shows a loading skeleton when isLoading is true', () => {
    const { container } = render(<EscrowHistoryList escrows={[]} isLoading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows an error message when error is set', () => {
    render(<EscrowHistoryList escrows={[]} error={new Error('boom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
  });

  it('shows an empty state when there are no escrows', () => {
    render(<EscrowHistoryList escrows={[]} />);
    expect(screen.getByText('No escrows here yet')).toBeInTheDocument();
  });

  it('renders all escrows by default', () => {
    render(<EscrowHistoryList escrows={escrows} />);
    expect(screen.getByText('Escrow #1')).toBeInTheDocument();
    expect(screen.getByText('Escrow #2')).toBeInTheDocument();
    expect(screen.getByText('Escrow #3')).toBeInTheDocument();
  });

  it('has an accessible filter tablist', () => {
    render(<EscrowHistoryList escrows={escrows} />);
    expect(screen.getByRole('tablist', { name: 'Filter escrow history' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('filters to only active escrows', () => {
    render(<EscrowHistoryList escrows={escrows} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Active' }));
    expect(screen.getByText('Escrow #1')).toBeInTheDocument();
    expect(screen.queryByText('Escrow #2')).not.toBeInTheDocument();
    expect(screen.queryByText('Escrow #3')).not.toBeInTheDocument();
  });

  it('filters to only completed escrows', () => {
    render(<EscrowHistoryList escrows={escrows} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Completed' }));
    expect(screen.getByText('Escrow #2')).toBeInTheDocument();
    expect(screen.queryByText('Escrow #1')).not.toBeInTheDocument();
  });

  it('filters to only disputed escrows', () => {
    render(<EscrowHistoryList escrows={escrows} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Disputed' }));
    expect(screen.getByText('Escrow #3')).toBeInTheDocument();
    expect(screen.queryByText('Escrow #1')).not.toBeInTheDocument();
  });

  it('marks the active filter tab with aria-selected', () => {
    render(<EscrowHistoryList escrows={escrows} />);
    const activeTab = screen.getByRole('tab', { name: 'Active' });
    fireEvent.click(activeTab);
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows empty state when filter matches nothing', () => {
    render(<EscrowHistoryList escrows={[escrows[0]]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Disputed' }));
    expect(screen.getByText('No escrows here yet')).toBeInTheDocument();
  });

  it('links each escrow row to its detail page', () => {
    render(<EscrowHistoryList escrows={escrows} />);
    const link = screen.getByText('Escrow #1').closest('a');
    expect(link).toHaveAttribute('href', '/escrow/1');
  });
});
