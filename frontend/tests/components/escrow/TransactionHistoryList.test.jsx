import { render, screen } from '@testing-library/react';
import TransactionHistoryList, {
  buildHistoryFromEscrow,
} from '../../../components/escrow/TransactionHistoryList';

const SAMPLE_HISTORY = [
  {
    id: 'created',
    type: 'created',
    description: 'Escrow initialized',
    txHash: 'a1b2c3d4e5f6a1b2c3d4e5f6',
    timestamp: '2025-03-01T00:00:00Z',
  },
  {
    id: 'funded',
    type: 'funded',
    description: 'Funds deposited',
    amount: '2,000 USDC',
    txHash: 'f6e5d4c3b2a1f6e5d4c3b2a1',
    timestamp: '2025-03-02T00:00:00Z',
  },
];

describe('TransactionHistoryList', () => {
  it('renders an empty state when there is no history', () => {
    render(<TransactionHistoryList history={[]} />);
    expect(screen.getByText('No on-chain activity yet.')).toBeInTheDocument();
  });

  it('renders every history entry with its label', () => {
    render(<TransactionHistoryList history={SAMPLE_HISTORY} />);
    expect(screen.getByText('Escrow Created')).toBeInTheDocument();
    expect(screen.getByText('Funded')).toBeInTheDocument();
  });

  it('orders entries most-recent-first', () => {
    render(<TransactionHistoryList history={SAMPLE_HISTORY} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Funded');
    expect(items[1]).toHaveTextContent('Escrow Created');
  });

  it('exposes the list to assistive technology with an accessible name', () => {
    render(<TransactionHistoryList history={SAMPLE_HISTORY} />);
    expect(
      screen.getByRole('list', { name: /transaction history/i }),
    ).toBeInTheDocument();
  });

  it('links out to the block explorer for each transaction', () => {
    render(<TransactionHistoryList history={SAMPLE_HISTORY} network="testnet" />);
    const links = screen.getAllByRole('link', { name: /View .* transaction/i });
    expect(links[0]).toHaveAttribute(
      'href',
      expect.stringContaining('stellar.expert/explorer/testnet/tx'),
    );
  });

  it('renders a heading for the section', () => {
    render(<TransactionHistoryList history={SAMPLE_HISTORY} />);
    expect(screen.getByRole('heading', { name: 'Transaction History' })).toBeInTheDocument();
  });
});

describe('buildHistoryFromEscrow', () => {
  it('returns an empty array for a falsy escrow', () => {
    expect(buildHistoryFromEscrow(null)).toEqual([]);
  });

  it('prefers an explicit transactionHistory array when present', () => {
    const escrow = { transactionHistory: [{ id: 'x', type: 'created' }] };
    expect(buildHistoryFromEscrow(escrow)).toEqual(escrow.transactionHistory);
  });

  it('derives created/funded/milestone events when no explicit history exists', () => {
    const escrow = {
      createdAt: '2025-03-01',
      transactionHash: 'abc123',
      totalAmount: '2,000 USDC',
      milestones: [
        { id: 0, title: 'Codebase Review', amount: '500 USDC', status: 'Approved', submittedAt: '2025-03-05' },
        { id: 2, title: 'Final Sign-off', amount: '500 USDC', status: 'Pending', submittedAt: null },
      ],
    };
    const history = buildHistoryFromEscrow(escrow);
    const types = history.map((e) => e.type);
    expect(types).toContain('funded');
    expect(types).toContain('milestone_approved');
    expect(history.some((e) => e.description === 'Final Sign-off')).toBe(false);
  });
});
