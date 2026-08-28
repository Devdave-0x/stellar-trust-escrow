'use client';

function formatWalletLabel(address) {
  if (!address) return 'Connect wallet';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export default function WalletConnectButton({ address = '', onClick = () => {} }) {
  const label = formatWalletLabel(address);

  return (
    <button type="button" onClick={onClick} aria-label={label}>
      {label}
    </button>
  );
}
