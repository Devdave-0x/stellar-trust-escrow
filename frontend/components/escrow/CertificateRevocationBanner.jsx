export default function CertificateRevocationBanner({ certificate }) {
  if (!certificate?.revoked && !certificate?.revokedAt) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
      <p className="font-semibold">This certificate has been revoked</p>
      <p className="mt-1">Revoked {certificate.revokedAt ? new Date(certificate.revokedAt).toLocaleString() : 'on record'}{certificate.reason ? `: ${certificate.reason}` : '.'}</p>
      <p className="mt-1 text-xs text-red-300">Do not use this document as proof of escrow completion.</p>
    </div>
  );
}
