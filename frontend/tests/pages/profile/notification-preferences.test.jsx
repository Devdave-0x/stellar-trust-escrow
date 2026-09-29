import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NotificationPreferencesPage from '../../../app/profile/settings/notifications/page';

jest.mock('../../../hooks/useWallet', () => ({
  useWallet: () => ({
    address: 'GTESTADDRESS',
    isConnected: true,
  }),
}));

const mockShowToast = jest.fn();

jest.mock('../../../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

global.fetch = jest.fn();

describe('NotificationPreferencesPage expiry/failure events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  test.each([
    ['Escrow Expiring Soon', 'escrow_expiring_soon'],
    ['Escrow Expired', 'escrow_expired'],
    ['Transaction Failed', 'transaction_failed'],
  ])('toggles and saves %s', async (label, eventId) => {
    render(<NotificationPreferencesPage />);

    const toggle = screen.getByRole('switch', {
      name: new RegExp(`${label} — Email notification enabled`),
    });

    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Save notification preferences',
      }),
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [url, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(url).toContain('/users/GTESTADDRESS');
    expect(options.method).toBe('PUT');
    expect(body.preferences.notifications[eventId].email).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith(
      'Notification preferences saved successfully.',
      'success',
    );
  });
});
