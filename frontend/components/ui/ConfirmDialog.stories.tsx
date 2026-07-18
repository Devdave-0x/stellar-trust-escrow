import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within, fn } from '@storybook/test';
import ConfirmDialog from './ConfirmationDialog';

/**
 * `ConfirmDialog` (rendered by `ConfirmationDialog`) is a modal confirmation
 * prompt rendered through a React portal. It supports a dangerous variant with
 * a warning banner and an arbitrary set of detail rows.
 */
const meta: Meta<typeof ConfirmDialog> = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Accessible modal dialog (`role="alertdialog"`) with focus management and Escape-to-cancel handling. Rendered via a portal to `document.body`.',
      },
    },
  },
  argTypes: {
    isOpen: { control: 'boolean', description: 'Whether the dialog is visible' },
    title: { control: 'text', description: 'Dialog heading' },
    description: { control: 'text', description: 'Supporting description text' },
    confirmLabel: { control: 'text', description: 'Label for the confirm button' },
    cancelLabel: { control: 'text', description: 'Label for the cancel button' },
    isDangerous: { control: 'boolean', description: 'Enables the red danger styling' },
    onConfirm: { action: 'confirm' },
    onCancel: { action: 'cancel' },
  },
  args: {
    isOpen: true,
    title: 'Confirm action',
    description: 'Are you sure you want to continue?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    isDangerous: false,
    onConfirm: fn(),
    onCancel: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    title: 'Release milestone funds',
    description: 'This will release 250 XLM to the recipient. Continue?',
    confirmLabel: 'Release funds',
  },
};

export const DangerVariant: Story = {
  args: {
    title: 'Cancel escrow',
    description: 'Cancelling this escrow will return all held funds to the payer.',
    confirmLabel: 'Delete escrow',
    isDangerous: true,
    details: {
      Escrow: 'ESC-10293',
      Amount: '1,200 XLM',
      Recipient: 'GABC…WXYZ',
    },
  },
  play: async ({ canvasElement, args }) => {
    const body = within(document.body);
    const confirmButton = body.getByTestId('confirm-button');
    await userEvent.click(confirmButton);
    await expect(args.onConfirm).toHaveBeenCalled();
  },
};

export const WithLongContent: Story = {
  args: {
    title: 'Review dispute resolution',
    description:
      'The arbitrator has proposed a resolution that splits the escrowed funds between both parties. ' +
      'Please review the full breakdown below before confirming. This action is recorded on-chain and ' +
      'cannot be reversed once the transaction is included in a ledger.',
    confirmLabel: 'Accept resolution',
    cancelLabel: 'Request review',
    details: {
      'Total escrowed': '5,000 XLM',
      'Payer share': '3,250 XLM',
      'Recipient share': '1,750 XLM',
      'Arbitrator fee': '0 XLM',
      'Resolution ref': 'DSP-7781-A',
    },
  },
};
