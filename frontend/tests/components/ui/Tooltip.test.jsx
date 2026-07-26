import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tooltip from '../../../components/ui/Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders trigger element', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on mouse enter after 300ms delay', async () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);

    // Should NOT be visible immediately (tooltip exists in DOM but is aria-hidden)
    const tooltipBefore = document.querySelector('[role="tooltip"]');
    expect(tooltipBefore).toHaveAttribute('aria-hidden', 'true');

    // Advance timers by 300ms
    act(() => {
      jest.advanceTimersByTime(300);
    });

    await waitFor(() => {
      const tooltipAfter = document.querySelector('[role="tooltip"]');
      expect(tooltipAfter).toHaveAttribute('aria-hidden', 'false');
    });
  });

  it('hides tooltip instantly on mouse leave', async () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByText('Help text')).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);

    await waitFor(() => {
      const tooltips = screen.queryAllByRole('tooltip', { hidden: true });
      const visibleTooltips = tooltips.filter((t) => t.getAttribute('aria-hidden') === 'false');
      expect(visibleTooltips.length).toBe(0);
    });
  });

  it('shows tooltip on focus', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.focus(trigger);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByText('Help text')).toBeInTheDocument();
  });

  it('hides tooltip on Escape key', async () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.focus(trigger);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByText('Help text')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      const tooltips = screen.queryAllByRole('tooltip', { hidden: true });
      const visibleTooltips = tooltips.filter((t) => t.getAttribute('aria-hidden') === 'false');
      expect(visibleTooltips.length).toBe(0);
    });
  });

  it('has correct ARIA attributes', () => {
    const { container } = render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('sets aria-describedby on trigger when visible', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').closest('[role="button"]');

    // Before showing, aria-describedby should be undefined
    expect(trigger.getAttribute('aria-describedby')).toBeNull();

    fireEvent.focus(trigger);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // After showing, aria-describedby should point to the tooltip id
    expect(trigger.getAttribute('aria-describedby')).toBeTruthy();
    expect(trigger.getAttribute('aria-describedby')).toMatch(/^tooltip-/);
  });

  it('does not show on mouse enter if quickly left before delay', () => {
    render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);

    act(() => {
      jest.advanceTimersByTime(100);
    });

    fireEvent.mouseLeave(trigger);

    // Timer should be cleared, tooltip should remain hidden
    act(() => {
      jest.advanceTimersByTime(300);
    });

    const tooltip = document.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders with role="tooltip"', () => {
    const { container } = render(
      <Tooltip content="Help text">
        <button>Hover me</button>
      </Tooltip>,
    );

    expect(container.querySelector('[role="tooltip"]')).toBeInTheDocument();
  });
});
