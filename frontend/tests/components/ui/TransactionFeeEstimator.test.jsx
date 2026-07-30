import { render, screen } from '@testing-library/react';
import TransactionFeeEstimator, {
  computeFeeBreakdown,
} from '../../../components/ui/TransactionFeeEstimator';

describe('computeFeeBreakdown', () => {
  it('multiplies each operation group by the base fee', () => {
    const { items, totalStroops, totalOperations } = computeFeeBreakdown(
      [
        { label: 'Create escrow', operations: 1 },
        { label: 'Fund milestone', operations: 3 },
      ],
      100,
    );

    expect(items[0].feeStroops).toBe(100);
    expect(items[1].feeStroops).toBe(300);
    expect(totalStroops).toBe(400);
    expect(totalOperations).toBe(4);
  });

  it('defaults an operation group to a single operation', () => {
    const { items } = computeFeeBreakdown([{ label: 'Create escrow' }], 100);
    expect(items[0].operations).toBe(1);
  });
});

describe('TransactionFeeEstimator', () => {
  const operations = [
    { label: 'Create escrow', operations: 1 },
    { label: 'Fund milestone', operations: 2 },
  ];

  it('renders a labeled section with an itemized breakdown', () => {
    render(<TransactionFeeEstimator operations={operations} baseFeeStroops={100} />);
    expect(screen.getByRole('heading', { name: /estimated network fee/i })).toBeInTheDocument();
    expect(screen.getByText('Create escrow')).toBeInTheDocument();
    expect(screen.getByText(/fund milestone/i)).toBeInTheDocument();
    expect(screen.getByText(/×2/)).toBeInTheDocument();
  });

  it('renders the total operation count and fee', () => {
    render(<TransactionFeeEstimator operations={operations} baseFeeStroops={100} />);
    expect(screen.getByText(/total \(3 operations\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/total estimated fee: 0\.00003 xlm/i)).toBeInTheDocument();
  });

  it('shows a USD estimate when an exchange rate is provided', () => {
    render(<TransactionFeeEstimator operations={operations} baseFeeStroops={100} xlmUsdRate={0.4} />);
    expect(screen.getByText(/usd/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no operations', () => {
    render(<TransactionFeeEstimator operations={[]} />);
    expect(screen.getByText(/no operations to estimate yet/i)).toBeInTheDocument();
  });
});
