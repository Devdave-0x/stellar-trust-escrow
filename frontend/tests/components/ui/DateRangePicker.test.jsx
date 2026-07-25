import { render, screen, fireEvent } from '@testing-library/react';
import DateRangePicker from '../../../components/ui/DateRangePicker';

// Freeze time so the calendar always opens on a known month
const FIXED_NOW = new Date(2025, 0, 1); // Jan 1 2025

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  jest.useRealTimers();
});

const JAN_10 = new Date(2025, 0, 10);
const JAN_20 = new Date(2025, 0, 20);

function openStartCalendar() {
  fireEvent.click(screen.getByLabelText('Start date'));
}

function openEndCalendar() {
  fireEvent.click(screen.getByLabelText('End date'));
}

function clickDay(label) {
  fireEvent.click(screen.getByLabelText(label));
}

describe('DateRangePicker', () => {
  it('renders start and end date inputs', () => {
    render(<DateRangePicker />);
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    expect(screen.getByLabelText('End date')).toBeInTheDocument();
  });

  it('shows a calendar when start date input is clicked', () => {
    render(<DateRangePicker />);
    openStartCalendar();
    expect(screen.getByLabelText('Start date calendar')).toBeInTheDocument();
  });

  it('shows a calendar when end date input is clicked', () => {
    render(<DateRangePicker />);
    openEndCalendar();
    expect(screen.getByLabelText('End date calendar')).toBeInTheDocument();
  });

  describe('range selection', () => {
    it('calls onChange with { from, to } when both dates are selected', () => {
      const onChange = jest.fn();
      render(<DateRangePicker onChange={onChange} />);

      openStartCalendar();
      clickDay('10 January 2025');
      // end calendar auto-opens; pick end date
      clickDay('20 January 2025');

      expect(onChange).toHaveBeenCalledTimes(1);
      const arg = onChange.mock.calls[0][0];
      expect(arg.from.toDateString()).toBe(JAN_10.toDateString());
      expect(arg.to.toDateString()).toBe(JAN_20.toDateString());
    });

    it('updates the start date input display after selection', () => {
      render(<DateRangePicker />);
      openStartCalendar();
      clickDay('10 January 2025');
      expect(screen.getByLabelText('Start date')).toHaveValue('2025-01-10');
    });

    it('updates the end date input display after selection', () => {
      const onChange = jest.fn();
      render(<DateRangePicker onChange={onChange} />);
      openStartCalendar();
      clickDay('10 January 2025');
      clickDay('20 January 2025');
      expect(screen.getByLabelText('End date')).toHaveValue('2025-01-20');
    });
  });

  describe('invalid range prevention', () => {
    it('clears the end date when a new start date is set after the current end', () => {
      render(<DateRangePicker value={{ from: JAN_10, to: JAN_20 }} onChange={jest.fn()} />);

      openStartCalendar();
      // Jan 25 is after current end (Jan 20)
      clickDay('25 January 2025');

      expect(screen.getByLabelText('End date')).toHaveValue('');
    });

    it('end calendar disables days before the start date', () => {
      render(<DateRangePicker value={{ from: JAN_20, to: null }} onChange={jest.fn()} />);
      openEndCalendar();

      const day5btn = screen.queryByLabelText('5 January 2025');
      if (day5btn) {
        expect(day5btn).toBeDisabled();
      }
    });
  });

  describe('minDate / maxDate enforcement', () => {
    it('disables days before minDate in the start calendar', () => {
      render(<DateRangePicker minDate={JAN_10} onChange={jest.fn()} />);
      openStartCalendar();
      const btn = screen.queryByLabelText('5 January 2025');
      if (btn) expect(btn).toBeDisabled();
    });

    it('disables days after maxDate in the start calendar', () => {
      render(<DateRangePicker maxDate={JAN_20} onChange={jest.fn()} />);
      openStartCalendar();
      const btn = screen.queryByLabelText('25 January 2025');
      if (btn) expect(btn).toBeDisabled();
    });

    it('disables days after maxDate in the end calendar', () => {
      render(
        <DateRangePicker value={{ from: JAN_10, to: null }} maxDate={JAN_20} onChange={jest.fn()} />,
      );
      openEndCalendar();
      const btn = screen.queryByLabelText('25 January 2025');
      if (btn) expect(btn).toBeDisabled();
    });
  });

  describe('keyboard navigation', () => {
    it('ArrowRight moves focus to the next day', () => {
      render(<DateRangePicker />);
      openStartCalendar();
      const day10 = screen.getByLabelText('10 January 2025');
      day10.focus();
      fireEvent.keyDown(day10, { key: 'ArrowRight' });
      expect(document.activeElement).toHaveAttribute('aria-label', '11 January 2025');
    });

    it('Enter selects the focused day', () => {
      const onChange = jest.fn();
      render(<DateRangePicker onChange={onChange} />);
      openStartCalendar();
      const day10 = screen.getByLabelText('10 January 2025');
      day10.focus();
      fireEvent.keyDown(day10, { key: 'Enter' });
      expect(screen.getByLabelText('Start date')).toHaveValue('2025-01-10');
    });

    it('Space selects the focused day', () => {
      render(<DateRangePicker onChange={jest.fn()} />);
      openStartCalendar();
      const day10 = screen.getByLabelText('10 January 2025');
      day10.focus();
      fireEvent.keyDown(day10, { key: ' ' });
      expect(screen.getByLabelText('Start date')).toHaveValue('2025-01-10');
    });
  });
});
