import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithAppProviders } from '../test-utils';
import EscrowDetailPage from '../../app/escrow/[id]/page';

const mockMutate = jest.fn().mockResolvedValue(undefined);
const liveEscrow = {
  id: 1,
  title: 'Smart Contract Audit',
  status: 'Active',
  txHash: 'abc123',
  clientAddress: 'GCLIENT',
  freelancerAddress: 'GFREELANCER',
  totalAmount: '2,000 USDC',
  remainingBalance: '1,500 USDC',
  createdAt: '2025-03-01',
  deadline: '2025-04-01',
  transactionHash: 'txhash',
  terms: '',
  evidenceHashes: [],
  arbiterAddress: null,
  disputeDescription: null,
  milestones: [
    { id: 0, title: 'Codebase Review', amount: '500 USDC', status: 'Approved', submittedAt: '2025-03-05' },
    { id: 1, title: 'Vulnerability Report', amount: '1,000 USDC', status: 'Submitted', submittedAt: '2025-03-12' },
    { id: 2, title: 'Final Sign-off', amount: '500 USDC', status: 'Pending', submittedAt: null },
  ],
};

let escrowMock = {
  escrow: liveEscrow,
  isLoading: false,
  error: null,
  mutate: mockMutate,
};

jest.mock('../../hooks/useEscrow', () => ({
  useEscrow: () => escrowMock,
}));

jest.mock(
  '../../components/ui/CurrencyAmount',
  () =>
    function CurrencyAmount({ amount }) {
      return <span>{amount}</span>;
    },
);

jest.mock(
  '../../components/escrow/MilestoneList',
  () =>
    function MilestoneList({ milestones }) {
      return (
        <ul>
          {milestones.map((m) => (
            <li key={m.id}>{m.title}</li>
          ))}
        </ul>
      );
    },
);

const params = { id: '1' };

beforeEach(() => {
  mockMutate.mockClear();
  escrowMock = {
    escrow: liveEscrow,
    isLoading: false,
    error: null,
    mutate: mockMutate,
  };
});

describe('EscrowDetailPage', () => {
  it('renders escrow title', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Smart Contract Audit')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    escrowMock = { escrow: null, isLoading: true, error: null, mutate: mockMutate };
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText(/Loading escrow/)).toBeInTheDocument();
  });

  it('shows error with retry', () => {
    escrowMock = {
      escrow: null,
      isLoading: false,
      error: new Error('boom'),
      mutate: mockMutate,
    };
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText(/Unable to load escrow/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows not-found for unknown id', () => {
    escrowMock = { escrow: null, isLoading: false, error: null, mutate: mockMutate };
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText(/Escrow not found/)).toBeInTheDocument();
  });

  it('renders escrow status badge', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders escrow ID', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Escrow #1')).toBeInTheDocument();
  });

  it('renders info cells', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText('2,000 USDC')).toBeInTheDocument();
    expect(screen.getByText('1,500 USDC')).toBeInTheDocument();
  });

  it('renders Raise Dispute button for active escrow', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByRole('button', { name: /Raise Dispute/ })).toBeInTheDocument();
  });

  it('opens dispute modal when Raise Dispute is clicked', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    fireEvent.click(screen.getByRole('button', { name: /Raise Dispute/ }));
    expect(screen.getByText('Raise Dispute')).toBeInTheDocument();
    expect(screen.getAllByText(/Escrow #1/).length).toBeGreaterThan(0);
  });

  it('closes dispute modal when Cancel is clicked', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    fireEvent.click(screen.getByRole('button', { name: /Raise Dispute/ }));
    fireEvent.click(screen.getAllByText('Cancel')[0]);
    // Modal should close - the backdrop should be gone
    expect(screen.queryByText(/freeze all funds/)).not.toBeInTheDocument();
  });

  it('renders milestones section', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByRole('heading', { name: 'Milestones' })).toBeInTheDocument();
  });

  it('renders all 3 milestones', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Codebase Review')).toBeInTheDocument();
    expect(screen.getByText('Vulnerability Report')).toBeInTheDocument();
    expect(screen.getByText('Final Sign-off')).toBeInTheDocument();
  });

  it('renders party cards', () => {
    renderWithAppProviders(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Freelancer')).toBeInTheDocument();
  });

  describe('auto-refresh', () => {
    it('shows last updated timestamp on mount', () => {
      renderWithAppProviders(<EscrowDetailPage params={params} />);
      expect(screen.getByTestId('last-refreshed')).toHaveTextContent(/Last updated:/);
    });

    it('renders a manual Refresh button', () => {
      renderWithAppProviders(<EscrowDetailPage params={params} />);
      expect(screen.getByRole('button', { name: /Refresh escrow data/ })).toBeInTheDocument();
    });

    it('calls mutate when the Refresh button is clicked', async () => {
      renderWithAppProviders(<EscrowDetailPage params={params} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Refresh escrow data/ }));
      });
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('updates the last updated timestamp after a manual refresh', async () => {
      renderWithAppProviders(<EscrowDetailPage params={params} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Refresh escrow data/ }));
      });
      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
      expect(screen.getByTestId('last-refreshed')).toHaveTextContent(/Last updated:/);
    });
  });
});
