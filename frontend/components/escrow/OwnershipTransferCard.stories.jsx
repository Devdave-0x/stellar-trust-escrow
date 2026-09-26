import OwnershipTransferCard from './OwnershipTransferCard';

const baseTransfer = {
  escrowTitle: 'Website rebuild escrow',
  role: 'client',
  fromAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  toAddress: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBXJ',
  requestedAt: 'Sep 23, 2026',
  expiresAt: 'Sep 30, 2026',
  direction: 'incoming',
};

export default {
  title: 'Escrow/OwnershipTransferCard',
  component: OwnershipTransferCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    onAccept: { action: 'accepted' },
    onReject: { action: 'rejected' },
    onCancel: { action: 'cancelled' },
  },
};

export const Pending = {
  args: {
    transfer: { ...baseTransfer, status: 'pending' },
  },
};

export const Accepted = {
  args: {
    transfer: { ...baseTransfer, status: 'accepted' },
  },
};

export const Rejected = {
  args: {
    transfer: { ...baseTransfer, status: 'rejected' },
  },
};

export const Expired = {
  args: {
    transfer: { ...baseTransfer, status: 'expired' },
  },
};

export const Cancelled = {
  args: {
    transfer: { ...baseTransfer, status: 'cancelled' },
  },
};

export const OutgoingPending = {
  args: {
    transfer: { ...baseTransfer, status: 'pending', direction: 'outgoing' },
  },
};

export const Empty = {
  args: {
    transfer: null,
  },
};

export const ErrorState = {
  args: {
    transfer: { ...baseTransfer, status: 'pending' },
    error: 'Unable to accept this transfer. Refresh and try again.',
  },
};

export const MobileWidth = {
  args: {
    transfer: { ...baseTransfer, status: 'pending' },
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
};
