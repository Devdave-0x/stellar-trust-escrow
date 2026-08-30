import { useState } from 'react';

export function sanitizeShareError(error) {
  const reason = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return reason.replace(
    /(secret|token|password|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
    '$1=[REDACTED]',
  );
}

export function buildShareError(action, error) {
  const reason = sanitizeShareError(error);
  return reason ? `Failed to ${action}: ${reason}` : `Failed to ${action}.`;
}

export default function ReferralShareCard({
  shareUrl = '',
  title = 'Share your referral link',
  description = 'Send this link to friends and earn rewards when they join.',
  buttonLabel = 'Copy link',
}) {
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (!shareUrl) {
        throw new Error('No referral link is available to copy.');
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable in this browser.');
      }

      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setError('');
    } catch (caughtError) {
      const message = buildShareError('copy referral link', caughtError);
      setCopied(false);
      setError(message);
      throw new Error(message);
    }
  };

  return (
    <div className="referral-share-card" aria-live="polite">
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      <button type="button" onClick={handleCopy}>
        {copied ? 'Copied' : buttonLabel}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
