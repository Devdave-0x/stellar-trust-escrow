import { render, screen } from '@testing-library/react';
import HighlightText from '../../../components/ui/HighlightText';

describe('HighlightText', () => {
  it('renders plain text when no highlight term is provided', () => {
    render(<HighlightText text="Hello world" highlight="" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders plain text when highlight is only whitespace', () => {
    render(<HighlightText text="Hello world" highlight="   " />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('wraps a single match in a <mark> element', () => {
    const { container } = render(<HighlightText text="Hello world" highlight="world" />);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('world');
  });

  it('highlights all occurrences, not just the first', () => {
    const { container } = render(
      <HighlightText text="foo bar foo baz foo" highlight="foo" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(3);
  });

  it('is case-insensitive', () => {
    const { container } = render(
      <HighlightText text="Hello HELLO hello" highlight="hello" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(3);
  });

  it('preserves original casing in the highlighted text', () => {
    const { container } = render(
      <HighlightText text="Hello HELLO hello" highlight="hello" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks[0].textContent).toBe('Hello');
    expect(marks[1].textContent).toBe('HELLO');
    expect(marks[2].textContent).toBe('hello');
  });

  it('escapes regex special characters in the highlight term', () => {
    // If "." is not escaped it would match any character; we check it only matches literal "."
    const { container } = render(
      <HighlightText text="1.0 and 1x0" highlight="1.0" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('1.0');
  });

  it('escapes other special regex chars like ( ) * + ?', () => {
    const { container } = render(
      <HighlightText text="price(usd) * 100" highlight="price(usd)" />,
    );
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('price(usd)');
  });

  it('renders empty text without error', () => {
    const { container } = render(<HighlightText text="" highlight="foo" />);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('does not highlight when the term is not found in text', () => {
    const { container } = render(
      <HighlightText text="Hello world" highlight="xyz" />,
    );
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });
});
