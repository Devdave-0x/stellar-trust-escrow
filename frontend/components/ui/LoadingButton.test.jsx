import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoadingButton from './LoadingButton';

describe('LoadingButton', () => {
  it('is enabled and shows no spinner when not loading', () => {
    render(<LoadingButton isLoading={false}>Submit</LoadingButton>);

    expect(screen.getByRole('button', { name: 'Submit' })).not.toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('disables the button when loading', () => {
    render(<LoadingButton isLoading>Submit</LoadingButton>);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows a spinner when loading', () => {
    render(<LoadingButton isLoading>Submit</LoadingButton>);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('keeps the label in the DOM (hidden, not removed) so width stays stable', () => {
    render(<LoadingButton isLoading>Submit</LoadingButton>);

    const label = screen.getByText('Submit');
    expect(label).toBeInTheDocument();
    expect(label).toHaveClass('invisible');
  });

  it('respects an explicit disabled prop even when not loading', () => {
    render(
      <LoadingButton isLoading={false} disabled>
        Submit
      </LoadingButton>,
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
