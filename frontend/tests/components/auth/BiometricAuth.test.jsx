import { fireEvent, screen, waitFor } from '@testing-library/react';
import BiometricAuth from '../../../components/auth/BiometricAuth';
import { renderWithAppProviders } from '../../test-utils';

describe('BiometricAuth recovery', () => {
  beforeEach(() => {
    window.PublicKeyCredential = function PublicKeyCredential() {};
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ challenge: 'YQ', user: { id: 'YQ' } }) });
    navigator.credentials.create = jest.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
  });

  it('offers an actionable retry after WebAuthn enrollment fails', async () => {
    renderWithAppProviders(<BiometricAuth userId="user-1" userEmail="user@example.com" />);
    fireEvent.click(screen.getByRole('button', { name: /register a new biometric/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try another device'));
    expect(screen.getByRole('button', { name: /try enrollment again/i })).toBeInTheDocument();
  });
});
