import type { Meta, StoryObj } from '@storybook/react';
import Button from './Button';

/**
 * The `Button` component supports four visual variants, three sizes, a loading
 * state, a disabled state, and can render as a Next.js `Link` when an `href`
 * prop is provided.
 */
const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'ghost'],
      description: 'Visual style of the button',
      table: { defaultValue: { summary: 'primary' } },
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the button',
      table: { defaultValue: { summary: 'md' } },
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the button and prevents interaction',
    },
    isLoading: {
      control: 'boolean',
      description: 'Shows a loading indicator and disables the button',
    },
    href: {
      control: 'text',
      description: 'When provided, renders as a Next.js Link instead of a <button>',
    },
    onClick: { action: 'clicked' },
    children: { control: 'text' },
  },
  args: {
    children: 'Button',
    variant: 'primary',
    size: 'md',
    disabled: false,
    isLoading: false,
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', children: 'Approve Milestone' },
};

export const Secondary: Story = {
  args: { variant: 'secondary', children: 'View Details' },
};

export const Danger: Story = {
  args: { variant: 'danger', children: 'Raise Dispute' },
};

export const Disabled: Story = {
  args: { disabled: true, children: 'Disabled' },
};

export const Loading: Story = {
  args: { isLoading: true, children: 'Submitting…' },
};

export const Ghost: Story = {
  args: { variant: 'ghost', children: 'Cancel' },
};

export const Small: Story = {
  args: { size: 'sm', children: 'Small' },
};

export const Large: Story = {
  args: { size: 'lg', children: 'Large' },
};

export const AsLink: Story = {
  args: { href: '/escrow/create', children: 'Create Escrow' },
  parameters: {
    docs: {
      description: {
        story: 'When `href` is provided the button renders as a Next.js `<Link>`.',
      },
    },
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
  parameters: { controls: { disable: true } },
};
