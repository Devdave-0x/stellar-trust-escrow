import { buildSecurityTimeline, maskIp } from '../api/controllers/securityActivityController.js';

describe('security activity timeline', () => {
  it('merges sources newest first and masks IPs', () => {
    const timeline = buildSecurityTimeline({
      auditRows: [{ action: 'LOGIN', category: 'AUTH', createdAt: '2026-01-02T00:00:00Z', ipAddress: '203.0.113.42' }],
      mfaMethods: [{ type: 'WEBAUTHN', name: 'iPhone', createdAt: '2026-01-03T00:00:00Z' }],
      sessions: [{ createdAt: '2026-01-01T00:00:00Z', ipAddress: '2001:db8:1:2::1', userAgent: 'Firefox', isActive: false }],
    });
    expect(timeline.map((t) => t.type)).toEqual(['PASSKEY_ADDED', 'LOGIN', 'SESSION_STARTED']);
    expect(timeline[1].ip).toBe('203.0.113.x');
    expect(timeline[2].label).toMatch(/ended/);
  });

  it('never exposes fields beyond the whitelist', () => {
    const [item] = buildSecurityTimeline({ mfaMethods: [{ type: 'TOTP', name: 'App', createdAt: '2026-01-01T00:00:00Z', totpSecret: 'SECRET' }] });
    expect(Object.keys(item).sort()).toEqual(['ip', 'label', 'occurredAt', 'type']);
    expect(JSON.stringify(item)).not.toContain('SECRET');
  });

  it('masks IPv4 and IPv6, ignores garbage', () => {
    expect(maskIp('10.1.2.3')).toBe('10.1.2.x');
    expect(maskIp('2001:db8:1:2::1')).toBe('2001:db8:1:…');
    expect(maskIp(null)).toBeNull();
  });
});
