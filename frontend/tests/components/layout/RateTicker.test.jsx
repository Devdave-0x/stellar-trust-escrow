import { render, screen } from '@testing-library/react';
import RateTicker from '../../../components/layout/RateTicker';

jest.mock('../../../hooks/useLiveXlmRate', () => ({
  useLiveXlmRate: jest.fn(),
}));

const { useLiveXlmRate } = require('../../../hooks/useLiveXlmRate');

describe('RateTicker empty state', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing while the rate is still loading', () => {
    useLiveXlmRate.mockReturnValue({
      rate_usd: null,
      stale: false,
      loading: true,
      hasRate: false,
    });

    render(<RateTicker />);

    expect(screen.queryByText(/XLM rate unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/1 XLM =/i)).not.toBeInTheDocument();
  });

  it('renders a friendly empty state when the rate source returns zero results', () => {
    useLiveXlmRate.mockReturnValue({
      rate_usd: null,
      stale: false,
      loading: false,
      hasRate: false,
    });

    render(<RateTicker />);

    expect(screen.getByText(/XLM rate unavailable/i)).toBeInTheDocument();
    expect(screen.getByTitle(/not available right now/i)).toBeInTheDocument();
  });

  it('renders the live rate when data is available', () => {
    useLiveXlmRate.mockReturnValue({
      rate_usd: 0.1234567,
      stale: false,
      loading: false,
      hasRate: true,
    });

    render(<RateTicker />);

    expect(screen.getByText(/1 XLM = \$0\.1235 USD/i)).toBeInTheDocument();
    expect(screen.queryByText(/XLM rate unavailable/i)).not.toBeInTheDocument();
  });
});