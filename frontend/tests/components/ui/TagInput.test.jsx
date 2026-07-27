import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagInput from '../../../components/ui/TagInput';

describe('TagInput', () => {
  it('renders an input field', () => {
    render(<TagInput />);
    expect(screen.getByRole('list', { name: 'Tag input' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('adds a tag on Enter', async () => {
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'hello{Enter}');

    expect(onChange).toHaveBeenCalledWith(['hello']);
  });

  it('adds a tag on comma', async () => {
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'hello,');

    expect(onChange).toHaveBeenCalledWith(['hello']);
  });

  it('adds multiple tags via comma-separated input', async () => {
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'alpha,beta,gamma,');

    expect(onChange).toHaveBeenCalledWith(['alpha']);
    expect(onChange).toHaveBeenCalledWith(['alpha', 'beta']);
    expect(onChange).toHaveBeenCalledWith(['alpha', 'beta', 'gamma']);
  });

  it('clears input after adding a tag', async () => {
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'hello{Enter}');

    expect(input).toHaveValue('');
  });

  it('does not add empty tags', async () => {
    const onChange = jest.fn();
    render(<TagInput onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Enter}');

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not add duplicate tags', async () => {
    const onChange = jest.fn();
    render(<TagInput defaultValue={['hello']} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'hello{Enter}');

    // Should not be called because 'hello' is already present
    // The last call was from the initial defaultValue
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes tag when × is clicked', async () => {
    const onChange = jest.fn();
    render(<TagInput defaultValue={['alpha', 'beta']} onChange={onChange} />);

    const removeBtn = screen.getByRole('button', { name: 'Remove alpha' });
    await userEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith(['beta']);
  });

  it('removes last tag on Backspace when input is empty', async () => {
    const onChange = jest.fn();
    render(<TagInput defaultValue={['alpha', 'beta']} onChange={onChange} />);

    // Backspace on empty input
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '{Backspace}');

    expect(onChange).toHaveBeenCalledWith(['alpha']);
  });

  it('does not remove on Backspace when input has value', async () => {
    const onChange = jest.fn();
    render(<TagInput defaultValue={['alpha']} onChange={onChange} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'typing{Backspace}');

    // Should not remove the tag since input has text
    expect(onChange).not.toHaveBeenCalled();
  });

  it('enforces maxTags limit', async () => {
    const onChange = jest.fn();
    render(<TagInput maxTags={2} defaultValue={['a', 'b']} onChange={onChange} />);

    // Input should be disabled
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();

    // Message should be visible
    expect(screen.getByRole('alert')).toHaveTextContent('Maximum of 2 tags reached.');
  });

  it('shows hint when maxTags reached', () => {
    render(<TagInput maxTags={3} defaultValue={['a', 'b', 'c']} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Maximum of 3 tags reached.');
  });

  it('works in controlled mode', () => {
    const onChange = jest.fn();
    const { rerender } = render(<TagInput value={['x']} onChange={onChange} />);

    // Click × to remove
    const removeBtn = screen.getByRole('button', { name: 'Remove x' });
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith([]);

    // Rerender with controlled value unchanged — chip should still show
    rerender(<TagInput value={['x']} onChange={onChange} />);
    expect(screen.getByText('x')).toBeInTheDocument();
  });

  it('renders placeholder when empty', () => {
    render(<TagInput placeholder="Add items…" />);
    expect(screen.getByPlaceholderText('Add items…')).toBeInTheDocument();
  });
});
