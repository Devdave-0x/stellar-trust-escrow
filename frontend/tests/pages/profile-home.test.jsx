import { screen } from '@testing-library/react';
import ProfilePage from '../../app/profile/page';
import { renderWithAppProviders } from '../test-utils';

jest.mock('../../hooks/useEscrow', () => ({
  useUserEscrows: jest.fn(() => ({
    escrows: [
      {
        id: 7,
        status: 'in_progress',
        role: 'client',
        counterparty: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567890ABCDEFGHIJKLMNOP',
        amount: '1000000000',
        createdAt: '2026-01-15T00:00:00.000Z',
      },
      {
        id: 8,
        status: 'released',
        role: 'freelancer',
        counterparty: 'GZYXWVUTSRQPONMLKJIHGFEDCBA234567890ABCDEFGHIJKLMNOP',
        amount: '3000000000',
        createdAt: '2026-02-15T00:00:00.000Z',
      },
    ],
    isLoading: false,
    error: null,
  })),
}));

describe('ProfilePage (own profile)', () => {
  it('prompts the user to connect a wallet when disconnected', () => {
    renderWithAppProviders(<ProfilePage />);
    expect(screen.getByText('Connect your wallet to view your profile')).toBeInTheDocument();
  });

  it('shows the profile summary and escrow history when connected', () => {
    renderWithAppProviders(<ProfilePage />, {
      wallet: {
        address: 'GCONNECTED234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFG',
        isConnected: true,
      },
    });

    expect(screen.getByText('Escrow history')).toBeInTheDocument();
    expect(screen.getByText('Escrow #7')).toBeInTheDocument();
    expect(screen.getByText('Escrow #8')).toBeInTheDocument();
  });

  it('shows accurate active and completed escrow counts', () => {
    renderWithAppProviders(<ProfilePage />, {
      wallet: {
        address: 'GCONNECTED234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFG',
        isConnected: true,
      },
    });

    expect(screen.getByText('Active escrows').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Completed').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Total escrows').nextElementSibling).toHaveTextContent('2');
  });

  it('links to the profile edit page', () => {
    renderWithAppProviders(<ProfilePage />, {
      wallet: {
        address: 'GCONNECTED234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFG',
        isConnected: true,
      },
    });
    expect(screen.getByText('Edit profile').closest('a')).toHaveAttribute('href', '/profile/edit');
  });
});
