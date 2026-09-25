import { render, screen } from '@testing-library/react';
import CertificateRevocationBanner from '../../../components/escrow/CertificateRevocationBanner';

describe('CertificateRevocationBanner', () => {
  it('explains why a revoked certificate cannot be trusted', () => {
    render(<CertificateRevocationBanner certificate={{ revokedAt: '2026-01-01T00:00:00Z', reason: 'Evidence superseded' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('certificate has been revoked');
    expect(screen.getByRole('alert')).toHaveTextContent('Evidence superseded');
  });
});
