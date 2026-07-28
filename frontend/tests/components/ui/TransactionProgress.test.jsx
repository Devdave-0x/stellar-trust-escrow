import { render, screen, fireEvent } from '@testing-library/react';
import TransactionProgress, { TX_STEPS } from '../../../components/ui/TransactionProgress';

describe('TransactionProgress', () => {
  it('renders all step labels', () => {
    render(<TransactionProgress status="idle" />);
    TX_STEPS.forEach((step) => {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    });
  });

  it('has an accessible group label', () => {
    render(<TransactionProgress status="idle" />);
    expect(screen.getByRole('group', { name: 'Transaction progress' })).toBeInTheDocument();
  });

  it('announces the current status via a live region', () => {
    render(<TransactionProgress status="signing" />);
    expect(screen.getByRole('status')).toHaveTextContent('Awaiting signature');
  });

  it('shows step description only for the active step', () => {
    render(<TransactionProgress status="submitting" />);
    expect(screen.getByText('Broadcasting to the Stellar network.')).toBeInTheDocument();
    expect(
      screen.queryByText('Waiting for ledger confirmation.'),
    ).not.toBeInTheDocument();
  });

  it('does not show the transaction hash before submission', () => {
    render(<TransactionProgress status="signing" txHash="abc123" />);
    expect(screen.queryByText('abc123')).not.toBeInTheDocument();
  });

  it('shows the transaction hash once submitting', () => {
    render(<TransactionProgress status="submitting" txHash="abc123" />);
    expect(screen.getByText('abc123')).toBeInTheDocument();
  });

  it('shows the transaction hash once confirmed', () => {
    render(<TransactionProgress status="confirmed" txHash="xyz789" />);
    expect(screen.getByText('xyz789')).toBeInTheDocument();
  });

  it('shows an error alert with a default message when failed', () => {
    render(<TransactionProgress status="failed" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The transaction could not be completed.',
    );
  });

  it('shows a custom error message when provided', () => {
    render(<TransactionProgress status="failed" errorMessage="Insufficient balance" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Insufficient balance');
  });

  it('shows a retry button when onRetry is provided and status is failed', () => {
    const onRetry = jest.fn();
    render(<TransactionProgress status="failed" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Retry transaction'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not show a retry button when onRetry is not provided', () => {
    render(<TransactionProgress status="failed" />);
    expect(screen.queryByText('Retry transaction')).not.toBeInTheDocument();
  });

  it('does not show the error alert for non-failed statuses', () => {
    render(<TransactionProgress status="confirming" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
