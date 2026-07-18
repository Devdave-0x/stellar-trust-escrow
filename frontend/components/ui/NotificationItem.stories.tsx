import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import NotificationItem, { type NotificationData } from './NotificationItem';

const base: NotificationData = {
  id: 'n1',
  title: 'Milestone approved',
  body: 'Milestone 2 of ESC-10293 was approved and funds released.',
  timestamp: '10m ago',
  read: false,
};

const meta: Meta<typeof NotificationItem> = {
  title: 'UI/NotificationItem',
  component: NotificationItem,
  tags: ['autodocs'],
  parameters: {
    docs: { description: { component: 'A single notification row used in notification panels.' } },
  },
  args: {
    notification: base,
    onOpen: fn(),
    onMarkRead: fn(),
  },
  decorators: [
    (Story) => (
      <ul className="mx-auto max-w-md space-y-2">
        <Story />
      </ul>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NotificationItem>;

export const Unread: Story = { args: { notification: { ...base, read: false } } };

export const Read: Story = { args: { notification: { ...base, read: true } } };

export const WithEscrowLink: Story = {
  args: {
    notification: {
      ...base,
      title: 'Dispute opened',
      body: 'A dispute was opened against your escrow.',
      escrowId: 'ESC-10293',
    },
  },
};
