'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Clock, Zap, Timer } from 'lucide-react';

interface JobInfo {
  name: string;
  type: 'cloudflare_worker' | 'cron' | 'manual';
  schedule: string;
  lastRun: string | null;
  status: 'ok' | 'late' | 'failed' | 'unknown';
  detail: string;
  triggerPath?: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  cloudflare_worker: <Zap className="w-3.5 h-3.5 text-warning" />,
  cron: <Clock className="w-3.5 h-3.5 text-domain/80" />,
  manual: <Timer className="w-3.5 h-3.5 text-muted-label" />,
};

const statusBadge: Record<string, string> = {
  ok: 'bg-success/10 text-success border-success/20',
  late: 'bg-warning/60/10 text-warning border-warning/60/20',
  failed: 'bg-danger/10 text-danger border-danger/20',
  unknown: 'bg-background/40/50 text-muted-label border-muted-label/20/30',
};

function formatLastRun(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jobs');
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const triggerJob = async (job: JobInfo) => {
    if (!job.triggerPath || runningJob) return;
    setRunningJob(job.name);
    try {
      const res = await fetch(job.triggerPath, { method: 'POST' });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error(`Failed to trigger ${job.name}:`, err);
    } finally {
      setRunningJob(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted-label/20 border-t-warning/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Scheduled Jobs</h2>
          <p className="text-sm text-muted-label mt-1">Background jobs and cron triggers</p>
        </div>
        <button
          type="button"
          onClick={fetchJobs}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-background/60/50 hover:bg-background/40/50 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Clock className="w-10 h-10 text-muted-label/80 mb-4" />
          <p className="text-sm text-muted-label">No jobs configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.name}
              className="border border-muted-label/40 rounded-xl p-4 hover:border-muted-label/30/60 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-1">{typeIcons[job.type]}</div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{job.name}</h3>
                    <p className="text-xs text-muted-label mt-0.5">{job.detail}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-muted-label/80">
                        Schedule: {job.schedule}
                      </span>
                      <span className="text-xs text-muted-label/80">
                        Last run: {formatLastRun(job.lastRun)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={[
                      'inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border',
                      statusBadge[job.status],
                    ].join(' ')}
                  >
                    {job.status}
                  </span>
                  {job.triggerPath && (
                    <button
                      type="button"
                      onClick={() => triggerJob(job)}
                      disabled={runningJob === job.name}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-label hover:text-white bg-background/60 hover:bg-background/40 rounded-md transition-colors disabled:opacity-50"
                    >
                      <Play className={`w-3 h-3 ${runningJob === job.name ? 'animate-pulse' : ''}`} />
                      Run
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
