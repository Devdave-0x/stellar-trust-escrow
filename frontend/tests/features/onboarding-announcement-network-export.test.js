import { normaliseChecklist } from '../../components/dashboard/OnboardingChecklist';
import { validateAnnouncementWindow } from '../../components/admin/AnnouncementPreview';
import { detectNetworkFromRpc, networksMatch } from '../../app/developer/inspector/page';
import { normaliseManifest } from '../../components/settings/ExportManifestViewer';

describe('profile and admin feature helpers', () => {
  test('normalises onboarding statuses and identifies pending steps', () => {
    expect(normaliseChecklist([{ key: 'wallet', title: 'Connect', status: 'completed' }, { id: 'profile', label: 'Profile', status: 'pending' }])).toEqual([
      { id: 'wallet', label: 'Connect', status: 'completed', next: false },
      { id: 'profile', label: 'Profile', status: 'pending', next: false },
    ]);
  });

  test('flags invalid announcement windows', () => {
    expect(validateAnnouncementWindow({ startsAt: '2026-01-02', endsAt: '2026-01-01' })).toContain('End time must be after the start time.');
  });

  test('detects wallet and RPC network mismatches', () => {
    expect(detectNetworkFromRpc('https://horizon-testnet.stellar.org/soroban/rpc')).toBe('testnet');
    expect(networksMatch('mainnet', 'https://horizon-testnet.stellar.org/soroban/rpc')).toBe(false);
    expect(networksMatch('testnet', 'https://horizon-testnet.stellar.org/soroban/rpc')).toBe(true);
  });

  test('gracefully normalises old export manifests', () => {
    expect(normaliseManifest({ format: 'csv', row_count: 4, sha256: 'abc' })).toMatchObject({ format: 'CSV', rowCount: 4, checksum: 'abc' });
    expect(normaliseManifest(null)).toBeNull();
  });
});
