import LoadingButton from './LoadingButton';

/**
 * `LoadingButton` wraps `Button` to add a spinner + disabled state for
 * async actions while keeping the button's width stable.
 */
export default {
  title: 'UI/LoadingButton',
  component: LoadingButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'ghost'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    isLoading: {
      control: 'boolean',
      description: 'Shows a spinner, disables the button, and preserves its width',
    },
  },
  args: {
    children: 'Submit Milestone',
    variant: 'primary',
    size: 'md',
    isLoading: false,
  },
};

export const Idle = {
  args: { isLoading: false },
};

export const Loading = {
  args: { isLoading: true },
};

export const LoadingDanger = {
  args: { isLoading: true, variant: 'danger', children: 'Raise Dispute' },
};

export const SideBySide = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <LoadingButton isLoading={false}>Submit</LoadingButton>
      <LoadingButton isLoading={true}>Submit</LoadingButton>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
