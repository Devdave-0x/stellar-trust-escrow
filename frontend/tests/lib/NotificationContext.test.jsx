import { render, screen, fireEvent } from '@testing-library/react';
import {
  NotificationProvider,
  useNotifications,
  ESCROW_EVENT_TYPES,
} from '../../../contexts/NotificationContext';

function Harness() {
  const { notifications, unreadCount, addNotification, markAsRead, markAllAsRead, dismiss } =
    useNotifications();

  return (
    <div>
      <output data-testid="unread">{unreadCount}</output>
      <output data-testid="count">{notifications.length}</output>
      <button
        onClick={() =>
          addNotification({
            type: ESCROW_EVENT_TYPES.MILESTONE_APPROVED,
            title: 'Milestone approved',
            message: 'Milestone 2 was approved',
          })
        }
      >
        Add
      </button>
      {notifications.map((n) => (
        <div key={n.id}>
          <span>{n.title}</span>
          <button onClick={() => markAsRead(n.id)}>Read {n.id}</button>
          <button onClick={() => dismiss(n.id)}>Dismiss {n.id}</button>
        </div>
      ))}
      <button onClick={markAllAsRead}>Mark all</button>
    </div>
  );
}

describe('NotificationContext', () => {
  it('throws when used outside the provider', () => {
    const Bad = () => {
      useNotifications();
      return null;
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow('useNotifications must be used within a NotificationProvider');
    spy.mockRestore();
  });

  it('adds a notification as unread and increments counts', () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('unread')).toHaveTextContent('1');
    expect(screen.getByText('Milestone approved')).toBeInTheDocument();
  });

  it('marks a single notification as read and decrements unread count', () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText(/Read notif-/));
    expect(screen.getByTestId('unread')).toHaveTextContent('0');
  });

  it('marks all notifications as read', () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Mark all'));
    expect(screen.getByTestId('unread')).toHaveTextContent('0');
  });

  it('dismisses a notification, removing it from the list', () => {
    render(
      <NotificationProvider>
        <Harness />
      </NotificationProvider>,
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText(/Dismiss notif-/));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });
});
