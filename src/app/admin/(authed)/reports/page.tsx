'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Flag, AlertTriangle } from 'lucide-react';

interface Report {
  id: string;
  userId: string;
  detectionType: string;
  severity: string;
  status: string;
  description: string;
  createdAt: string;
}

const severityBadge: Record<string, string> = {
  low: 'bg-domain/60/10 text-domain/80 border-domain/20',
  medium: 'bg-warning/60/10 text-warning border-warning/60/20',
  high: 'bg-domain/60/10 text-domain border-domain/20',
  critical: 'bg-danger/10 text-danger border-danger/20',
};

const statusBadge: Record<string, string> = {
  open: 'bg-danger/10 text-danger border-danger/20',
  investigating: 'bg-warning/60/10 text-warning border-warning/60/20',
  resolved: 'bg-success/10 text-success border-success/20',
  dismissed: 'bg-background/40/50 text-muted-label border-muted-label/20/30',
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchReports = useCallback(async () => {
    try {
      const statusParam = filter !== 'all' ? `&status=${filter}` : '';
      const res = await fetch(`/api/admin/investigations?limit=100${statusParam}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const counts = {
    total: reports.length,
    critical: reports.filter((r) => r.severity === 'critical').length,
    open: reports.filter((r) => r.status === 'open').length,
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
          <h2 className="text-xl font-bold text-white">Reports</h2>
          <p className="text-sm text-muted-label mt-1">Abuse, fraud, and player reports from investigations</p>
        </div>
        <button type="button" onClick={fetchReports} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-background/60/50 hover:bg-background/40/50 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: counts.total, color: 'text-domain/80' },
          { label: 'Critical', value: counts.critical, color: 'text-danger' },
          { label: 'Open', value: counts.open, color: 'text-warning' },
        ].map((c) => (
          <div key={c.label} className="border border-muted-label/40 rounded-xl p-4 bg-background/80/50 text-center">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-label mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4">
        {['all', 'open', 'investigating', 'resolved', 'dismissed'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              filter === s ? 'bg-warning/60/20 text-warning' : 'text-muted-label hover:text-white bg-background/60/50'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Flag className="w-10 h-10 text-muted-label/80 mb-4" />
          <p className="text-sm text-muted-label">No reports found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="border border-muted-label/40 rounded-xl p-4 hover:border-muted-label/30/60">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border ${severityBadge[r.severity] || severityBadge.low}`}>
                      {r.severity}
                    </span>
                    <span className={`inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border ${statusBadge[r.status] || statusBadge.open}`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-muted-label">{r.detectionType}</span>
                  </div>
                  <p className="text-sm text-subtle line-clamp-2">{r.description}</p>
                </div>
                {r.severity === 'critical' && <AlertTriangle className="w-4 h-4 text-danger shrink-0" />}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-label/80">
                <span>User: {r.userId?.slice(0, 8)}...</span>
                <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
