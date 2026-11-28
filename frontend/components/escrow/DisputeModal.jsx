/**
 * DisputeModal Component
 *
 * Modal dialog for raising a dispute on an active escrow.
 * Uploads evidence with size/type validation and submits the verified hash.
 */

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useToast } from '../../contexts/ToastContext';
import { buildRaiseDisputeTx, broadcastTransaction } from '../../lib/stellar';
import { uploadDisputeEvidence } from '../../lib/uploadEvidence';
import Modal from '../ui/Modal';
import CharCountTextarea from '../ui/CharCountTextarea';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function DisputeModal({ isOpen, onClose, escrowId, onSuccess }) {
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [evidenceHash, setEvidenceHash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const { address, signTx } = useWallet();
  const { showToast } = useToast();

  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

  const getFocusableElements = useCallback(() => {
    const root = dialogRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }, []);

  // Capture the trigger, move focus into the dialog, and restore on close.
  useEffect(() => {
    if (!isOpen) return undefined;

    triggerRef.current =
      typeof document !== 'undefined' ? document.activeElement : null;

    // Move focus into the dialog (first focusable element, else the container).
    const focusTimer = setTimeout(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 0);

    return () => {
      clearTimeout(focusTimer);
      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger && typeof trigger.focus === 'function' && trigger.isConnected) {
        trigger.focus();
      }
    };
  }, [isOpen, getFocusableElements]);

  // Trap Tab / Shift+Tab focus within the dialog while open.
  const handleKeyDown = useCallback(
    (event) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        if (dialogRef.current) dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialogRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    },
    [getFocusableElements]
  );

  const handleRaise = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (!address) throw new Error('Please connect your wallet first');
      if (!file && !reason.trim()) {
        throw new Error('Add a reason or evidence file before submitting.');
      }

      let hash = evidenceHash;
      if (!hash) {
        const payload = file || new Blob([reason.trim()], { type: 'text/plain' });
        hash = await uploadDisputeEvidence(escrowId, payload, {
          onProgress: setUploadProgress,
        });
        setEvidenceHash(hash);
      }

      // Evidence hash is stored off-chain via the upload API; raise_dispute freezes funds.
      const unsignedXdr = await buildRaiseDisputeTx({
        sourceAddress: address,
        escrowId: BigInt(escrowId).toString(),
      });

      const signedXdr = await signTx(unsignedXdr);
      const { hash: txHash } = await broadcastTransaction(signedXdr);

      showToast(`Dispute raised: ${txHash}`, 'success');
      setReason('');
      resetUpload();
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message);
      showToast(err.message || 'Failed to raise dispute', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Raise Dispute"
      isConfirmation={true}
      onConfirm={handleRaise}
      confirmLabel={isSubmitting ? 'Signing…' : 'Confirm Dispute'}
      confirmVariant="danger"
      isLoading={isSubmitting}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="space-y-4 focus:outline-none"
      >
        {/* Warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm text-amber-300">
          Raising a dispute will <strong>freeze all funds</strong> in this escrow until the arbiter
          or contract admin resolves it. This action cannot be undone.
        </div>

        <p className="text-gray-400 text-sm">Escrow #{escrowId}</p>

        <div>
          <label htmlFor="dispute-reason" className="block text-sm text-gray-400 mb-1">
            Reason for dispute <span className="text-gray-600">(recommended)</span>
          </label>
          <CharCountTextarea
            id="dispute-reason"
            rows={4}
            placeholder="Describe the issue clearly. This will be stored with the dispute record…"
            maxLength={2000}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5
                       text-white text-sm placeholder-gray-500 resize-none
                       focus:outline-none focus:border-amber-500 focus-visible:ring-2 focus-visible:ring-amber-500"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="dispute-evidence" className="block text-sm text-gray-400 mb-1">
            Evidence file <span className="text-gray-600">(PDF, PNG, JPEG, TXT · max 10MB)</span>
          </label>
          <input
            id="dispute-evidence"
            type="file"
            accept=".pdf,.png,.jpeg,.jpg,.txt,application/pdf,image/png,image/jpeg,text/plain"
            disabled={isSubmitting}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setEvidenceHash('');
              setUploadProgress(0);
            }}
            className="block w-full text-sm text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-gray-700 file:text-gray-200"
          />
          {uploadProgress > 0 && uploadProgress < 100 && (
            <p className="text-xs text-indigo-400 mt-1">Uploading… {uploadProgress}%</p>
          )}
          {evidenceHash && (
            <p className="text-xs text-emerald-400 mt-1 font-mono break-all">
              Verified hash: {evidenceHash}
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
