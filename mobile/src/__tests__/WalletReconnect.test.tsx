import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { WalletReconnectProvider, useWalletReconnect } from '../WalletReconnect';

jest.mock('react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo', () => ({
  announceForAccessibility: jest.fn(),
}));

const announceForAccessibility = AccessibilityInfo.announceForAccessibility as jest.Mock;

function Harness({ onState }: { onState?: (s: string) => void }) {
  const { status, reconnect } = useWalletReconnect();
  React.useEffect(() => {
    onState?.(status);
  }, [status, onState]);
  return (
    <>
      <StatusProbe />
      <ReconnectButton onPress={reconnect} />
    </>
  );
}

function StatusProbe() {
  const { status } = useWalletReconnect();
  return <>{status}</>;
}

function ReconnectButton({ onPress }: { onPress: () => void }) {
  const { reconnect } = useWalletReconnect();
  return (
    <>
      <button onPress={reconnect} />
    </>
  );
}

describe('WalletReconnect accessible status announcements', () => {
  beforeEach(() => {
    announceForAccessibility.mockClear();
  });

  it('announces a polite status when reconnect succeeds', async () => {
    const reconnectImpl = jest.fn().mockResolvedValue({ address: '0xabc' });
    render(
      <WalletReconnectProvider reconnectImpl={reconnectImpl}>
        <Harness />
      </WalletReconnectProvider>,
    );

    await act(async () => {
      screen.getByRole('button').props.onPress();
    });

    await waitFor(() => {
      expect(announceForAccessibility).toHaveBeenCalledWith(
        expect.stringMatching(/reconnect/i),
      );
    });
  });

  it('announces an assertive error when reconnect fails', async () => {
    const reconnectImpl = jest.fn().mockRejectedValue(new Error('network down'));
    render(
      <WalletReconnectProvider reconnectImpl={reconnectImpl}>
        <Harness />
      </WalletReconnectProvider>,
    );

    await act(async () => {
      screen.getByRole('button').props.onPress();
    });

    await waitFor(() => {
      expect(announceForAccessibility).toHaveBeenCalledWith(
        expect.stringMatching(/failed|could not/i),
      );
    });
  });

  it('announces a timeout boundary without leaking error details', async () => {
    const reconnectImpl = jest.fn().mockRejectedValue(new Error('secret-token-123'));
    render(
      <WalletReconnectProvider reconnectImpl={reconnectImpl} timeoutMs={10}>
        <Harness />
      </WalletReconnectProvider>,
    );

    await act(async () => {
      screen.getByRole('button').props.onPress();
    });

    await waitFor(() => {
      expect(announceForAccessibility).toHaveBeenCalled();
    });
    const announced = announceForAccessibility.mock.calls.map((c) => String(c[0])).join(' ');
    expect(announced).not.toContain('secret-token-123');
  });
});
