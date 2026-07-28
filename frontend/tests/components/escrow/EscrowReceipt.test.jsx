import { render, screen } from '@testing-library/react';
import EscrowReceipt from '../../../components/escrow/EscrowReceipt';

const escrow = {
  id: '1001',
  status: 'completed',
  amount: 1500,
  currency: 'USD',
  client: 'Alice',
  counterparty: 'Bob',
  description: 'Website redesign milestone payments',
  createdAt: '2026-01-05T10:00:00Z',
  releasedAt: '2026-02-01T10:00:00Z',
  transactionHash: '0xabc123def456',
  milestones: [
    { id: 'm1', title: 'Design mockups', amount: 500, status: 'approved' },
    { id: 'm2', title: 'Final delivery', amount: 1000, status: 'approved' },
  ],
};

describe('EscrowReceipt', () => {
  it('renders nothing when no escrow is provided', () => {
    const { container } = render(<EscrowReceipt escrow={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders escrow id, status, and formatted amount', () => {
    render(<EscrowReceipt escrow={escrow} />);
    expect(screen.getByText('Escrow #1001')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('$1,500.00')).toBeInTheDocument();
  });

  it('renders client, counterparty, and transaction hash', () => {
    render(<EscrowReceipt escrow={escrow} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('0xabc123def456')).toBeInTheDocument();
  });

  it('renders the milestone table', () => {
    render(<EscrowReceipt escrow={escrow} />);
    expect(screen.getByText('Design mockups')).toBeInTheDocument();
    expect(screen.getByText('Final delivery')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('has an accessible article label', () => {
    render(<EscrowReceipt escrow={escrow} />);
    expect(screen.getByLabelText('Receipt for escrow 1001')).toBeInTheDocument();
  });

  it('falls back gracefully when optional fields are missing', () => {
    render(<EscrowReceipt escrow={{ id: '2', status: 'active', amount: 0 }} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
