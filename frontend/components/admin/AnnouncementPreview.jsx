'use client';

import { useMemo } from 'react';

export const TARGET_SEGMENTS = ['global', 'tenant', 'role', 'individual'];

export function validateAnnouncementWindow({ startsAt, endsAt } = {}, now = new Date()) {
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const errors = [];
  if (startsAt && Number.isNaN(start.getTime())) errors.push('Start time is invalid.');
  if (endsAt && Number.isNaN(end.getTime())) errors.push('End time is invalid.');
  if (start && end && start >= end) errors.push('End time must be after the start time.');
  if (end && end <= now) errors.push('This announcement window has already ended.');
  return errors;
}

export default function AnnouncementPreview({ announcement = {}, segment = 'global', tenant, role, individual, now }) {
  const errors = useMemo(() => validateAnnouncementWindow(announcement, now), [announcement, now]);
  const target = segment === 'tenant' ? `Tenant: ${tenant || 'not selected'}` : segment === 'role' ? `Role: ${role || 'not selected'}` : segment === 'individual' ? `User: ${individual || 'not selected'}` : 'Everyone';
  return (
    <section className="card p-5 space-y-3" aria-label="Announcement preview">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-white">Preview</h3><span className="text-xs text-indigo-300">{target}</span></div>
      {errors.length > 0 && <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-sm text-rose-200">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
      <div className="rounded-xl border border-gray-700 bg-gray-900 p-4"><p className="text-xs text-gray-500">{announcement.kind || 'Announcement'}</p><h4 className="mt-1 text-lg font-semibold text-white">{announcement.title || 'Untitled announcement'}</h4><p className="mt-2 text-sm text-gray-300">{announcement.body || 'Announcement copy will appear here.'}</p></div>
    </section>
  );
}
