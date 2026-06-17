'use client';

interface TimelineEvent {
  id: string;
  type: 'created' | 'status_change' | 'admin_action' | 'resolved' | 'note';
  label: string;
  detail?: string;
  timestamp: string;
  actor?: string;
}

interface InvestigationTimelineProps {
  events: TimelineEvent[];
}

const iconMap: Record<string, React.ReactNode> = {
  created: (
    <svg className="w-3.5 h-3.5 text-domain/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  status_change: (
    <svg className="w-3.5 h-3.5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  admin_action: (
    <svg className="w-3.5 h-3.5 text-research" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  resolved: (
    <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  note: (
    <svg className="w-3.5 h-3.5 text-muted-label" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export function InvestigationTimeline({ events }: InvestigationTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-label">No timeline events</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-background/60">
      {events.map((event, i) => (
        <div key={event.id || `event-${i}`} className={`relative pb-5 last:pb-0`}>
          <div className="absolute -left-6 top-0.5 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-background/80 border border-muted-label/30">
            {iconMap[event.type] || iconMap.note}
          </div>

          <div className="ml-2">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-medium text-subtle">{event.label}</span>
              <span className="text-[10px] text-muted-label/80">
                {new Date(event.timestamp).toLocaleString()}
              </span>
            </div>
            {event.detail && (
              <p className="text-xs text-muted-label">{event.detail}</p>
            )}
            {event.actor && (
              <p className="text-[10px] text-muted-label/80 mt-0.5">{event.actor}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
