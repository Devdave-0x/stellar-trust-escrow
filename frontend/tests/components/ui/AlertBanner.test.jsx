import { render, screen, fireEvent, act } from '@testing-library/react';
import AlertBanner from '../../../components/ui/AlertBanner';

// Mock the animation API so we can control animation end
beforeAll(() => {
  // Trigger animationend immediately for testing
  HTMLDivElement.prototype.animate = undefined;
});

describe('AlertBanner', () => {
  describe('rendering variants', () => {
    it('renders success variant with correct ARIA role', () => {
      render(<AlertBanner variant="success" title="Operation completed" />);
      const banner = screen.getByRole('status');
      expect(banner).toBeInTheDocument();
      expect(screen.getByText('Operation completed')).toBeInTheDocument();
    });

    it('renders error variant with alert role', () => {
      render(<AlertBanner variant="error" title="Something went wrong" />);
      const banner = screen.getByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders warning variant with alert role', () => {
      render(<AlertBanner variant="warning" title="Proceed with caution" />);
      const banner = screen.getByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(screen.getByText('Proceed with caution')).toBeInTheDocument();
    });

    it('renders info variant with status role', () => {
      render(<AlertBanner variant="info" title="Here is some information" />);
      const banner = screen.getByRole('status');
      expect(banner).toBeInTheDocument();
      expect(screen.getByText('Here is some information')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
      render(
        <AlertBanner
          variant="info"
          title="Update available"
          description="A new version is ready to install."
        />,
      );
      expect(screen.getByText('A new version is ready to install.')).toBeInTheDocument();
    });

    it('does not render description paragraph when not provided', () => {
      const { container } = render(<AlertBanner variant="info" title="Just a title" />);
      const paragraphs = container.querySelectorAll('p');
      expect(paragraphs.length).toBe(0);
    });
  });

  describe('dismiss behaviour', () => {
    it('shows dismiss button when onDismiss is provided', () => {
      render(<AlertBanner variant="success" title="Done" onDismiss={jest.fn()} />);
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('hides dismiss button when onDismiss is omitted', () => {
      render(<AlertBanner variant="success" title="Persistent banner" />);
      expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
    });

    it('calls onDismiss after animation when dismiss button is clicked', () => {
      const onDismiss = jest.fn();
      render(<AlertBanner variant="info" title="Dismiss me" onDismiss={onDismiss} />);

      const dismissBtn = screen.getByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissBtn);

      // The component sets isExiting=true and triggers the exit animation.
      // Simulate animationend event.
      const banner = screen.getByRole('status');
      fireEvent.animationEnd(banner);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('does not call onDismiss if no animation end and no dismiss click', () => {
      const onDismiss = jest.fn();
      render(<AlertBanner variant="info" title="Stay put" onDismiss={onDismiss} />);
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe('ARIA and accessibility', () => {
    it('uses assertive aria-live for error variant', () => {
      render(<AlertBanner variant="error" title="Critical error" />);
      const banner = screen.getByRole('alert');
      expect(banner).toHaveAttribute('aria-live', 'assertive');
    });

    it('uses assertive aria-live for warning variant', () => {
      render(<AlertBanner variant="warning" title="Warning" />);
      const banner = screen.getByRole('alert');
      expect(banner).toHaveAttribute('aria-live', 'assertive');
    });

    it('uses polite aria-live for success variant', () => {
      render(<AlertBanner variant="success" title="Success" />);
      const banner = screen.getByRole('status');
      expect(banner).toHaveAttribute('aria-live', 'polite');
    });

    it('uses polite aria-live for info variant', () => {
      render(<AlertBanner variant="info" title="FYI" />);
      const banner = screen.getByRole('status');
      expect(banner).toHaveAttribute('aria-live', 'polite');
    });

    it('renders nothing when variant is missing', () => {
      const { container } = render(<AlertBanner title="No variant" />);
      expect(container.firstChild).toBeNull();
    });

    it('renders nothing when title is missing', () => {
      const { container } = render(<AlertBanner variant="info" />);
      expect(container.firstChild).toBeNull();
    });
  });
});
