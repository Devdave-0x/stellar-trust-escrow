/** @jest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import NotificationPanel from '../../../components/layout/NotificationPanel';
import {
  cloneNotificationFixtures,
  notificationEventFixtures,
} from '../../../../shared/fixtures/notificationEvents';

jest.mock('../../../lib/formatRelativeTime', () => ({
  formatRelativeTime: () => '2 hours ago',
}));

const mockNotifications = cloneNotificationFixtures();

const defaultProps = {
  notifications: mockNotifications,
  onMarkRead: jest.fn(),
  onMarkAllRead: jest.fn(),
  onClose: jest.fn(),
};

describe('NotificationPanel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders notification messages', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getByText('Escrow funded')).toBeInTheDocument();
    expect(screen.getByText('Dispute raised')).toBeInTheDocument();
    expect(screen.getByText('Ownership transfer requested')).toBeInTheDocument();
    expect(screen.getByText('Protocol maintenance window scheduled')).toBeInTheDocument();
    expect(screen.getByText('Completion certificate ready')).toBeInTheDocument();
  });

  it('renders relative timestamps', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getAllByText('2 hours ago')).toHaveLength(mockNotifications.length);
  });

  it('shows empty state when no notifications', () => {
    render(<NotificationPanel {...defaultProps} notifications={[]} />);
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();
  });

  it('shows "Mark all read" button when unread notifications exist', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getByText('Mark all read')).toBeInTheDocument();
  });

  it('hides "Mark all read" button when all are read', () => {
    const allRead = mockNotifications.map((n) => ({ ...n, read: true }));
    render(<NotificationPanel {...defaultProps} notifications={allRead} />);
    expect(screen.queryByText('Mark all read')).not.toBeInTheDocument();
  });

  it('calls onMarkAllRead when "Mark all read" is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Mark all read'));
    expect(defaultProps.onMarkAllRead).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Close notifications'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onMarkRead and onClose when an unread notification is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Escrow funded'));
    expect(defaultProps.onMarkRead).toHaveBeenCalledWith(notificationEventFixtures.escrow.id);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onMarkRead when an already-read notification is clicked', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.click(screen.getByText('Dispute raised'));
    expect(defaultProps.onMarkRead).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape key is pressed', () => {
    render(<NotificationPanel {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('has accessible dialog role and label', () => {
    render(<NotificationPanel {...defaultProps} />);
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('links each notification to the correct escrow page', () => {
    render(<NotificationPanel {...defaultProps} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/escrow/escrow-1001');
    expect(links[1]).toHaveAttribute('href', '/escrow/escrow-1002');
  });
});
