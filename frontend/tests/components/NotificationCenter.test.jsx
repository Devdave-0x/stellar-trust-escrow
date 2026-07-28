import { render, screen, fireEvent } from '@testing-library/react';
import NotificationBell from '../../components/notifications/NotificationCenter';
import { NotificationProvider, ESCROW_EVENT_TYPES } from '../../contexts/NotificationContext';

const sample = [
  {
    id: 'n1',
    type: ESCROW_EVENT_TYPES.DISPUTE_OPENED,
    title: 'Dispute opened',
    message: 'Escrow #42 was disputed',
    createdAt: new Date().toISOString(),
    read: false,
  },
  {
    id: 'n2',
    type: ESCROW_EVENT_TYPES.RELEASED,
    title: 'Funds released',
    message: 'Escrow #41 funds released',
    createdAt: new Date().toISOString(),
    read: true,
  },
];

function renderBell(initialNotifications = sample) {
  return render(
    <NotificationProvider initialNotifications={initialNotifications}>
      <NotificationBell />
    </NotificationProvider>,
  );
}

describe('NotificationBell / NotificationCenter', () => {
  it('shows an unread badge count on the trigger button', () => {
    renderBell();
    expect(screen.getByRole('button', { name: /notifications, 1 unread/i })).toBeInTheDocument();
  });

  it('panel is closed by default and opens on click', () => {
    renderBell();
    expect(screen.queryByRole('region', { name: /notification center/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByRole('region', { name: /notification center/i })).toBeInTheDocument();
    expect(screen.getByText('Dispute opened')).toBeInTheDocument();
    expect(screen.getByText('Funds released')).toBeInTheDocument();
  });

  it('closes the panel on Escape and returns focus to the trigger', () => {
    renderBell();
    const trigger = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('region')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('marks a notification as read', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    fireEvent.click(screen.getByText('Mark as read'));
    expect(screen.getByRole('button', { name: /notifications$/i })).toBeInTheDocument();
  });

  it('shows an empty state when there are no notifications', () => {
    renderBell([]);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('dismisses a notification', () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
    const dismissButtons = screen.getAllByText('Dismiss');
    fireEvent.click(dismissButtons[0]);
    expect(screen.queryByText('Dispute opened')).not.toBeInTheDocument();
  });
});
