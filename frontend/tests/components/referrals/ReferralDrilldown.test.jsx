import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReferralDrilldown from '../../../components/referrals/ReferralDrilldown';

jest.mock('../../../lib/api/client', () => ({ __esModule: true, default: { get: jest.fn() } }));

const empty = { totals: { referrals: 0, conversions: 0, pendingRewards: 0, invalid: 0, claimed: 0 }, referrals: [], claimHistory: [] };
const populated = {
  totals: { referrals: 3, conversions: 2, pendingRewards: 1, invalid: 1, claimed: 1 },
  referrals: [
    { joinedAt: '2026-01-02T00:00:00Z', rewardedAt: '2026-01-10T00:00:00Z', status: 'rewarded' },
    { joinedAt: '2026-01-03T00:00:00Z', rewardedAt: null, status: 'converted' },
    { joinedAt: '2026-01-04T00:00:00Z', rewardedAt: null, status: 'invalid' },
  ],
  claimHistory: [{ rewardedAt: '2026-01-10T00:00:00Z', joinedAt: '2026-01-02T00:00:00Z' }],
};

describe('ReferralDrilldown', () => {
  it('shows the empty state when there are no referrals', async () => {
    render(<ReferralDrilldown fetchStats={jest.fn().mockResolvedValue(empty)} />);
    expect(await screen.findByTestId('referral-empty')).toHaveTextContent('No referrals yet');
  });

  it('shows totals, statuses and claim history when populated', async () => {
    render(<ReferralDrilldown fetchStats={jest.fn().mockResolvedValue(populated)} />);
    expect(await screen.findByTestId('stat-Conversions')).toHaveTextContent('2');
    expect(screen.getByTestId('stat-Invalid referrals')).toHaveTextContent('1');
    expect(screen.getByText('Invalid (self-referral)')).toBeInTheDocument();
    expect(screen.getByTestId('claim-history').children).toHaveLength(1);
  });

  it('refetches with the selected date range', async () => {
    const fetchStats = jest.fn().mockResolvedValue(empty);
    render(<ReferralDrilldown fetchStats={fetchStats} />);
    await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    await waitFor(() => expect(fetchStats).toHaveBeenLastCalledWith({ from: '2026-01-01T00:00:00.000Z' }));
    expect(await screen.findByTestId('referral-empty')).toHaveTextContent('in this date range');
  });

  it('shows the API error', async () => {
    render(<ReferralDrilldown fetchStats={jest.fn().mockRejectedValue(new Error('boom'))} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
