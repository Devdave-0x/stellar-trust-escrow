import { screen, waitFor } from '@testing-library/react';
import AdminAuditLogsPage from '../../../app/admin/audit-logs/page';
import { renderWithStore } from '../../../store/test-utils';

const localStorageMock = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,

    setItem: (key, value) => {
      store[key] = value;
    },

    removeItem: (key) => {
      delete store[key];
    },

    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

global.fetch = jest.fn();

describe('AdminAuditLogsPage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('renders page heading', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        logs: [],
        pagination: {
          page: 1,
          total: 0,
          pages: 1,
        },
      }),
    });

    renderWithStore(<AdminAuditLogsPage />);

    expect(screen.getByText('Audit Logs')).toBeInTheDocument();
  });

  it('shows skeleton loading state while audit logs are being fetched', () => {
    global.fetch.mockImplementationOnce(() => new Promise(() => {}));

    renderWithStore(<AdminAuditLogsPage />);

    expect(screen.getByText('Loading audit logs')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Audit logs' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows empty state when no logs', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        logs: [],
        pagination: {
          page: 1,
          total: 0,
          pages: 1,
        },
      }),
    });

    renderWithStore(<AdminAuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('No audit entries yet.')).toBeInTheDocument();
    });
  });

  it('renders log entries', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        logs: [
          {
            id: 1,
            action: 'BAN_USER',
            targetAddress: 'GABC123',
            reason: 'Spam',
            performedAt: '2025-03-01T10:00:00Z',
          },
        ],
        pagination: {
          page: 1,
          total: 1,
          pages: 1,
        },
      }),
    });

    renderWithStore(<AdminAuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('BAN_USER')).toBeInTheDocument();
    });
  });

  it('shows error when fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'Unauthorized',
      }),
    });

    renderWithStore(<AdminAuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Unauthorized/)).toBeInTheDocument();
    });
  });

  it('renders table headers', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        logs: [],
        pagination: {
          page: 1,
          total: 0,
          pages: 1,
        },
      }),
    });

    renderWithStore(<AdminAuditLogsPage />);

    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Target')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Performed At')).toBeInTheDocument();
  });

  it('renders back to dashboard link', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        logs: [],
        pagination: {
          page: 1,
          total: 0,
          pages: 1,
        },
      }),
    });

    renderWithStore(<AdminAuditLogsPage />);

    expect(screen.getByText('← Dashboard')).toBeInTheDocument();
  });
});