import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CharCountTextarea from '../../../components/ui/CharCountTextarea';

function ControlledTextarea({ maxLength = 10, initialValue = '' }) {
  const [value, setValue] = useState(initialValue);

  return (
    <CharCountTextarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      maxLength={maxLength}
      placeholder="Write something"
    />
  );
}

describe('CharCountTextarea', () => {
  it('increments the counter as the input changes', () => {
    render(<ControlledTextarea maxLength={20} />);

    const textarea = screen.getByPlaceholderText('Write something');
    expect(screen.getByText('0/20')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'hello' } });

    expect(screen.getByText('5/20')).toBeInTheDocument();
    expect(textarea).toHaveValue('hello');
  });

  it('switches to amber at 80% and red at 100%', () => {
    render(<ControlledTextarea maxLength={10} />);

    const textarea = screen.getByPlaceholderText('Write something');

    fireEvent.change(textarea, { target: { value: 'abcdefgh' } });
    expect(screen.getByText('8/10')).toHaveClass('text-amber-400');

    fireEvent.change(textarea, { target: { value: 'abcdefghij' } });
    expect(screen.getByText('10/10')).toHaveClass('text-red-400');
  });

  it('blocks additional input once the max length is reached', () => {
    render(<ControlledTextarea maxLength={5} />);

    const textarea = screen.getByPlaceholderText('Write something');

    fireEvent.change(textarea, { target: { value: 'abcde' } });
    expect(textarea).toHaveValue('abcde');
    expect(screen.getByText('5/5')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: 'abcdefg' } });
    expect(textarea).toHaveValue('abcde');
    expect(screen.getByText('5/5')).toBeInTheDocument();
  });
});
