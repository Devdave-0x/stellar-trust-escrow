import { render, screen, fireEvent } from '@testing-library/react';
import LoadingOverlay from '../../../components/ui/LoadingOverlay';

describe('LoadingOverlay', () => {
  describe('when isLoading is true', () => {
    it('renders the overlay with dialog role', () => {
      render(<LoadingOverlay isLoading={true} />);
      expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-label "Loading"', () => {
      render(<LoadingOverlay isLoading={true} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Loading');
    });

    it('has aria-modal attribute', () => {
      render(<LoadingOverlay isLoading={true} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('renders the spinner', () => {
      render(<LoadingOverlay isLoading={true} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('renders optional message text', () => {
      render(<LoadingOverlay isLoading={true} message="Please wait while we process your request" />);
      expect(screen.getByText('Please wait while we process your request')).toBeInTheDocument();
    });

    it('does not render message when not provided', () => {
      const { container } = render(<LoadingOverlay isLoading={true} />);
      // Only the sr-only spinner label should be present, no visible message
      const messages = container.querySelectorAll('p');
      const visibleMessages = Array.from(messages).filter(
        (el) => !el.classList.contains('sr-only'),
      );
      expect(visibleMessages.length).toBe(0);
    });

    it('renders progress bar when progress is provided', () => {
      render(<LoadingOverlay isLoading={true} progress={45} />);
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45');
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('does not render progress bar when progress is not provided', () => {
      render(<LoadingOverlay isLoading={true} />);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('prevents body scroll when open', () => {
      render(<LoadingOverlay isLoading={true} />);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('traps focus inside the overlay', () => {
      render(<LoadingOverlay isLoading={true} />);
      const overlay = screen.getByTestId('loading-overlay');

      // The overlay itself receives focus on mount
      expect(overlay).toHaveFocus();
    });

    it('restores body scroll when unmounted while open', () => {
      const { unmount } = render(<LoadingOverlay isLoading={true} />);
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('when isLoading is false', () => {
    it('does not render the overlay', () => {
      render(<LoadingOverlay isLoading={false} />);
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not prevent body scroll', () => {
      render(<LoadingOverlay isLoading={false} />);
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('accessibility', () => {
    it('has proper dialog ARIA attributes', () => {
      render(<LoadingOverlay isLoading={true} message="Processing..." />);
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-label', 'Loading');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
    });

    it('spinner has role="status"', () => {
      render(<LoadingOverlay isLoading={true} />);
      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });
});
