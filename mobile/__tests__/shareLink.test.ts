import { isValidShareToken, parseShareLink } from '../lib/shareLink';

const TOKEN = 'Ab3_xY-9Qw1Er2Ty3Ui4Op5As6Df7Gh8';

describe('share deep links', () => {
  it('accepts well-formed tokens', () => {
    expect(isValidShareToken(TOKEN)).toBe(true);
  });

  it('rejects malformed or hostile tokens', () => {
    for (const bad of ['', 'short', '../../api/admin', 'a b c d e f g h i j', '<script>alert(1)</script>', 'x'.repeat(200), null, 42]) {
      expect(isValidShareToken(bad)).toBe(false);
    }
  });

  it('parses app and web share links', () => {
    expect(parseShareLink(`stellartrustescrow://share/${TOKEN}`)).toBe(TOKEN);
    expect(parseShareLink(`https://app.example.com/share/${TOKEN}?utm=x`)).toBe(TOKEN);
  });

  it('falls back to null for invalid links', () => {
    expect(parseShareLink('stellartrustescrow://share/%E0%A4%A')).toBeNull();
    expect(parseShareLink('stellartrustescrow://share/..%2F..%2Fadmin')).toBeNull();
    expect(parseShareLink('https://evil.example/other/' + TOKEN)).toBeNull();
  });
});
