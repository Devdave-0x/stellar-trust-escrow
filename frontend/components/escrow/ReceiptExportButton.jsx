'use client';

import { useEffect, useId, useRef, useState } from 'react';
import EscrowReceipt from './EscrowReceipt';

/**
 * Button that opens a print-ready preview of an escrow receipt.
 * "Print / Save as PDF" invokes the browser print dialog, which lets the
 * user save to PDF without any extra client-side PDF dependency. When
 * printing, everything outside the receipt preview is hidden via a
 * scoped print stylesheet so only the receipt is emitted.
 */
export default function ReceiptExportButton({ escrow, label = 'Export receipt' }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const triggerRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m0-10V4a1 1 0 011-1h8a1 1 0 011 1v3M7 17v3a1 1 0 001 1h8a1 1 0 001-1v-3H7z"
          />
        </svg>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:static print:bg-transparent print:p-0"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <style>{`
            @media print {
              body > *:not(#receipt-export-root) { display: none !important; }
              #receipt-export-root, #receipt-export-root * { visibility: visible; }
              #receipt-export-root {
                position: fixed;
                inset: 0;
                background: white;
                padding: 0;
              }
              .receipt-export-no-print { display: none !important; }
            }
          `}</style>
          <div
            id="receipt-export-root"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white dark:bg-gray-900 p-4 shadow-2xl sm:p-6 print:max-h-none print:overflow-visible print:rounded-none print:shadow-none"
          >
            <div className="receipt-export-no-print mb-4 flex items-center justify-between">
              <h2 id={titleId} className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Receipt preview
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Print / Save as PDF
                </button>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  Close
                </button>
              </div>
            </div>
            <EscrowReceipt escrow={escrow} />
          </div>
        </div>
      )}
    </>
  );
}
