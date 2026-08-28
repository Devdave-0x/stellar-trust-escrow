'use client';

export default function KycStatusBanner({ status = 'Pending' }) {
  return (
    <div role="status" aria-label={`KYC status: ${status}`}>
      {status}
    </div>
  );
}
