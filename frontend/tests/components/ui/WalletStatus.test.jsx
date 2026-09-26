import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WalletStatus from '../../../components/ui/WalletStatus';
import * as i18n from '../../../i18n/index.jsx';

jest.mock('../../../i18n/index.jsx', () => ({
  useI18n: () => ({
    t: (key) => {
      const translations = {
        'wallet.connect': 'Connect Wallet',
        'wallet.disconnect': 'Disconnect',
        'wallet.connecting': 'Connecting…',
      };
      return translations[key] || key;
    },
  }),
}));

jest.mock('../../../hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    copy: jest.fn(),
    isCopied: false,
  }),
}));

jest.mock('../../../lib/truncateAddress', () => ({
  truncateAddress: (address) => address.slice(0, 4) + '…' + address.slice(-4),
}));

describe('WalletStatus Component', () => {
  const mockWallet = {
    isConnected: false,
    isConnecting: false,
    isFreighterInstalled: true,
    address: null,
    network: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    error: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Disconnected State', () => {
    it('displays connect wallet button when not connected', () => {
      render(<WalletStatus wallet={mockWallet} />);
      const button = screen.getByRole('button', { name: /connect wallet/i });
      expect(button).toBeInTheDocument();
    });

    it('calls connect function when connect button is clicked', () => {
      render(<WalletStatus wallet={mockWallet} />);
      const button = screen.getByRole('button', { name: /connect wallet/i });
      fireEvent.click(button);
      expect(mockWallet.connect).toHaveBeenCalled();
    });

    it('displays error message when error is present', () => {
      const wallet = { ...mockWallet, error: 'Failed to connect' };
      render(<WalletStatus wallet={wallet} />);
      expect(screen.getByText(/failed to connect/i)).toBeInTheDocument();
    });
  });

  describe('Connecting State', () => {
    it('displays connecting button with spinner', () => {
      const wallet = { ...mockWallet, isConnecting: true };
      render(<WalletStatus wallet={wallet} />);
      const button = screen.getByRole('button', { name: /connecting/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('button is disabled during connection', () => {
      const wallet = { ...mockWallet, isConnecting: true };
      render(<WalletStatus wallet={wallet} />);
      const button = screen.getByRole('button', { name: /connecting/i });
      expect(button).toHaveAttribute('disabled');
    });
  });

  describe('Connected State', () => {
    const connectedWallet = {
      ...mockWallet,
      isConnected: true,
      address: 'GBUYQKXQE7K65ZWHXZYCGKP5JNHGCVJ5WNB4MZNZX5GYFJ6AXX4LTZPB',
    };

    it('displays truncated address when connected', () => {
      render(<WalletStatus wallet={connectedWallet} />);
      const addressButton = screen.getByRole('button', { name: /copy wallet address/i });
      expect(addressButton).toBeInTheDocument();
      expect(addressButton).toHaveTextContent('GBUY…LPZB');
    });

    it('displays disconnect button when connected', () => {
      render(<WalletStatus wallet={connectedWallet} />);
      const button = screen.getByRole('button', { name: /disconnect/i });
      expect(button).toBeInTheDocument();
    });

    it('calls disconnect function when disconnect button is clicked', () => {
      render(<WalletStatus wallet={connectedWallet} />);
      const button = screen.getByRole('button', { name: /disconnect/i });
      fireEvent.click(button);
      expect(connectedWallet.disconnect).toHaveBeenCalled();
    });

    it('displays full address in tooltip on hover', () => {
      render(<WalletStatus wallet={connectedWallet} />);
      const addressButton = screen.getByRole('button', { name: /copy wallet address/i });
      fireEvent.mouseEnter(addressButton);
      expect(screen.getByText(connectedWallet.address)).toBeInTheDocument();
    });

    it('tooltip shows copy instruction text', () => {
      render(<WalletStatus wallet={connectedWallet} />);
      const addressButton = screen.getByRole('button', { name: /copy wallet address/i });
      fireEvent.mouseEnter(addressButton);
      expect(screen.getByText(/click to copy/i)).toBeInTheDocument();
    });

    it('shows connected status dot', () => {
      render(<WalletStatus wallet={connectedWallet} />);
      const statusDot = screen.getByRole('status', { name: /wallet connected/i });
      expect(statusDot).toBeInTheDocument();
      expect(statusDot).toHaveClass('bg-emerald-400');
    });
  });

  describe('Freighter Not Installed', () => {
    it('displays install freighter link when not installed', () => {
      const wallet = { ...mockWallet, isFreighterInstalled: false };
      render(<WalletStatus wallet={wallet} />);
      const link = screen.getByRole('link', { name: /install freighter/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://freighter.app');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('install link has proper security attributes', () => {
      const wallet = { ...mockWallet, isFreighterInstalled: false };
      render(<WalletStatus wallet={wallet} />);
      const link = screen.getByRole('link', { name: /install freighter/i });
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('shows disconnected status dot when freighter not installed', () => {
      const wallet = { ...mockWallet, isFreighterInstalled: false };
      render(<WalletStatus wallet={wallet} />);
      const statusDot = screen.getByRole('status', { name: /wallet disconnected/i });
      expect(statusDot).toBeInTheDocument();
      expect(statusDot).toHaveClass('bg-gray-500');
    });
  });

  describe('Status Indicators', () => {
    it('shows disconnected status dot', () => {
      render(<WalletStatus wallet={mockWallet} />);
      const statusDot = screen.getByRole('status', { name: /wallet disconnected/i });
      expect(statusDot).toHaveClass('bg-gray-500');
    });

    it('shows connecting status dot with pulse animation', () => {
      const wallet = { ...mockWallet, isConnecting: true };
      render(<WalletStatus wallet={wallet} />);
      const statusDot = screen.getByRole('status', { name: /wallet connecting/i });
      expect(statusDot).toHaveClass('bg-amber-400', 'animate-pulse');
    });
  });

  describe('Accessibility', () => {
    it('address button has proper aria attributes', () => {
      const connectedWallet = {
        ...mockWallet,
        isConnected: true,
        address: 'GBUYQKXQE7K65ZWHXZYCGKP5JNHGCVJ5WNB4MZNZX5GYFJ6AXX4LTZPB',
      };
      render(<WalletStatus wallet={connectedWallet} />);
      const addressButton = screen.getByRole('button', { name: /copy wallet address/i });
      expect(addressButton).toHaveAttribute('title', 'Click to copy');
    });

    it('tooltip has role="tooltip"', () => {
      const connectedWallet = {
        ...mockWallet,
        isConnected: true,
        address: 'GBUYQKXQE7K65ZWHXZYCGKP5JNHGCVJ5WNB4MZNZX5GYFJ6AXX4LTZPB',
      };
      render(<WalletStatus wallet={connectedWallet} />);
      const addressButton = screen.getByRole('button', { name: /copy wallet address/i });
      fireEvent.mouseEnter(addressButton);
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
    });

    it('status dot has aria-label', () => {
      render(<WalletStatus wallet={mockWallet} />);
      const statusDot = screen.getByRole('status');
      expect(statusDot).toHaveAttribute('aria-label');
    });
  });
});
