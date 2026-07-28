import { render, screen } from '@testing-library/react';
import SkipToContent from '../../../components/layout/SkipToContent';

describe('SkipToContent', () => {
  it('renders a link pointing at the main content region', () => {
    render(<SkipToContent />);
    const link = screen.getByRole('link', { name: /skip to main content/i });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('supports a custom target id', () => {
    render(<SkipToContent targetId="custom-region" />);
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveAttribute(
      'href',
      '#custom-region',
    );
  });

  it('is visually hidden until focused', () => {
    render(<SkipToContent />);
    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveClass('sr-only');
  });
});
