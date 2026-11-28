import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tooltip from '../../../components/ui/Tooltip';

// ---- existing Tooltip behaviour ----

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

  // ---- shortcut prop behaviour (issue #239) ----

  it('renders a <kbd> element with the shortcut text when shortcut prop is provided', () => {
    render(
      <Tooltip content="Save" shortcut="Ctrl+S" onClick={() => {}}>
        <button>Trigger Save</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Trigger Save').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const kbd = document.querySelector('kbd');
    expect(kbd).not.toBeNull();
    // Should contain the shortcut — either raw or Mac-swapped
    expect(kbd.textContent).toMatch(/ctrl\+s|⌘\+s/i);
  });

  it('does not render a <kbd> element when no shortcut is provided', () => {
    render(
      <Tooltip content="Save">
        <button>Trigger Save No Shortcut</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Trigger Save No Shortcut').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    expect(document.querySelector('kbd')).toBeNull();
  });

  it('fires onClick when the trigger is clicked', () => {
    const onClick = jest.fn();
    render(
      <Tooltip content="Do thing" shortcut="Ctrl+K" onClick={onClick}>
        <button>Action</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Action').closest('[role="button"]');
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick when the registered keyboard shortcut is pressed', () => {
    const onClick = jest.fn();
    render(
      <Tooltip content="Do thing" shortcut="Ctrl+K" onClick={onClick}>
        <button>Action</button>
      </Tooltip>,
    );
    // Simulate keydown on document with Ctrl+K
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick for a non-matching key combination', () => {
    const onClick = jest.fn();
    render(
      <Tooltip content="Do thing" shortcut="Ctrl+K" onClick={onClick}>
        <button>Action</button>
      </Tooltip>,
    );
    fireEvent.keyDown(document, { key: 'j', ctrlKey: true });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('replaces Ctrl with ⌘ on Mac platform', () => {
    // Mock navigator.platform to simulate Mac
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      configurable: true,
    });

    render(
      <Tooltip content="Save" shortcut="Ctrl+S" onClick={() => {}}>
        <button>Trigger Mac Save</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Trigger Mac Save').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const kbd = document.querySelector('kbd');
    expect(kbd).not.toBeNull();
    expect(kbd.textContent).toContain('⌘');

    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  it('keeps Ctrl label on non-Mac platform', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true,
    });

    render(
      <Tooltip content="Save" shortcut="Ctrl+S" onClick={() => {}}>
        <button>Trigger Win Save</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Trigger Win Save').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const kbd = document.querySelector('kbd');
    expect(kbd).not.toBeNull();
    expect(kbd.textContent).toMatch(/ctrl/i);

    Object.defineProperty(navigator, 'platform', {
      value: undefined,
      configurable: true,
    });
  });
});
