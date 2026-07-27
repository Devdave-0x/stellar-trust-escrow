import { render, screen, act } from '@testing-library/react';
import RelativeTime from '../../../components/ui/RelativeTime';

// Helper: create a timestamp relative to now
const msAgo = (ms) => new Date(Date.now() - ms).toISOString();
const msFromNow = (ms) => new Date(Date.now() + ms).toISOString();

describe('RelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-26T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders "just now" for very recent timestamps', () => {
    const ts = msAgo(5_000); // 5 seconds ago
    render(<RelativeTime timestamp={ts} />);
    // Within 10 seconds, shows "just now"
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('renders relative time for minutes ago', () => {
    const ts = msAgo(5 * 60_000); // 5 minutes ago
    render(<RelativeTime timestamp={ts} />);
    expect(screen.getByText(/5 min/i)).toBeInTheDocument();
  });

  it('renders relative time for hours ago', () => {
    const ts = msAgo(3 * 60 * 60_000); // 3 hours ago
    render(<RelativeTime timestamp={ts} />);
    // Intl.RelativeTimeFormat renders "3 hours ago"
    expect(screen.getByText(/3 hour/i)).toBeInTheDocument();
  });

  it('falls back to absolute date for timestamps older than 7 days', () => {
    const ts = msAgo(10 * 24 * 60 * 60_000); // 10 days ago
    render(<RelativeTime timestamp={ts} />);
    // Should show something like "07/16/2026, 12:00" or similar locale format
    const el = screen.getByText(/07\/16\/2026|2026/);
    expect(el).toBeInTheDocument();
  });

  it('shows absolute date in tooltip via title attribute', () => {
    const ts = msAgo(5 * 60_000); // 5 minutes ago
    render(<RelativeTime timestamp={ts} />);
    const el = screen.getByText(/5 min/i);
    expect(el).toHaveAttribute('title');
    // title should contain the absolute date
    expect(el.getAttribute('title')).toMatch(/2026/);
  });

  it('handles future timestamps', () => {
    const ts = msFromNow(30 * 60_000); // 30 minutes from now
    render(<RelativeTime timestamp={ts} />);
    expect(screen.getByText(/30 min/i)).toBeInTheDocument();
  });

  it('handles invalid timestamp gracefully', () => {
    render(<RelativeTime timestamp="not-a-date" />);
    expect(screen.getByText('Invalid date')).toBeInTheDocument();
  });

  it('handles null/undefined gracefully', () => {
    render(<RelativeTime timestamp={null} />);
    // Empty string - nothing rendered visibly for the label
    const el = document.querySelector('[title]');
    // The component returns empty string for null dates
    expect(screen.queryByText(/date/i)).not.toBeInTheDocument();
  });

  it('auto-updates after 60 seconds', () => {
    const ts = msAgo(10_000); // 10 seconds ago
    render(<RelativeTime timestamp={ts} />);

    // Initially should show "now" or "10 seconds ago"
    const initialText = screen.getByText(/now|second/i).textContent;

    // Advance time by 70 seconds
    act(() => {
      jest.advanceTimersByTime(70_000);
    });

    // Should now show "1 minute ago"
    expect(screen.getByText(/1 min/i)).toBeInTheDocument();
  });
});
