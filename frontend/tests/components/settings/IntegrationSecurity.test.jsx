import { render, screen } from '@testing-library/react';
import { isStaleKey, ScopeChips } from '../../../components/settings/IntegrationSecurity';

describe('integration security controls', () => {
  it('flags keys that have not been used within the review window', () => {
    const now = Date.parse('2026-09-01T00:00:00Z');
    expect(isStaleKey({ createdAt: '2026-01-01T00:00:00Z' }, now)).toBe(true);
    expect(isStaleKey({ createdAt: '2026-08-20T00:00:00Z' }, now)).toBe(false);
  });

  it('renders readable scope chips', () => {
    render(<ScopeChips scopes={['read:escrows', 'write:webhooks']} />);
    expect(screen.getByText('read:escrows')).toBeInTheDocument();
    expect(screen.getByText('write:webhooks')).toBeInTheDocument();
  });
});
