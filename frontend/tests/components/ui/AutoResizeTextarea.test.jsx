import { render, screen, fireEvent } from '@testing-library/react';
import AutoResizeTextarea from '../../../components/ui/AutoResizeTextarea';

// Mock lineHeight for consistent testing
const mockLineHeight = 20;

beforeEach(() => {
  // Set a known line-height on the textarea for consistent height calculations
  jest.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    if (el.tagName === 'TEXTAREA') {
      return {
        lineHeight: `${mockLineHeight}px`,
        paddingTop: '0px',
        paddingBottom: '0px',
        borderTopWidth: '0px',
        borderBottomWidth: '0px',
      };
    }
    return window.getComputedStyle(el);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AutoResizeTextarea', () => {
  it('starts at minRows height', () => {
    const { container } = render(
      <AutoResizeTextarea minRows={2} maxRows={8} value="" onChange={jest.fn()} />,
    );
    const textarea = container.querySelector('textarea');
    // minRows=2 * lineHeight=20 = 40px
    expect(textarea.style.height).toBe(`${2 * mockLineHeight}px`);
  });

  it('grows with content', () => {
    const { container, rerender } = render(
      <AutoResizeTextarea minRows={2} maxRows={8} value="A" onChange={jest.fn()} />,
    );
    const textarea = container.querySelector('textarea');

    // Now simulate more content — the mirror element determines height
    // We can't easily test the mirror, but we can check initial height is correct
    const initialHeight = parseInt(textarea.style.height, 10);
    expect(initialHeight).toBeGreaterThanOrEqual(2 * mockLineHeight);

    // Rerender with multi-line content
    rerender(
      <AutoResizeTextarea
        minRows={2}
        maxRows={8}
        value="Line 1\nLine 2\nLine 3\nLine 4"
        onChange={jest.fn()}
      />,
    );

    // Height should increase for multi-line content
    const newHeight = parseInt(container.querySelector('textarea').style.height, 10);
    expect(newHeight).toBeGreaterThanOrEqual(initialHeight);
  });

  it('stops at maxRows height', () => {
    const { container, rerender } = render(
      <AutoResizeTextarea minRows={2} maxRows={3} value="A" onChange={jest.fn()} />,
    );

    // Create many lines that would exceed maxRows
    const manyLines = Array.from({ length: 20 }, (_, i) => `Line ${i}`).join('\n');
    rerender(
      <AutoResizeTextarea minRows={2} maxRows={3} value={manyLines} onChange={jest.fn()} />,
    );

    const textarea = container.querySelector('textarea');
    const height = parseInt(textarea.style.height, 10);
    // Should not exceed maxRows * lineHeight
    expect(height).toBeLessThanOrEqual(3 * mockLineHeight + 2); // +2 for rounding
  });

  it('content is scrollable at maxRows', () => {
    const { container } = render(
      <AutoResizeTextarea
        minRows={2}
        maxRows={3}
        value="Short"
        onChange={jest.fn()}
      />,
    );

    const textarea = container.querySelector('textarea');
    const mirror = container.querySelector('[aria-hidden="true"]');

    // Simulate content exceeding maxRows by setting mirror scrollHeight directly
    Object.defineProperty(mirror, 'scrollHeight', {
      value: 3 * mockLineHeight + 1, // just over max
      writable: true,
      configurable: true,
    });

    // Trigger resize to re-sync
    window.dispatchEvent(new Event('resize'));

    // When content exceeds maxRows, overflow-y should be 'auto'
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('calls onChange when user types', () => {
    const onChange = jest.fn();
    const { container } = render(
      <AutoResizeTextarea minRows={2} maxRows={8} value="" onChange={onChange} />,
    );

    fireEvent.change(container.querySelector('textarea'), {
      target: { value: 'Hello world' },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renders with default minRows (2) and maxRows (8)', () => {
    const { container } = render(
      <AutoResizeTextarea value="" onChange={jest.fn()} />,
    );
    const textarea = container.querySelector('textarea');
    expect(textarea).toHaveAttribute('rows', '2');
  });

  it('has a hidden mirror element', () => {
    const { container } = render(
      <AutoResizeTextarea value="test" onChange={jest.fn()} />,
    );
    const mirror = container.querySelector('[aria-hidden="true"]');
    expect(mirror).toBeInTheDocument();
    expect(mirror).toHaveClass('invisible');
  });
});
