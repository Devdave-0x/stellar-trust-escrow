'use client';

/**
 * Renders a dispute timeline while keeping inconsistent chronology out of the
 * user experience. Administrators receive diagnostics; participants receive a
 * safe, non-blocking fallback message.
 */
export function timelineHasAnomaly(timeline) {
  if (!timeline) return false;
  if (timeline.anomaly === true || timeline.inconsistent === true || timeline.timelineAnomaly === true) {
    return true;
  }
  return Array.isArray(timeline.events)
    ? timeline.events.some((event) => event.anomaly === true || event.inconsistent === true)
    : false;
}

function eventLabel(event) {
  return event.type || event.state || event.event_type || event.event || 'Timeline event';
}

function eventTimestamp(event) {
  const value = event.timestamp || event.createdAt || event.ts;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export default function DisputeTimelineAnomaly({
  events = [],
  anomaly = false,
  reason,
  isAdmin = false,
}) {
  if (anomaly && !isAdmin) {
    return (
      <div
        role="status"
        data-testid="timeline-anomaly-fallback"
        className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        <p className="font-medium">Dispute history temporarily unavailable</p>
        <p className="mt-1 text-amber-200/80">
          We’re reviewing the dispute activity. You can continue using the rest of this escrow while
          the timeline is reconciled.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {anomaly && isAdmin && (
        <aside
          role="alert"
          data-testid="timeline-anomaly-warning"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <p className="font-semibold">Timeline anomaly detected</p>
          <p className="mt-1 text-amber-200/80">
            Chronology is inconsistent. Review the raw event diagnostics before taking action.
          </p>
          {reason && <p className="mt-2 font-mono text-xs text-amber-200/70">Reason: {reason}</p>}
        </aside>
      )}

      {events.length > 0 && (
        <ol className="relative border-l border-gray-700 ml-2 space-y-5" aria-label="Dispute timeline">
          {events.map((event, index) => (
            <li key={event.id ?? `${eventTimestamp(event) ?? 'event'}-${index}`} className="ml-4">
              <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-gray-900 bg-indigo-500" />
              <p className="text-sm font-medium text-white">{eventLabel(event)}</p>
              {eventTimestamp(event) && <time className="mt-1 block text-xs text-gray-500">{eventTimestamp(event)}</time>}
              {isAdmin && event.actor && <p className="mt-1 text-xs text-gray-500">Actor: {event.actor}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
