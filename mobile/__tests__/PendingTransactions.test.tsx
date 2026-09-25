import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import PendingTransactions from '../components/escrow/PendingTransactions';
import type { QueuedTransaction } from '../services/txRetryQueue';

function entry(overrides: Partial<QueuedTransaction>): QueuedTransaction {
  return {
    id: 'abcdef1234567890',
    xdr: 'AAAA',
    enqueuedAt: 0,
    attempts: 1,
    nextAttemptAt: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('PendingTransactions', () => {
  it('reports transactions waiting to be submitted', () => {
    render(<PendingTransactions entries={[entry({})]} onDismiss={jest.fn()} />);

    expect(
      screen.getByText(
        '1 transaction waiting to submit. It will be sent when the server is reachable.',
      ),
    ).toBeTruthy();
  });

  it('surfaces a permanent failure with its reason until dismissed', () => {
    const onDismiss = jest.fn();
    render(
      <PendingTransactions
        entries={[entry({ status: 'failed', lastError: 'tx_bad_seq' })]}
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByText('Transaction abcdef12… was not submitted')).toBeTruthy();
    expect(screen.getByText('tx_bad_seq')).toBeTruthy();
    fireEvent.press(screen.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledWith('abcdef1234567890');
  });

  it('renders nothing when the queue is empty', () => {
    render(<PendingTransactions entries={[]} onDismiss={jest.fn()} />);

    expect(screen.queryByTestId('pending-transactions')).toBeNull();
  });
});
