/**
 * formatFileSize — Human-readable file size formatter
 *
 * Formats a byte count into a concise string with appropriate unit (B, KB, MB, GB)
 * using 1 decimal place for values >= 1 KB.
 *
 * @param {number} bytes — File size in bytes (must be >= 0)
 * @returns {string} Formatted string, e.g. "0 B", "1.5 KB", "2.5 MB", "3.2 GB"
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return '0 B';

  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(1)} GB`;
}

/**
 * isOverSizeWarningThreshold — Returns true when a file size exceeds the warning ratio.
 *
 * @param {number} bytes       — File size in bytes
 * @param {number} maxBytes    — Maximum allowed size in bytes
 * @param {number} [ratio=0.8] — Warning threshold ratio (default 80%)
 * @returns {boolean}
 */
export function isOverSizeWarningThreshold(bytes, maxBytes, ratio = 0.8) {
  if (!maxBytes) return false;
  return bytes / maxBytes >= ratio;
}
