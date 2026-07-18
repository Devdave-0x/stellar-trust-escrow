import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import EscrowListItem, { type EscrowListItemData, type EscrowStatus } from './EscrowListItem';

const base: Record<EscrowStatus, EscrowListItemData> = {
  active: {
    id: 'ESC-10293',
    title: 'Website redesign milestone 2',
    amount: '1,200',
    counterparty: 'GABC…WXYZ',
    status: 'active',
    updatedAt: '2h ago',
  },
  disputed: {
    id: 'ESC-10214',
    title: 'Mobile app sprint',
    amount: '3,400',
    counterparty: 'GDEF…QRST',
    status: 'disputed',
    updatedAt: '1d ago',
  },
  completed: {
    id: 'ESC-10087',
    title: 'Brand identity package',
    amount: '850',
    counterparty: 'GGHI…UVWX',
    status: 'completed',
    updatedAt: '5d ago',
  },
  cancelled: {
    id: 'ESC-10055',
    title: 'Abandoned onboarding flow',
    amount: '500',
    counterparty: 'GJKL…YZAB',
    status: 'cancelled',
    updatedAt: '12d ago',
  },
};

const meta: Meta<typeof EscrowListItem> = {
  title: 'UI/EscrowListItem',
  component: EscrowListItem,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: 'A single escrow row used inside escrow list views.' } },
  },
  argTypes: {
    onSelect: { action: 'select' },
    onRaiseDispute: { action: 'raise-dispute' },
  },
  args: {
    escrow: base.active,
    onSelect: fn(),
    onRaiseDispute: fn(),
  },
  decorators: [
    (Story) => (
      <ul className="mx-auto max-w-xl space-y-2">
        <Story />
      </ul>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EscrowListItem>;

export const Active: Story = { args: { escrow: base.active } };
export const Disputed: Story = { args: { escrow: base.disputed } };
export const Completed: Story = { args: { escrow: base.completed } };
export const Cancelled: Story = { args: { escrow: base.cancelled } };
