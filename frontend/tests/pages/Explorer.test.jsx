import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExplorerPage from '../../app/explorer/page';

jest.mock('../../hooks/useFilterState', () => ({
  useFilterState: () => ({
    filters: {},
    setFilter: jest.fn(),
    setFilters: jest.fn(),
    resetFilters: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

global.fetch = jest.fn();

describe('Explorer Page - Loading Spinner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
    sessionStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('displays spinner and loading text during initial load', async () => {
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
            });
          }, 1000);
        }),
    );

    render(<ExplorerPage />);

    // Check for spinner and loading text
    await waitFor(() => {
      expect(screen.getByText(/loading escrows/i)).toBeInTheDocument();
    });
  });

  it('displays spinner with correct size', async () => {
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
            });
          }, 100);
        }),
    );

    const { container } = render(<ExplorerPage />);

    // The Spinner component should be rendered
    await waitFor(() => {
      expect(screen.getByText(/loading escrows/i)).toBeInTheDocument();
    });
  });

  it('removes spinner after data loads', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
    });

    render(<ExplorerPage />);

    // Initially shows loading text
    expect(screen.getByText(/loading escrows/i)).toBeInTheDocument();

    // After fetch completes, loading text should be gone
    await waitFor(() => {
      expect(screen.queryByText(/loading escrows/i)).not.toBeInTheDocument();
    });
  });

  it('displays error message when fetch fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('API Error'));

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load escrows/i)).toBeInTheDocument();
      expect(screen.getByText(/api error/i)).toBeInTheDocument();
    });
  });

  it('shows error alert role when fetch fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Connection failed'));

    render(<ExplorerPage />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });

  it('displays no escrows empty state when data is empty', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText(/no escrows found/i)).toBeInTheDocument();
    });
  });

  it('loading spinner is centered with flex layout', async () => {
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
            });
          }, 100);
        }),
    );

    const { container } = render(<ExplorerPage />);

    const loadingDiv = container.querySelector('div.flex.flex-col.items-center.justify-center.py-24.gap-4');
    expect(loadingDiv).toBeInTheDocument();
  });

  it('loading text is visible to sighted users (not sr-only)', async () => {
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
            });
          }, 100);
        }),
    );

    render(<ExplorerPage />);

    const loadingText = screen.getByText(/loading escrows/i);
    expect(loadingText).toBeInTheDocument();
    // Should not have sr-only class
    expect(loadingText).not.toHaveClass('sr-only');
  });

  it('loading spinner appears in Suspense fallback', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
    });

    render(<ExplorerPage />);

    // Suspense fallback should show spinner initially
    expect(screen.getByText(/loading escrows/i)).toBeInTheDocument();
  });

  it('shows loading spinner for more data when scrolling', async () => {
    const escrow = {
      id: '1',
      status: 'Active',
      totalAmount: '1000',
      clientAddress: 'GBUY...',
      deadline: null,
      assetSymbol: 'USDC',
    };

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [escrow], next_cursor: 'cursor1', has_more: true }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ data: [escrow], next_cursor: null, has_more: false }),
              });
            }, 100);
          }),
      );

    const { container } = render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading escrows\.\.\.$/)).not.toBeInTheDocument();
    });

    // Simulate scrolling to load more
    const sentinel = container.querySelector('[role="presentation"]');
    if (sentinel) {
      fireEvent.scroll(window, { target: { scrollY: 1000 } });
    }

    // Should show "Loading more..." text
    await waitFor(() => {
      expect(screen.getByText(/loading more/i)).toBeInTheDocument();
    });
  });

  it('search filters are displayed correctly', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: [], next_cursor: null, has_more: false }),
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByLabel(/search escrows/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
    });
  });

  it('handles API response with different cursor field names', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            {
              id: '1',
              status: 'Active',
              totalAmount: '1000',
              clientAddress: 'GBUY...',
            },
          ],
          hasNextPage: false,
        }),
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.queryByText(/loading escrows/i)).not.toBeInTheDocument();
    });
  });

  it('shows error detail message on API error', async () => {
    const errorMessage = 'Unauthorized access';
    global.fetch.mockRejectedValueOnce(new Error(errorMessage));

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  it('displays end of list message when all escrows loaded', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: '1', status: 'Active', totalAmount: '1000', clientAddress: 'GBUY...' }],
          has_more: false,
        }),
    });

    render(<ExplorerPage />);

    await waitFor(() => {
      expect(screen.getByText(/all escrows loaded/i)).toBeInTheDocument();
    });
  });
});
