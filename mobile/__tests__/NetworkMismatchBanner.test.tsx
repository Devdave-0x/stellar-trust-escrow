import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import NetworkMismatchBanner from '../components/ui/NetworkMismatchBanner';

describe('NetworkMismatchBanner', () => {
  it('shows the expected network and a reconnect action on a mismatch', () => {
    const onReconnect = jest.fn();
    render(
      <NetworkMismatchBanner
        match={{ ok: false, expected: 'mainnet', source: 'wallet', message: 'Reconnect please.' }}
        onReconnect={onReconnect}
      />,
    );

    expect(screen.getByText('Wrong network: expected Mainnet')).toBeTruthy();
    expect(screen.getByText('Reconnect please.')).toBeTruthy();
    fireEvent.press(screen.getByText('Reconnect wallet'));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when the networks match', () => {
    render(<NetworkMismatchBanner match={{ ok: true }} onReconnect={jest.fn()} />);

    expect(screen.queryByTestId('network-mismatch-banner')).toBeNull();
  });
});
