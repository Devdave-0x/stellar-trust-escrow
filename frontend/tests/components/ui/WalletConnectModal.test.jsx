import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WalletConnectModal, { SUPPORTED_WALLETS } from '../../../components/ui/WalletConnectModal';

function makeWallet(overrides = {}) {
  return {
    isConnected: false,
    error: null,
    connect: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WalletConnectModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <WalletConnectModal isOpen={false} onClose={jest.fn()} wallet={makeWallet()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists every supported wallet by name', () => {
    render(<WalletConnectModal isOpen={true} onClose={jest.fn()} wallet={makeWallet()} />);
    SUPPORTED_WALLETS.forEach((w) => {
      expect(screen.getByText(w.name)).toBeInTheDocument();
    });
  });

  it('has an accessible list of wallets', () => {
    render(<WalletConnectModal isOpen={true} onClose={jest.fn()} wallet={makeWallet()} />);
    expect(screen.getByRole('list', { name: 'Available wallets' })).toBeInTheDocument();
  });

  it('marks unavailable wallets as disabled with a "Coming soon" label', () => {
    render(<WalletConnectModal isOpen={true} onClose={jest.fn()} wallet={makeWallet()} />);
    const albedoButton = screen.getByText('Albedo').closest('button');
    expect(albedoButton).toBeDisabled();
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0);
  });

  it('does not disable the Freighter option', () => {
    render(<WalletConnectModal isOpen={true} onClose={jest.fn()} wallet={makeWallet()} />);
    const freighterButton = screen.getByText('Freighter').closest('button');
    expect(freighterButton).not.toBeDisabled();
  });

  it('calls wallet.connect when Freighter is selected', () => {
    const walletMock = makeWallet();
    render(<WalletConnectModal isOpen={true} onClose={jest.fn()} wallet={walletMock} />);
    fireEvent.click(screen.getByText('Freighter').closest('button'));
    expect(walletMock.connect).toHaveBeenCalledTimes(1);
  });

  it('does not call connect for an unavailable wallet', () => {
    const walletMock = makeWallet();
    render(<WalletConnectModal isOpen={true} onClose={jest.fn()} wallet={walletMock} />);
    fireEvent.click(screen.getByText('Rabet').closest('button'));
    expect(walletMock.connect).not.toHaveBeenCalled();
  });

  it('closes and calls onConnected once the wallet becomes connected', async () => {
    const onClose = jest.fn();
    const onConnected = jest.fn();
    const walletMock = makeWallet();
    const { rerender } = render(
      <WalletConnectModal
        isOpen={true}
        onClose={onClose}
        wallet={walletMock}
        onConnected={onConnected}
      />,
    );

    fireEvent.click(screen.getByText('Freighter').closest('button'));
    rerender(
      <WalletConnectModal
        isOpen={true}
        onClose={onClose}
        wallet={makeWallet({ isConnected: true })}
        onConnected={onConnected}
      />,
    );

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onConnected).toHaveBeenCalledWith('freighter');
  });

  it('shows an error alert when the wallet reports an error while connecting', async () => {
    const walletMock = makeWallet();
    const { rerender } = render(
      <WalletConnectModal isOpen={true} onClose={jest.fn()} wallet={walletMock} />,
    );

    fireEvent.click(screen.getByText('Freighter').closest('button'));
    rerender(
      <WalletConnectModal
        isOpen={true}
        onClose={jest.fn()}
        wallet={makeWallet({ error: 'Freighter not installed' })}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Freighter not installed'),
    );
  });

  it('calls onClose when the modal close button is clicked', () => {
    const onClose = jest.fn();
    render(<WalletConnectModal isOpen={true} onClose={onClose} wallet={makeWallet()} />);
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
