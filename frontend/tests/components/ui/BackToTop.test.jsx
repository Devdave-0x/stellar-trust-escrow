import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BackToTop from '../../../components/ui/BackToTop';

describe('BackToTop Component', () => {
  beforeEach(() => {
    // Reset scroll position
    window.scrollY = 0;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders button with correct aria-label', () => {
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: /back to top/i });
    expect(button).toBeInTheDocument();
  });

  it('button is hidden initially (opacity-0)', () => {
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: /back to top/i });
    expect(button).toHaveClass('opacity-0');
  });

  it('button becomes visible when scrolled past 300px', () => {
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: /back to top/i });

    // Simulate scroll event
    Object.defineProperty(window, 'scrollY', { value: 350, writable: true });
    fireEvent.scroll(window, { target: { scrollY: 350 } });

    expect(button).toHaveClass('opacity-100');
    expect(button).not.toHaveClass('pointer-events-none');
  });

  it('button remains hidden when scrolled less than 300px', () => {
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: /back to top/i });

    Object.defineProperty(window, 'scrollY', { value: 250, writable: true });
    fireEvent.scroll(window, { target: { scrollY: 250 } });

    expect(button).toHaveClass('opacity-0');
    expect(button).toHaveClass('pointer-events-none');
  });

  it('calls window.scrollTo with smooth behavior on click', () => {
    const scrollToMock = jest.spyOn(window, 'scrollTo');
    render(<BackToTop />);

    // Make button visible first
    Object.defineProperty(window, 'scrollY', { value: 350, writable: true });
    fireEvent.scroll(window, { target: { scrollY: 350 } });

    const button = screen.getByRole('button', { name: /back to top/i });
    fireEvent.click(button);

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    scrollToMock.mockRestore();
  });

  it('SVG has aria-hidden attribute', () => {
    render(<BackToTop />);
    const svg = screen.getByRole('button', { name: /back to top/i }).querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('scroll event listener is passive', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    render(<BackToTop />);

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      { passive: true },
    );
    addEventListenerSpy.mockRestore();
  });

  it('removes scroll event listener on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    const { unmount } = render(<BackToTop />);

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });

  it('button has fixed positioning and correct z-index', () => {
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: /back to top/i });

    expect(button).toHaveClass('fixed', 'bottom-6', 'right-6', 'z-50');
  });

  it('button has proper focus styling', () => {
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: /back to top/i });

    expect(button).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-indigo-500');
  });

  it('button transitions opacity when visibility changes', () => {
    render(<BackToTop />);
    const button = screen.getByRole('button', { name: /back to top/i });

    expect(button).toHaveClass('transition-opacity', 'duration-300');
  });
});
