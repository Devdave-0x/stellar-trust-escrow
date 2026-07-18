import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import Toast from './Toast';
import ToastContainer, { type ToastItem } from './ToastContainer';

const meta: Meta<typeof Toast> = {
  title: 'UI/Toast',
  component: Toast,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Auto-dismissing notification toast with four severity variants. Pair with `ToastContainer` to stack multiple toasts.',
      },
    },
  },
  argTypes: {
    message: { control: 'text', description: 'Body text of the toast' },
    type: {
      control: 'select',
      options: ['success', 'error', 'warning', 'info'],
      description: 'Severity / variant of the toast',
    },
    duration: { control: 'number', description: 'Auto-dismiss duration in ms' },
    onClose: { action: 'close' },
  },
  args: {
    message: 'Funds released successfully',
    type: 'success',
    // Long duration so the story stays visible instead of auto-dismissing.
    duration: 100000,
    onClose: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Success: Story = {
  args: { type: 'success', message: 'Milestone approved and funds released.' },
};

export const Error: Story = {
  args: { type: 'error', message: 'Transaction failed. Please try again.' },
};

export const Warning: Story = {
  args: { type: 'warning', message: 'Your session will expire in 2 minutes.' },
};

export const Info: Story = {
  args: { type: 'info', message: 'A new dispute was opened on escrow ESC-10293.' },
};

export const MultipleToasts: StoryObj<typeof ToastContainer> = {
  render: () => {
    const toasts: ToastItem[] = [
      { id: '1', type: 'success', message: 'Milestone 1 approved.' },
      { id: '2', type: 'info', message: 'New arbitrator assigned.' },
      { id: '3', type: 'warning', message: 'Network fees increased.' },
    ];
    return (
      <div className="relative h-64">
        <ToastContainer toasts={toasts} onClose={() => {}} />
      </div>
    );
  },
  parameters: {
    docs: {
      description: { story: 'Multiple stacked toasts rendered via `ToastContainer`.' },
    },
  },
};
