'use client';

import { useEffect, useRef, useState } from 'react';

function formatWalletLabel(address) {
  if (!address) return 'Connect wallet';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

const STATUS_ANNOUNCEMENTS = {
  connected: 'Wallet connected',
  signing: 'Signing request in progress',
  pending: 'Transaction pending',
  confirmed: 'Transaction confirmed',
};

function getAnnouncement(status) {
  if (!status) return '';
  return STATUS_ANNOUNCEMENTS[status] || '';
}

export default function WalletConnectButton({
  address = '',
  onClick = () => {},
  status = '',
}) {
  const label = formatWalletLabel(address);
  const [announcement, setAnnouncement] = useState('');
  const lastStatusRef = useRef(status);

  useEffect(() => {
    if (status === lastStatusRef.current) return;
    lastStatusRef.current = status;
    setAnnouncement(getAnnouncement(status));
  }, [status]);

  return (
    <>
      <button type="button" onClick={onClick} aria-label={label}>
        {label}
      </button>
      <span
        aria-live="polite"
        aria-atomic="true"
        role="status"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {announcement}
      </span>
    </>
  );
}