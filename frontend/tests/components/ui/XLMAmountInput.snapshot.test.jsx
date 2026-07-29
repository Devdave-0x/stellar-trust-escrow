import { render } from '@testing-library/react';
import XLMAmountInput from '../../../components/ui/XLMAmountInput';

describe('XLMAmountInput snapshots', () => {
  it('renders default props', () => {
    const { container } = render(<XLMAmountInput value="" onChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders a controlled value', () => {
    const { container } = render(<XLMAmountInput value="42.5" onChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the error variant', () => {
    const { container } = render(
      <XLMAmountInput
        value="0"
        onChange={() => {}}
        error="Amount must be greater than zero"
        errorId="amount-error"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('renders the disabled state', () => {
    const { container } = render(<XLMAmountInput value="10" onChange={() => {}} disabled />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
