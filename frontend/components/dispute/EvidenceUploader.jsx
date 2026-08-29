'use client';

/**
 * EvidenceUploader
 *
 * Drag-and-drop file upload zone for dispute evidence.
 * Supports PDF, PNG, JPG, TXT files up to 10 MB each.
 * Shows live upload progress, inline previews, and a lightbox viewer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Image,
  Eye,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const ACCEPTED_TYPES = {
  'application/pdf': 'PDF',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'text/plain': 'TXT',
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }) {
  if (type.startsWith('image/')) {
    return (
      <Image
        size={18}
        className="text-indigo-400"
        aria-hidden="true"
      />
    );
  }

  return (
    <FileText
      size={18}
      className="text-gray-400"
      aria-hidden="true"
    />
  );
}

function Lightbox({
  files,
  index,
  onClose,
  onPrev,
  onNext,
}) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  const file = files[index];

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  if (!file) return null;

  const isImage = file.type.startsWith('image/');
  const url = URL.createObjectURL(file.raw);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      onPrev();
      return;
    }

    if (
      event.key === 'ArrowRight' &&
      index < files.length - 1
    ) {
      event.preventDefault();
      onNext();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements =
      dialogRef.current?.querySelectorAll(
        [
          'button:not([disabled])',
          'a[href]',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[tabindex]:not([tabindex="-1"])',
        ].join(','),
      );

    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0];
    const lastElement =
      focusableElements[focusableElements.length - 1];

    if (
      event.shiftKey &&
      document.activeElement === firstElement
    ) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (
      !event.shiftKey &&
      document.activeElement === lastElement
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.name}`}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative max-w-3xl w-full bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm text-white font-medium truncate">
            {file.name}
          </span>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            aria-label="Close preview"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center justify-center min-h-64 p-4 bg-gray-950">
          {isImage ? (
            <img
              src={url}
              alt={file.name}
              className="max-h-[60vh] object-contain rounded-lg"
            />
          ) : (
            <div className="text-center text-gray-400 space-y-2">
              <FileText
                size={48}
                className="mx-auto text-gray-600"
                aria-hidden="true"
              />

              <p className="text-sm">{file.name}</p>

              <p className="text-xs text-gray-600">
                {formatBytes(file.size)}
              </p>

              <a
                href={url}
                download={file.name}
                className="inline-block mt-2 text-indigo-400 hover:text-indigo-300 text-xs underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
              >
                Download to view
              </a>
            </div>
          )}
        </div>

        {files.length > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <button
              type="button"
              onClick={onPrev}
              disabled={index === 0}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              aria-label="Previous file"
            >
              <ChevronLeft
                size={16}
                aria-hidden="true"
              />
              Prev
            </button>

            <span className="text-xs text-gray-600">
              {index + 1} / {files.length}
            </span>

            <button
              type="button"
              onClick={onNext}
              disabled={index === files.length - 1}
              className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
              aria-label="Next file"
            >
              Next
              <ChevronRight
                size={16}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EvidenceUploader({
  onUpload,
  maxFiles = 5,
}) {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] =
    useState(null);

  const inputRef = useRef(null);

  const simulateUpload = useCallback((id) => {
    let progress = 0;

    const interval = setInterval(() => {
      progress += Math.random() * 25 + 10;

      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }

      setFiles((previousFiles) =>
        previousFiles.map((file) =>
          file.id === id
            ? {
                ...file,
                progress: Math.min(progress, 100),
              }
            : file,
        ),
      );
    }, 150);
  }, []);

  const processFiles = useCallback(
    (rawFiles) => {
      const accepted = [];

      for (const raw of rawFiles) {
        if (
          files.length + accepted.length >=
          maxFiles
        ) {
          break;
        }

        let error = null;

        if (!ACCEPTED_TYPES[raw.type]) {
          error = `Unsupported type. Allowed: ${Object.values(
            ACCEPTED_TYPES,
          ).join(', ')}`;
        } else if (raw.size > MAX_SIZE_BYTES) {
          error = `File too large (max ${formatBytes(
            MAX_SIZE_BYTES,
          )})`;
        }

        accepted.push({
          id: `${raw.name}-${Date.now()}-${Math.random()}`,
          name: raw.name,
          size: raw.size,
          type: raw.type,
          raw,
          progress: 0,
          error,
        });
      }

      if (accepted.length === 0) return;

      setFiles((previousFiles) => {
        const next = [
          ...previousFiles,
          ...accepted,
        ];

        accepted
          .filter((file) => !file.error)
          .forEach((file) =>
            simulateUpload(file.id),
          );

        onUpload?.(
          next
            .filter((file) => !file.error)
            .map((file) => file.raw),
        );

        return next;
      });
    },
    [files, maxFiles, onUpload, simulateUpload],
  );

  const removeFile = (id) => {
    setFiles((previousFiles) =>
      previousFiles.filter(
        (file) => file.id !== id,
      ),
    );
  };

  const onDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);

    processFiles([
      ...event.dataTransfer.files,
    ]);
  };

  const onKeyDown = (event) => {
    if (
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      inputRef.current?.click();
      return;
    }

    if (event.key === 'Escape') {
      setIsDragging(false);
    }
  };

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const previousFile = useCallback(() => {
    setLightboxIndex((currentIndex) =>
      Math.max(0, currentIndex - 1),
    );
  }, []);

  const nextFile = useCallback(() => {
    setLightboxIndex((currentIndex) =>
      Math.min(
        files.filter(
          (file) =>
            !file.error &&
            file.progress === 100,
        ).length - 1,
        currentIndex + 1,
      ),
    );
  }, [files]);

  const atLimit = files.length >= maxFiles;

  const previewFiles = files.filter(
    (file) =>
      !file.error && file.progress === 100,
  );

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={atLimit ? -1 : 0}
        aria-label={
          atLimit
            ? `Upload limit reached. Maximum ${maxFiles} files.`
            : 'Upload evidence files. Press Enter or Space to open file picker.'
        }
        aria-disabled={atLimit}
        onDragOver={
          atLimit ? undefined : onDragOver
        }
        onDragLeave={onDragLeave}
        onDrop={atLimit ? undefined : onDrop}
        onClick={
          atLimit
            ? undefined
            : () =>
                inputRef.current?.click()
        }
        onKeyDown={
          atLimit ? undefined : onKeyDown
        }
        className={`
          relative flex flex-col items-center justify-center gap-3
          border-2 border-dashed rounded-2xl p-8
          transition-all duration-200
          focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
          focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950
          ${
            atLimit
              ? 'opacity-50 cursor-not-allowed'
              : 'cursor-pointer'
          }
          ${
            isDragging
              ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
              : 'border-gray-700 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-900'
          }
        `}
      >
        <Upload
          size={28}
          className={`transition-colors ${
            isDragging
              ? 'text-indigo-400'
              : 'text-gray-500'
          }`}
          aria-hidden="true"
        />

        <div className="text-center">
          <p className="text-sm text-gray-300 font-medium">
            {isDragging
              ? 'Drop files here'
              : 'Drag & drop or click to upload'}
          </p>

          <p className="text-xs text-gray-500 mt-1">
            PDF, PNG, JPG, TXT · max{' '}
            {formatBytes(MAX_SIZE_BYTES)} each ·
            up to {maxFiles} files
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={Object.keys(
            ACCEPTED_TYPES,
          ).join(',')}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onChange={(event) => {
            processFiles([
              ...event.target.files,
            ]);

            event.target.value = '';
          }}
        />
      </div>

      {files.length > 0 && (
        <ul
          className="space-y-2"
          aria-label="Uploaded files"
        >
          {files.map((file) => {
            const previewIndex =
              previewFiles.findIndex(
                (previewFile) =>
                  previewFile.id === file.id,
              );

            return (
              <li
                key={file.id}
                className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3"
              >
                <FileIcon type={file.type} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white truncate">
                      {file.name}
                    </span>

                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatBytes(file.size)}
                    </span>
                  </div>

                  {file.error ? (
                    <p
                      className="text-xs text-red-400 mt-0.5"
                      role="alert"
                    >
                      {file.error}
                    </p>
                  ) : file.progress < 100 ? (
                    <div className="mt-1.5">
                      <div
                        className="h-1 bg-gray-800 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={Math.round(
                          file.progress,
                        )}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Uploading ${file.name}`}
                      >
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-150"
                          style={{
                            width: `${file.progress}%`,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-emerald-400 mt-0.5">
                      Uploaded
                    </p>
                  )}
                </div>

                {!file.error &&
                  file.progress === 100 && (
                    <button
                      type="button"
                      onClick={() =>
                        setLightboxIndex(
                          previewIndex,
                        )
                      }
                      className="text-gray-500 hover:text-indigo-400 transition-colors p-1 rounded-lg hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                      aria-label={`Preview ${file.name}`}
                    >
                      <Eye
                        size={15}
                        aria-hidden="true"
                      />
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() =>
                    removeFile(file.id)
                  }
                  className="text-gray-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
                  aria-label={`Remove ${file.name}`}
                >
                  <X
                    size={15}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {lightboxIndex !== null && (
        <Lightbox
          files={previewFiles}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={previousFile}
          onNext={nextFile}
        />
      )}
    </div>
  );
}