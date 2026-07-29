import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from '../../../app/admin/page';
import { renderWithStore } from '../../../store/test-utils';
import { APP_STORAGE_KEY } from '../../../store/state';

// jsdom reports every element as 0×0; give the chart explicit dimensions so
// ResponsiveContainer does not size the plot to nothing (and warn).
jest.mock('recharts', () => {
  const actual = jest.requireActual('recharts');
  const { cloneElement } = jest.requireActual('react');
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 400, height: 200 }),
  };
});

// Mock localStorage
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
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch
global.fetch = jest.fn();

const STATS = {
  escrows: { total: 20, active: 8, completed: 9, disputed: 2 },
  users: { total: 33 },
  disputes: { open: 1, resolved: 1 },
};

function authenticate(apiKey = 'test-key') {
  localStorageMock.setItem(APP_STORAGE_KEY, JSON.stringify({ admin: { apiKey } }));
}

function mockStats(stats = STATS) {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => stats });
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  describe('authentication', () => {
    it('renders admin dashboard heading', () => {
      renderWithStore(<AdminDashboard />);
      expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();
    });

    it('shows API key login form when not authenticated', () => {
      renderWithStore(<AdminDashboard />);
      expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter admin API key')).toBeInTheDocument();
    });

    it('gives the API key field a real label, not just a placeholder', () => {
      renderWithStore(<AdminDashboard />);
      const input = screen.getByLabelText('Admin API key');
      expect(input).toHaveAttribute('type', 'password');
      expect(input).toBeRequired();
    });

    it('shows Authenticate button', () => {
      renderWithStore(<AdminDashboard />);
      expect(screen.getByRole('button', { name: 'Authenticate' })).toBeInTheDocument();
    });

    it('submits API key on form submit', async () => {
      mockStats();
      renderWithStore(<AdminDashboard />);
      fireEvent.change(screen.getByPlaceholderText('Enter admin API key'), {
        target: { value: 'test-key' },
      });
      fireEvent.submit(screen.getByRole('button', { name: 'Authenticate' }).closest('form'));
      const persisted = JSON.parse(localStorageMock.getItem(APP_STORAGE_KEY));
      expect(persisted.admin.apiKey).toBe('test-key');
      await screen.findByRole('region', { name: 'Platform metrics' });
    });

    it('signs out and clears key', async () => {
      authenticate();
      mockStats({
        escrows: { total: 0, active: 0, completed: 0, disputed: 0 },
        users: { total: 0 },
        disputes: { open: 0, resolved: 0 },
      });
      renderWithStore(<AdminDashboard />);
      const signOut = await screen.findByText('Sign out');
      await screen.findByRole('region', { name: 'Platform metrics' });
      fireEvent.click(signOut);
      const persisted = JSON.parse(localStorageMock.getItem(APP_STORAGE_KEY));
      expect(persisted.admin.apiKey).toBe('');
      expect(screen.getByText('Admin Authentication')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('shows nav items when authenticated', async () => {
      authenticate();
      mockStats();
      renderWithStore(<AdminDashboard />);
      expect(await screen.findByText('User Management')).toBeInTheDocument();
      expect(screen.getByText('Dispute Resolution')).toBeInTheDocument();
      expect(screen.getByText('Audit Logs')).toBeInTheDocument();
      expect(screen.getByText('Platform Settings')).toBeInTheDocument();
      expect(screen.getByText('Feature Flags')).toBeInTheDocument();
      expect(screen.getByText('Operations Console')).toBeInTheDocument();
    });

    it('exposes the sections as a labelled nav landmark of links', async () => {
      authenticate();
      mockStats();
      renderWithStore(<AdminDashboard />);

      const nav = await screen.findByRole('navigation', { name: 'Admin sections' });
      const links = within(nav).getAllByRole('link');
      expect(links).toHaveLength(6);
      expect(links[0]).toHaveAttribute('href', '/admin/users');
    });
  });

  describe('metrics', () => {
    it('renders the KPI row from the stats payload', async () => {
      authenticate();
      mockStats();
      renderWithStore(<AdminDashboard />);

      const section = await screen.findByRole('region', { name: 'Platform metrics' });
      expect(within(section).getByText('Total escrows').closest('div')).toBeInTheDocument();
      expect(within(section).getByText('20')).toBeInTheDocument();
      expect(within(section).getByText('33')).toBeInTheDocument();
      // 9 completed of 20 = 45%
      expect(within(section).getByText('45%')).toBeInTheDocument();
    });

    it('announces the loaded figures politely instead of stealing focus', async () => {
      authenticate();
      mockStats();
      renderWithStore(<AdminDashboard />);

      const status = await screen.findByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      await waitFor(() =>
        expect(status).toHaveTextContent('20 escrows, 33 users, 1 open disputes'),
      );
    });

    it('renders both charts with their table views', async () => {
      authenticate();
      mockStats();
      renderWithStore(<AdminDashboard />);

      expect(
        await screen.findByRole('region', { name: 'Escrow status distribution' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Dispute resolution' })).toBeInTheDocument();
      expect(
        screen.getByRole('table', { name: 'Escrow count and share of total, by lifecycle status' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('table', {
          name: 'Dispute counts by state, with resolution and dispute rates',
        }),
      ).toBeInTheDocument();
    });
  });

  describe('refresh', () => {
    it('refetches stats when the refresh button is pressed', async () => {
      const user = userEvent.setup();
      authenticate();
      mockStats();
      renderWithStore(<AdminDashboard />);

      const refresh = await screen.findByRole('button', { name: 'Refresh' });
      expect(global.fetch).toHaveBeenCalledTimes(1);

      mockStats({ ...STATS, escrows: { ...STATS.escrows, total: 21 } });
      await user.click(refresh);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
      const section = screen.getByRole('region', { name: 'Platform metrics' });
      await waitFor(() => expect(within(section).getByText('21')).toBeInTheDocument());
    });

    it('does not offer refresh before authentication', () => {
      renderWithStore(<AdminDashboard />);
      expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    });
  });

  describe('errors', () => {
    it('shows error when fetch fails', async () => {
      authenticate('bad-key');
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Unauthorized' }),
      });
      renderWithStore(<AdminDashboard />);
      expect(await screen.findByText(/Unauthorized/)).toBeInTheDocument();
    });

    it('reports the failure through an alert so it is announced', async () => {
      authenticate('bad-key');
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Unauthorized' }),
      });
      renderWithStore(<AdminDashboard />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Unauthorized');
    });
  });

  describe('empty platform', () => {
    it('renders zero-state charts rather than blank cards', async () => {
      authenticate();
      mockStats({
        escrows: { total: 0, active: 0, completed: 0, disputed: 0 },
        users: { total: 0 },
        disputes: { open: 0, resolved: 0 },
      });
      renderWithStore(<AdminDashboard />);

      expect(await screen.findByText('No escrows have been created yet.')).toBeInTheDocument();
      expect(screen.getByText('No disputes have been raised yet.')).toBeInTheDocument();
      // A rate with no denominator reads as an em dash, never 0%.
      const section = screen.getByRole('region', { name: 'Platform metrics' });
      expect(within(section).getByText('—')).toBeInTheDocument();
    });
  });
});
