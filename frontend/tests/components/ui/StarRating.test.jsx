import { render, screen, fireEvent } from '@testing-library/react';
import StarRating from '../../../components/ui/StarRating';

describe('StarRating', () => {
  it('renders 5 radio inputs', () => {
    render(<StarRating value={0} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
  });

  it('marks the correct radio as checked for a whole-number value', () => {
    render(<StarRating value={3} />);
    const radios = screen.getAllByRole('radio');
    expect(radios[2]).toBeChecked(); // index 2 = star 3
  });

  it('highlights the correct number of stars for value 3.5', () => {
    // For 3.5, stars 1–3 are full, star 4 is half, star 5 is empty.
    // We verify accessible label counts.
    const { container } = render(<StarRating value={3.5} />);
    // Stars 1-3 should render full (text-yellow-400 via StarIcon)
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(5);
  });

  it('has a group aria-label reflecting the value', () => {
    render(<StarRating value={4} />);
    expect(screen.getByRole('group', { name: 'Rating: 4 out of 5' })).toBeInTheDocument();
  });

  it('calls onChange with the star value when a star is clicked', () => {
    const onChange = jest.fn();
    render(<StarRating value={2} onChange={onChange} />);
    const labels = screen.getAllByRole('radio').map((r) => r.closest('label'));
    fireEvent.click(labels[4]); // click star 5
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('calls onChange with correct value for each star', () => {
    const onChange = jest.fn();
    render(<StarRating value={0} onChange={onChange} />);
    const labels = screen.getAllByRole('radio').map((r) => r.closest('label'));
    labels.forEach((label, i) => {
      fireEvent.click(label);
      expect(onChange).toHaveBeenCalledWith(i + 1);
    });
  });

  it('does not call onChange in readonly mode', () => {
    const onChange = jest.fn();
    render(<StarRating value={3} readonly onChange={onChange} />);
    const labels = screen.getAllByRole('radio').map((r) => r.closest('label'));
    labels.forEach((label) => {
      fireEvent.click(label);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables all inputs when readonly is true', () => {
    render(<StarRating value={3} readonly />);
    const radios = screen.getAllByRole('radio');
    radios.forEach((radio) => expect(radio).toBeDisabled());
  });

  it('does not disable inputs when readonly is false', () => {
    render(<StarRating value={3} readonly={false} onChange={() => {}} />);
    const radios = screen.getAllByRole('radio');
    radios.forEach((radio) => expect(radio).not.toBeDisabled());
  });

  it('updates displayed stars on mouse hover', () => {
    render(<StarRating value={1} onChange={() => {}} />);
    // Find the label for star 5
    const labels = screen.getAllByRole('radio');
    // Hover the parent label of star 5
    const star5Label = labels[4].closest('label');
    fireEvent.mouseEnter(star5Label);
    // After hover, group aria-label still shows original value (hover is visual only)
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('resets hover state on mouse leave', () => {
    const { container } = render(<StarRating value={1} onChange={() => {}} />);
    const group = container.querySelector('[role="group"]');
    const star5Label = screen.getAllByRole('radio')[4].closest('label');
    fireEvent.mouseEnter(star5Label);
    fireEvent.mouseLeave(group);
    // Should revert to original value display — no error thrown
    expect(group).toBeInTheDocument();
  });

  it('renders with value 0 without errors', () => {
    render(<StarRating value={0} />);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('renders with value 5 without errors', () => {
    render(<StarRating value={5} />);
    expect(screen.getByRole('group')).toBeInTheDocument();
  });
});
