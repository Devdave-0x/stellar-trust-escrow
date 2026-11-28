import dns from 'dns/promises';
import { isIP } from 'net';

const PRIVATE_IPV4_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) {
    return true;
  }
  return PRIVATE_IPV4_RANGES.some((re) => re.test(ip));
}

export async function validateWebhookDestination(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'HTTPS required' };
  }
  const host = parsed.hostname;
  if (isIP(host)) {
    return isPrivateIp(host)
      ? { valid: false, reason: 'private network destination' }
      : { valid: true };
  }
  const records = await dns.lookup(host, { all: true });
  if (records.some((r) => isPrivateIp(r.address))) {
    return { valid: false, reason: 'DNS resolves to private network' };
  }
  return { valid: true };
}