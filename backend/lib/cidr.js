/**
 * IPv4 CIDR matching utilities.
 *
 * Used by API key IP allowlisting — keys may be restricted to a set of
 * CIDR ranges (or bare IPs, treated as a /32) so a stolen key can't be
 * used from an unexpected network.
 */

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToInt(ip) {
  const m = IPV4_RE.exec(ip);
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

/** Strips the IPv4-mapped IPv6 prefix Node adds for loopback/IPv4 clients. */
export function normalizeIp(ip) {
  if (typeof ip !== 'string') return ip;
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function isValidIpv4(ip) {
  return typeof ip === 'string' && ipv4ToInt(ip) !== null;
}

/** Validates a single allowlist entry: a bare IPv4 address or an IPv4 CIDR range. */
export function isValidCidr(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const [addr, prefixRaw] = value.split('/');
  if (prefixRaw === undefined) return isValidIpv4(addr);
  if (!isValidIpv4(addr)) return false;
  if (!/^\d{1,2}$/.test(prefixRaw)) return false;
  const prefix = Number(prefixRaw);
  return prefix >= 0 && prefix <= 32;
}

export function isIpInCidr(ip, cidr) {
  const ipInt = ipv4ToInt(normalizeIp(ip));
  if (ipInt === null) return false;

  const [addr, prefixRaw] = cidr.split('/');
  const addrInt = ipv4ToInt(addr);
  if (addrInt === null) return false;

  const prefix = prefixRaw === undefined ? 32 : Number(prefixRaw);
  if (prefix === 0) return true;

  const mask = prefix === 32 ? 0xffffffff : (~(0xffffffff >>> prefix)) >>> 0;
  return (ipInt & mask) === (addrInt & mask);
}

/** Empty/nullish allowlist means "allow all" — the feature's opt-in restriction. */
export function isIpAllowed(ip, allowedCidrs) {
  if (!Array.isArray(allowedCidrs) || allowedCidrs.length === 0) return true;
  return allowedCidrs.some((cidr) => isIpInCidr(ip, cidr));
}
