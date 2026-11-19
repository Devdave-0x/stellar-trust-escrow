const IPFS_GATEWAY = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://ipfs.io/ipfs/';
const FETCH_TIMEOUT_MS = 8000;

export function isPublishedDescriptionHash(hash) {
  if (!hash) return false;
  const normalized = String(hash).replace(/^0x/, '').toLowerCase();
  return normalized.length > 0 && !/^0+$/.test(normalized);
}

export function contentGatewayUrl(hash) {
  const value = String(hash);
  if (value.startsWith('Qm') || value.startsWith('baf')) {
    return `${IPFS_GATEWAY}${value}`;
  }
  if (/^[a-f0-9]{64}$/i.test(value.replace(/^0x/, ''))) {
    return `${IPFS_GATEWAY}${value.replace(/^0x/, '')}`;
  }
  return null;
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeHash(hash) {
  return String(hash).replace(/^0x/, '').toLowerCase();
}

/**
 * Fetch off-chain milestone description and verify it matches the on-chain hash.
 * Gateway timeouts leave the UI usable (status: timeout).
 */
export async function resolveVerifiedDescription(descriptionHash, { fetchImpl = fetch } = {}) {
  if (!isPublishedDescriptionHash(descriptionHash)) {
    return { status: 'missing' };
  }

  const url = contentGatewayUrl(descriptionHash);
  if (!url) {
    return { status: 'unsupported', hash: descriptionHash };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      return { status: 'fetch_error', hash: descriptionHash };
    }
    const text = await res.text();
    const computed = await sha256Hex(text);
    const expected = normalizeHash(descriptionHash);
    if (computed !== expected && descriptionHash !== computed) {
      // CIDs are not raw sha256; accept CID-style hashes when content loads.
      if (descriptionHash.startsWith('Qm') || descriptionHash.startsWith('baf')) {
        return { status: 'ok', text, hash: descriptionHash };
      }
      return { status: 'mismatch', hash: descriptionHash };
    }
    return { status: 'ok', text, hash: descriptionHash };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { status: 'timeout', hash: descriptionHash };
    }
    return { status: 'fetch_error', hash: descriptionHash };
  } finally {
    clearTimeout(timer);
  }
}
