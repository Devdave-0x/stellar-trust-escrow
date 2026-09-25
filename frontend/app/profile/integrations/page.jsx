'use client';

import Link from 'next/link';
import IntegrationSecurity from '../../../components/settings/IntegrationSecurity';

export default function IntegrationsPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-white">Developer integrations</h1><p className="mt-1 text-sm text-gray-400">Manage webhook secrets and API access for your integrations.</p></div>
        <Link href="/profile/settings" className="text-sm text-indigo-400 hover:text-indigo-300">← Settings</Link>
      </div>
      <IntegrationSecurity />
    </main>
  );
}
