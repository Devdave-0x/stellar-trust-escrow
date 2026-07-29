import { screen } from '@testing-library/react';
import EscrowCard from '../../../components/escrow/EscrowCard';
import { renderWithAppProviders } from '../../test-utils';

const baseEscrow = {
  id: 1,
  title: 'Logo Design Project',
  status: 'Active',
  totalAmount: '5000000000',
  milestoneProgress: '2 / 4',
  counterparty: 'GBXYZ...1234',
  role: 'client',
};

describe('EscrowCard', () => {
  it('renders escrow title', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('Logo Design Project')).toBeInTheDocument();
  });

  it('renders total amount', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('500.00 USDC')).toBeInTheDocument();
  });

  it('renders milestone progress', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('renders counterparty address', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('GBXYZ...1234')).toBeInTheDocument();
  });

  it('shows "Freelancer:" label for client role', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText(/Freelancer:/)).toBeInTheDocument();
  });

  it('shows "Client:" label for freelancer role', () => {
    renderWithAppProviders(<EscrowCard escrow={{ ...baseEscrow, role: 'freelancer' }} />);
    expect(screen.getByText(/Client:/)).toBeInTheDocument();
  });

  it('links to the escrow detail page', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    // The card navigates, so it must expose link semantics — it was previously
    // an <a role="button">, which misreported itself to assistive tech.
    expect(screen.getByRole('link', { name: /view details for escrow/i })).toHaveAttribute(
      'href',
      '/escrow/1',
    );
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('does not expose the navigating card as a button', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.queryByRole('button', { name: /view details for escrow/i })).toBeNull();
  });

  it('keeps the copy control outside the card link so it stays operable', () => {
    renderWithAppProviders(
      <EscrowCard escrow={{ ...baseEscrow, transactionHash: 'abcdef0123456789abcdef' }} />,
    );

    const cardLink = screen.getByRole('link', { name: /view details for escrow/i });
    const copyButton = screen.getByRole('button', { name: /copy transaction hash/i });

    expect(cardLink.contains(copyButton)).toBe(false);
  });

  it('exposes milestone progress as a labelled progressbar', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);

    const bar = screen.getByRole('progressbar', { name: /milestone progress/i });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('titles the card with a heading that wraps the card link', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);

    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('Logo Design Project');
    expect(heading).toContainElement(
      screen.getByRole('link', { name: /view details for escrow/i }),
    );
  });

  it('renders the status badge', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows "You are client" for client role', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('You are Client')).toBeInTheDocument();
  });

  it('shows "You are freelancer" for freelancer role', () => {
    renderWithAppProviders(<EscrowCard escrow={{ ...baseEscrow, role: 'freelancer' }} />);
    expect(screen.getByText('You are Freelancer')).toBeInTheDocument();
  });

  it('renders progress bar with correct width', () => {
    const { container } = renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('renders 0% progress when milestoneProgress is 0 / 4', () => {
    const { container } = renderWithAppProviders(
      <EscrowCard escrow={{ ...baseEscrow, milestoneProgress: '0 / 4' }} />,
    );
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '0%' });
  });
});
