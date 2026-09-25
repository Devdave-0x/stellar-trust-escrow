import { render, screen } from '@testing-library/react';
import DisputeTimelineAnomaly from '../../../components/dispute/DisputeTimelineAnomaly';

const events = [{ event_type: 'filed', timestamp: '2026-01-01T00:00:00Z', actor: 'GABC' }];

describe('DisputeTimelineAnomaly', () => {
  it('shows diagnostic details to administrators', () => {
    render(<DisputeTimelineAnomaly events={events} anomaly reason="event order mismatch" isAdmin />);
    expect(screen.getByTestId('timeline-anomaly-warning')).toBeInTheDocument();
    expect(screen.getByText(/event order mismatch/)).toBeInTheDocument();
    expect(screen.getByText('filed')).toBeInTheDocument();
  });

  it('hides chronology and shows safe fallback copy to end users', () => {
    render(<DisputeTimelineAnomaly events={events} anomaly />);
    expect(screen.getByTestId('timeline-anomaly-fallback')).toBeInTheDocument();
    expect(screen.queryByText('filed')).not.toBeInTheDocument();
  });
});
