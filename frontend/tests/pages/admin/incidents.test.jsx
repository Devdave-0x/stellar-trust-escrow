import { fireEvent, screen, waitFor } from '@testing-library/react';
import AdminIncidentsPage from '../../../app/admin/incidents/page';
import { renderWithStore } from '../../../store/test-utils';

global.fetch = jest.fn();

const persistedState = { admin: { apiKey: 'test-admin-key' } };

describe('AdminIncidentsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/admin/incidents');
  });

  it('persists severity/status/search in the URL and combines search', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 'INC-1',
          title: 'Database outage',
          description: 'DB down',
          severity: 'SEV1',
          status: 'open',
          commander: 'A',
        },
        {
          id: 'INC-2',
          title: 'Minor latency',
          description: 'Slow',
          severity: 'SEV1',
          status: 'open',
          commander: 'B',
        },
      ],
    });

    renderWithStore(<AdminIncidentsPage />, { persistedState });

    expect(await screen.findByText('Database outage')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Severity'), {
      target: { value: 'SEV1' },
    });
    fireEvent.change(screen.getByLabelText('Status'), {
      target: { value: 'open' },
    });
    fireEvent.change(screen.getByLabelText('Search incidents'), {
      target: { value: 'database' },
    });

    await waitFor(() => {
      expect(window.location.search).toContain('severity=SEV1');
      expect(window.location.search).toContain('status=open');
      expect(window.location.search).toContain('q=database');
    });

    expect(await screen.findByText('Database outage')).toBeInTheDocument();
    expect(screen.queryByText('Minor latency')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('severity=SEV1'),
        expect.any(Object),
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=open'),
        expect.any(Object),
      );
    });
  });

  it('renders the required empty result state', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    renderWithStore(<AdminIncidentsPage />, { persistedState });

    expect(
      await screen.findByText('No incidents match the current filters.'),
    ).toBeInTheDocument();
  });
});
