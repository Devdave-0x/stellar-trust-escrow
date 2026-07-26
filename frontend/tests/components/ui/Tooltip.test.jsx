import { render, screen, fireEvent } from '@testing-library/react';
import Tooltip from '../../../components/ui/Tooltip';

// ---- existing Tooltip behaviour ----

describe('Tooltip', () => {
  it('renders trigger element', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('shows tooltip on mouse enter', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseLeave(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows tooltip on focus', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.focus(trigger);
    expect(screen.getByText('Tooltip text')).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.focus(trigger);
    fireEvent.blur(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies top position by default', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveClass('bottom-full');
  });

  it('applies custom position', () => {
    const { container } = render(
      <Tooltip content="Tooltip text" position="bottom">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveClass('top-full');
  });

  it('has aria-hidden when not visible', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'true');
  });

  it('has aria-hidden false when visible', () => {
    const { container } = render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>,
    );
    const trigger = screen.getByText('Hover me').closest('[role="button"]');
    fireEvent.mouseEnter(trigger);
    const tooltip = container.querySelector('[role="tooltip"]');
    expect(tooltip).toHaveAttribute('aria-hidden', 'false');
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
