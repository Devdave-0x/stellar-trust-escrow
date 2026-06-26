import { render } from '@testing-library/react';
import {
  NoEscrowsIllustration,
  NoDisputesIllustration,
  NoNotificationsIllustration,
  SearchNoResultsIllustration,
} from '../../../components/ui/EmptyStateIllustrations';

describe('EmptyStateIllustrations', () => {
  describe('NoEscrowsIllustration', () => {
    it('renders SVG element', () => {
      const { container } = render(<NoEscrowsIllustration />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<NoEscrowsIllustration className="custom-class" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('custom-class');
    });

    it('has aria-hidden attribute', () => {
      const { container } = render(<NoEscrowsIllustration />);
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('NoDisputesIllustration', () => {
    it('renders SVG element', () => {
      const { container } = render(<NoDisputesIllustration />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('contains scales SVG shapes', () => {
      const { container } = render(<NoDisputesIllustration />);
      const rects = container.querySelectorAll('rect');
      expect(rects.length).toBeGreaterThan(0);
    });
  });

  describe('NoNotificationsIllustration', () => {
    it('renders SVG element', () => {
      const { container } = render(<NoNotificationsIllustration />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('contains bell SVG path', () => {
      const { container } = render(<NoNotificationsIllustration />);
      const paths = container.querySelectorAll('path');
      expect(paths.length).toBeGreaterThan(0);
    });
  });

  describe('SearchNoResultsIllustration', () => {
    it('renders SVG element', () => {
      const { container } = render(<SearchNoResultsIllustration />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('contains search icon elements', () => {
      const { container } = render(<SearchNoResultsIllustration />);
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
    });
  });
});
