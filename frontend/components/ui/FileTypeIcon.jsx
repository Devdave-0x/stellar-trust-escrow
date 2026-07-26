'use client';

/**
 * FileTypeIcon Component
 *
 * Renders an appropriate inline SVG icon based on a MIME type or filename.
 * Falls back to extension detection if the MIME type is unknown.
 *
 * @param {object}   props
 * @param {string}   [props.mimeType]    — e.g. 'application/pdf', 'image/png'
 * @param {string}   [props.filename]    — e.g. 'report.pdf', 'photo.jpg'
 * @param {'sm'|'md'|'lg'} [props.size='md'] — icon size: sm=16, md=24, lg=32
 */

import { cn } from '../../lib/utils';

const SIZE_MAP = {
  sm: 16,
  md: 24,
  lg: 32,
};

/**
 * Derive the file category from a MIME type or filename extension.
 * Returns a category string used to pick the icon and colour.
 */
function deriveCategory(mimeType, filename) {
  // 1. Try MIME type first
  if (mimeType) {
    const type = mimeType.toLowerCase();
    if (type === 'application/pdf') return 'pdf';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (
      type === 'application/zip' ||
      type === 'application/x-zip-compressed' ||
      type === 'application/gzip' ||
      type === 'application/x-tar' ||
      type === 'application/x-7z-compressed' ||
      type === 'application/x-rar-compressed'
    )
      return 'archive';
    if (
      type === 'application/msword' ||
      type ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
      return 'word';
    if (
      type === 'application/vnd.ms-excel' ||
      type ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      type === 'text/csv'
    )
      return 'spreadsheet';
  }

  // 2. Fall back to file extension
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext) return 'unknown';

    switch (ext) {
      case 'pdf':
        return 'pdf';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
      case 'svg':
      case 'bmp':
      case 'ico':
      case 'tiff':
        return 'image';
      case 'mp4':
      case 'mov':
      case 'avi':
      case 'mkv':
      case 'webm':
      case 'wmv':
        return 'video';
      case 'zip':
      case 'gz':
      case 'tar':
      case '7z':
      case 'rar':
        return 'archive';
      case 'doc':
      case 'docx':
        return 'word';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return 'spreadsheet';
      default:
        return 'unknown';
    }
  }

  return 'unknown';
}

// Inline SVG icons
function PdfIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6M9 13h3m-3 3h6"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x={3}
        y={3}
        width={18}
        height={18}
        rx={2}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={8.5} cy={8.5} r={1.5} fill="currentColor" />
      <path
        d="M21 15l-5-5L5 21"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x={2}
        y={4}
        width={14}
        height={16}
        rx={2}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 10l6-3.5v11L16 14"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArchiveIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M21 8v13a2 2 0 01-2 2H5a2 2 0 01-2-2V8"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 8h18l-2-5H5L3 8z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 12h4"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function WordIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6M8 13h.01M8 16h5"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpreadsheetIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x={3}
        y={3}
        width={18}
        height={18}
        rx={2}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 9h18M3 15h18M9 3v18M15 3v18"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

function UnknownIcon({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 11v.01" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <path d="M12 14.5a1.5 1.5 0 00.5-2.9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

const CATEGORY_CONFIG = {
  pdf: { Icon: PdfIcon, className: 'text-red-400', label: 'PDF' },
  image: { Icon: ImageIcon, className: 'text-green-400', label: 'Image' },
  video: { Icon: VideoIcon, className: 'text-purple-400', label: 'Video' },
  archive: { Icon: ArchiveIcon, className: 'text-amber-400', label: 'Archive' },
  word: { Icon: WordIcon, className: 'text-blue-400', label: 'Word Document' },
  spreadsheet: { Icon: SpreadsheetIcon, className: 'text-green-400', label: 'Spreadsheet' },
  unknown: { Icon: UnknownIcon, className: 'text-gray-400', label: 'Unknown file type' },
};

export default function FileTypeIcon({ mimeType, filename, size = 'md' }) {
  const category = deriveCategory(mimeType, filename);
  const { Icon, className, label } = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.unknown;
  const px = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <span
      className={cn('inline-flex items-center justify-center flex-shrink-0', className)}
      role="img"
      aria-label={label}
      data-testid="file-type-icon"
      data-category={category}
    >
      <Icon size={px} />
    </span>
  );
}
