import Badge from './Badge';

const VARIANTS = [
  { variant: 'success', label: 'Success' },
  { variant: 'warning', label: 'Warning' },
  { variant: 'error', label: 'Error' },
  { variant: 'info', label: 'Info' },
  { variant: 'neutral', label: 'Neutral' },
];

export default {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'warning', 'error', 'info', 'neutral'],
      description: 'Visual color variant of the badge',
      table: { defaultValue: { summary: 'neutral' } },
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Badge size',
      table: { defaultValue: { summary: 'md' } },
    },
    dot: {
      control: 'boolean',
      description: 'Shows a colored indicator dot before the label',
    },
    children: {
      control: 'text',
      description: 'Badge label',
    },
  },
  args: {
    variant: 'success',
    size: 'md',
    dot: true,
    children: 'Active',
  },
};

export const Default = {};

export const Success = {
  args: { variant: 'success', children: 'Completed' },
};

export const Warning = {
  args: { variant: 'warning', children: 'Pending review' },
};

export const Error = {
  args: { variant: 'error', children: 'Disputed' },
};

export const Info = {
  args: { variant: 'info', children: 'Submitted' },
};

export const Neutral = {
  args: { variant: 'neutral', children: 'Draft' },
};

export const Small = {
  args: { size: 'sm', children: 'Small badge' },
};

export const Medium = {
  args: { size: 'md', children: 'Medium badge' },
};

export const Large = {
  args: { size: 'lg', children: 'Large badge' },
};

export const WithDot = {
  args: { variant: 'info', dot: true, children: 'Syncing' },
};

export const VariantMatrix = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {VARIANTS.map(({ variant, label }) => (
        <Badge key={variant} variant={variant} dot>
          {label}
        </Badge>
      ))}
    </div>
  ),
  parameters: { controls: { disable: true } },
};

export const SizeMatrix = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(['sm', 'md', 'lg']).map((size) => (
        <Badge key={size} variant="success" size={size} dot>
          {size.toUpperCase()}
        </Badge>
      ))}
    </div>
  ),
  parameters: { controls: { disable: true } },
};
