import { render, screen, waitFor } from '@testing-library/react';
import EscrowConversationList from '../../../components/chat/EscrowConversationList';

jest.mock('next/link', () => ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>);

describe('EscrowConversationList', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ byEscrow: { '42': 3 } }) });
  });

  it('shows user-specific unread counts', async () => {
    render(<EscrowConversationList address="GUSER" escrows={[{ id: 42, title: 'Design escrow' }]} />);
    expect(screen.getByText('Design escrow')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('3 unread messages')).toBeInTheDocument());
  });
});
