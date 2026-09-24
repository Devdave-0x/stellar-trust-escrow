import React from 'react';
import { render, screen } from '@testing-library/react-native';
import StaleDataBanner, {
  formatLastSynced,
  staleBannerMessage,
} from '../components/escrow/StaleDataBanner';
import type { EscrowResult } from '../hooks/useEscrows';
import type { Escrow } from '../lib/api';

jest.mock('../hooks/useEscrows', () => ({}));

const NOW = 1_700_000_000_000;
const escrow = { id: '42' } as unknown as Escrow;

function result(overrides: Partial<EscrowResult>): EscrowResult {
  return { escrow, source: 'network', syncedAt: NOW, ...overrides };
}

describe('formatLastSynced', () => {
  it.each([
    [10_000, 'just now'],
    [5 * 60_000, '5 min ago'],
    [3 * 60 * 60_000, '3 h ago'],
    [24 * 60 * 60_000, '1 day ago'],
    [3 * 24 * 60 * 60_000, '3 days ago'],
  ])('formats an age of %i ms as "%s"', (age, expected) => {
    expect(formatLastSynced(NOW - age, NOW)).toBe(expected);
  });

  it('treats a sync time in the future as just now', () => {
    expect(formatLastSynced(NOW + 60_000, NOW)).toBe('just now');
  });
});

describe('staleBannerMessage', () => {
  it('is null for fresh data and while loading', () => {
    expect(staleBannerMessage(result({ source: 'network' }), NOW)).toBeNull();
    expect(staleBannerMessage(undefined, NOW)).toBeNull();
  });
});

describe('StaleDataBanner', () => {
  it('shows the offline message with the last sync time', () => {
    render(
      <StaleDataBanner
        result={result({ source: 'cache', staleReason: 'offline', syncedAt: NOW - 5 * 60_000 })}
        now={NOW}
      />,
    );

    expect(screen.getByTestId('stale-data-banner')).toBeTruthy();
    expect(
      screen.getByText("You're offline. Showing saved data. Last synced 5 min ago."),
    ).toBeTruthy();
  });

  it('shows the fetch-failure message after a failed refresh', () => {
    render(
      <StaleDataBanner
        result={result({
          source: 'cache',
          staleReason: 'fetch-failed',
          syncedAt: NOW - 2 * 60 * 60_000,
        })}
        now={NOW}
      />,
    );

    expect(
      screen.getByText(
        "Couldn't refresh. Showing saved data. Last synced 2 h ago. Pull down to retry.",
      ),
    ).toBeTruthy();
  });

  it('hides after a fresh sync', () => {
    render(<StaleDataBanner result={result({ source: 'network' })} now={NOW} />);

    expect(screen.queryByTestId('stale-data-banner')).toBeNull();
  });
});
