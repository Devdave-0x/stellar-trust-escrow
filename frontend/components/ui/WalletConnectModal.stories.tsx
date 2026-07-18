import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import WalletConnectModal from './WalletConnectModal';
import {
  disconnectedWallet,
  connectingWallet,
  connectedFreighterWallet,
  ledgerStepWallet,
  MockWalletProvider,
} from '../../.storybook/mocks/WalletContextMock';

const meta: Meta<typeof WalletConnectModal> = {
  title: 'UI/WalletConnectModal',
  component: WalletConnectModal,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Modal for connecting a Stellar wallet. Connection status is driven by the shared `WalletContext` mock.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onConnect: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof WalletConnectModal>;

export const Disconnected: Story = {
  decorators: [
    (Story) => (
      <MockWalletProvider state={disconnectedWallet}>
        <Story />
      </MockWalletProvider>
    ),
  ],
};

export const Connecting: Story = {
  decorators: [
    (Story) => (
      <MockWalletProvider state={connectingWallet}>
        <Story />
      </MockWalletProvider>
    ),
  ],
};

export const ConnectedFreighter: Story = {
  decorators: [
    (Story) => (
      <MockWalletProvider state={connectedFreighterWallet}>
        <Story />
      </MockWalletProvider>
    ),
  ],
};

export const LedgerStep: Story = {
  decorators: [
    (Story) => (
      <MockWalletProvider state={ledgerStepWallet}>
        <Story />
      </MockWalletProvider>
    ),
  ],
};
