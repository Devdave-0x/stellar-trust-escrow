import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../../../components/ui/Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <Modal isOpen={false} onClose={jest.fn()} title="Test">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders content when isOpen is true', () => {
    render(
      <Modal isOpen={true} onClose={jest.fn()} title="My Modal">
        <p>Hello</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(
      <Modal isOpen={true} onClose={jest.fn()} title="My Modal">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByText('My Modal')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    // Click the backdrop (absolute positioned div)
    const backdrop = container.querySelector('.absolute.inset-0');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on non-Escape key', () => {
    const onClose = jest.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="Test">
        <p>Content</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies size classes', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={jest.fn()} size="lg">
        <p>Content</p>
      </Modal>,
    );
    expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();
  });

  it('has aria-modal attribute', () => {
    render(
      <Modal isOpen={true} onClose={jest.fn()} title="Test">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  describe('Confirmation Modal', () => {
    it('does not show confirmation buttons when isConfirmation is false', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <p>Content</p>
        </Modal>,
      );
      expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    });

    it('shows confirmation buttons when isConfirmation is true', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} isConfirmation={true}>
          <p>Content</p>
        </Modal>,
      );
      expect(screen.getByText('Confirm')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('calls onClose when cancel button is clicked', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} isConfirmation={true}>
          <p>Content</p>
        </Modal>,
      );
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onConfirm when confirm button is clicked', () => {
      const onConfirm = jest.fn();
      render(
        <Modal isOpen={true} onClose={jest.fn()} isConfirmation={true} onConfirm={onConfirm}>
          <p>Content</p>
        </Modal>,
      );
      fireEvent.click(screen.getByText('Confirm'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('uses custom button labels', () => {
      render(
        <Modal
          isOpen={true}
          onClose={jest.fn()}
          isConfirmation={true}
          confirmLabel="Delete"
          cancelLabel="Keep"
        >
          <p>Content</p>
        </Modal>,
      );
      expect(screen.getByText('Delete')).toBeInTheDocument();
      expect(screen.getByText('Keep')).toBeInTheDocument();
    });
  });

  describe('Focus Trap', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('focuses the first focusable element when modal opens', () => {
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <button data-testid="btn1">First</button>
          <button data-testid="btn2">Second</button>
        </Modal>,
      );
      // rAF callback fires synchronously with fake timers
      jest.runAllTimers();
      // Close button appears first in DOM, so it gets focus first
      expect(screen.getByLabelText('Close modal')).toHaveFocus();
    });

    it('cycles focus forward with Tab', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <button data-testid="btn-a">A</button>
          <button data-testid="btn-b">B</button>
        </Modal>,
      );

      jest.runAllTimers();

      const closeBtn = screen.getByLabelText('Close modal');
      const btnA = screen.getByTestId('btn-a');
      const btnB = screen.getByTestId('btn-b');

      // Close button should be focused first
      expect(closeBtn).toHaveFocus();

      await user.tab();
      expect(btnA).toHaveFocus();

      await user.tab();
      expect(btnB).toHaveFocus();

      await user.tab();
      // Should wrap back to close button (first focusable)
      expect(closeBtn).toHaveFocus();
    });

    it('cycles focus in reverse with Shift+Tab', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <Modal isOpen={true} onClose={jest.fn()} title="Test">
          <button data-testid="btn-x">X</button>
          <button data-testid="btn-y">Y</button>
        </Modal>,
      );

      jest.runAllTimers();

      const closeBtn = screen.getByLabelText('Close modal');
      const btnX = screen.getByTestId('btn-x');
      const btnY = screen.getByTestId('btn-y');

      // Close button focused first; Shift+Tab from close wraps to last element
      expect(closeBtn).toHaveFocus();
      await user.tab({ shift: true });
      // Should wrap to last focusable (btn-y)
      expect(btnY).toHaveFocus();
    });

    it('returns focus to the triggering element on close', () => {
      // Create a trigger button in the DOM
      const trigger = document.createElement('button');
      trigger.setAttribute('data-testid', 'trigger');
      document.body.appendChild(trigger);
      trigger.focus();
      expect(trigger).toHaveFocus();

      const onClose = jest.fn();
      const { rerender } = render(
        <Modal isOpen={true} onClose={onClose} title="Test">
          <button>Inside</button>
        </Modal>,
      );

      // Close the modal
      rerender(
        <Modal isOpen={false} onClose={onClose} title="Test">
          <button>Inside</button>
        </Modal>,
      );

      // Focus should return to trigger after setTimeout(0)
      jest.runAllTimers();
      expect(trigger).toHaveFocus();

      document.body.removeChild(trigger);
    });

    it('closes on Escape key', () => {
      const onClose = jest.fn();
      render(
        <Modal isOpen={true} onClose={onClose} title="Test">
          <button>Inside</button>
        </Modal>,
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
