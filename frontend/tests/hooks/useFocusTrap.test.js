import { render, fireEvent } from '@testing-library/react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

function TrapHarness({ active }) {
  const ref = useFocusTrap(active);
  return (
    <div>
      <button data-testid="outside">Outside</button>
      <div ref={ref} tabIndex={-1} data-testid="trap">
        <button data-testid="first">First</button>
        <button data-testid="second">Second</button>
        <button data-testid="last">Last</button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('moves focus into the container when activated', () => {
    const { getByTestId } = render(<TrapHarness active={true} />);
    expect(getByTestId('first')).toHaveFocus();
  });

  it('does not move focus when inactive', () => {
    const { getByTestId } = render(<TrapHarness active={false} />);
    expect(getByTestId('first')).not.toHaveFocus();
  });

  it('wraps Tab from the last element back to the first', () => {
    const { getByTestId } = render(<TrapHarness active={true} />);
    getByTestId('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(getByTestId('first')).toHaveFocus();
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    const { getByTestId } = render(<TrapHarness active={true} />);
    getByTestId('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(getByTestId('last')).toHaveFocus();
  });

  it('restores focus to the previously focused element on deactivation', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(outside).toHaveFocus();

    const { rerender } = render(<TrapHarness active={true} />);
    rerender(<TrapHarness active={false} />);

    expect(outside).toHaveFocus();
    document.body.removeChild(outside);
  });
});
