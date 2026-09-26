'use client';

export default function AuditVerifierStatusCard({ status }) {
  const verifier = status ?? {
    state: 'pending',
    checkedAt: null,
    reportUrl: '/admin/audit-logs',
  };

  const tone =
    verifier.state === 'passing'
      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-950/20'
      : verifier.state === 'failing'
        ? 'text-red-300 border-red-500/30 bg-red-950/20'
        : 'text-amber-300 border-amber-500/30 bg-amber-950/20';

  return (
    <div className={`card border ${tone}`}>
      <p className="text-xs uppercase tracking-wider opacity-80">Audit verifier</p>
      <p className="mt-1 text-2xl font-bold capitalize">{verifier.state}</p>
      <p className="mt-1 text-xs opacity-75">
        {verifier.checkedAt
          ? `Last checked ${new Date(verifier.checkedAt).toLocaleString()}`
          : 'No verification timestamp reported'}
      </p>
      <a href={verifier.reportUrl || '/admin/audit-logs'} className="mt-3 inline-block text-xs underline">
        View detailed report
      </a>
    </div>
  );
}
