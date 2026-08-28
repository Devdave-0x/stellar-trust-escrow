/** @jest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import NotificationBell from '../../../components/layout/NotificationBell';

const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
let mockNotificationsState = [
  { id: '1', type: 'escrow_funded', escrowId: 'e1', message: 'Escrow funded', read: false, createdAt: new Date().toISOString() },
  { id: '2', type: 'dispute_raised', escrowId: 'e2', message: 'Dispute raised', read: true, createdAt: new Date().toISOString() },
];

jest.mock('../../../hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: mockNotificationsState,
    unreadCount: mockNotificationsState.filter((n) => !n.read).length,
    markRead: mockMarkRead,
    markAllRead: mockMarkAllRead,
  }),
}));

jest.mock('../../../lib/formatRelativeTime', () => ({
  formatRelativeTime: () => '5 minutes ago',
}));

describe('NotificationBell Integration Test Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationsState = [
      { id: '1', type: 'escrow_funded', escrowId: 'e1', message: 'Escrow funded', read: false, createdAt: new Date().toISOString() },
      { id: '2', type: 'dispute_raised', escrowId: 'e2', message: 'Dispute raised', read: true, createdAt: new Date().toISOString() },
    ];
  });

  it('renders the bell button with correct unread badge count', () => {
    render(<NotificationBell />);
    
    const bellButton = screen.getByTestId('notification-bell-button');
    expect(bellButton).toBeInTheDocument();
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1');
  });

  it('opens panel on bell click and displays notifications', () => {
    render(<NotificationBell />);
    const bellButton = screen.getByTestId('notification-bell-button');
    
    // Closed initially
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(bellButton);

    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('Escrow funded')).toBeInTheDocument();
    expect(screen.getByText('Dispute raised')).toBeInTheDocument();
  });

  it('handles full mark single item read flow', () => {
    render(<NotificationBell />);
    const bellButton = screen.getByTestId('notification-bell-button');
    fireEvent.click(bellButton);

    const unreadItem = screen.getByText('Escrow funded');
    fireEvent.click(unreadItem);

    expect(mockMarkRead).toHaveBeenCalledWith('1');
    // Panel closes after clicking item
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('handles full mark all read flow', () => {
    render(<NotificationBell />);
    const bellButton = screen.getByTestId('notification-bell-button');
    fireEvent.click(bellButton);

    const markAllBtn = screen.getByText('Mark all read');
    fireEvent.click(markAllBtn);

    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('closes panel when Escape key is pressed', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByTestId('notification-bell-button'));
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });
});
