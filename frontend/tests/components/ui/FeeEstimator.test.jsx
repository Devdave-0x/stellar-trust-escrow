import { fireEvent, render, screen } from '@testing-library/react';
import FeeEstimator from '../../../components/ui/FeeEstimator';

const mockSuccessResponse = {
  last_ledger_base_fee: '100',
  fee_charged: { min: '100' },
};

const mockJson = jest.fn().mockResolvedValue(mockSuccessResponse);

const mockFetch = jest.fn(() =>
  Promise.resolve({ ok: true, json: mockJson }),
);

describe('FeeEstimator', () => {
  beforeEach(() => {
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading skeleton and disables refresh while fetching', () => {
    render(<FeeEstimator />);

    expect(screen.getByRole('button', { name: /Refresh fee estimate/i })).toBeDisabled();
    expect(screen.getByText(/Estimated fee/i)).toBeInTheDocument();
  });

  it('renders the fee estimate in XLM and stroops after successful fetch', async () => {
    render(<FeeEstimator />);

    expect(await screen.findByText(/0\.00001\s*XLM/)).toBeInTheDocument();
    expect(await screen.findByText(/\(100\s*stroops\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh fee estimate/i })).not.toBeDisabled();
  });

  it('shows an error message when fee fetch fails', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network failure')));

    render(<FeeEstimator />);

    expect(
      await screen.findByText(/Fee unavailable — check your wallet before signing/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh fee estimate/i })).not.toBeDisabled();
  });

  it('re-fetches fee when refresh is clicked', async () => {
    render(<FeeEstimator />);

    expect(await screen.findByText(/0\.00001\s*XLM/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Refresh fee estimate/i }));

    expect(await screen.findByText(/0\.00001\s*XLM/)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
