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
  low: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const statusBadge: Record<string, string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  investigating: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  dismissed: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',
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
        <div className="w-6 h-6 border-2 border-zinc-600 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Reports</h2>
          <p className="text-sm text-zinc-400 mt-1">Abuse, fraud, and player reports from investigations</p>
        </div>
        <button type="button" onClick={fetchReports} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: counts.total, color: 'text-blue-400' },
          { label: 'Critical', value: counts.critical, color: 'text-red-400' },
          { label: 'Open', value: counts.open, color: 'text-amber-400' },
        ].map((c) => (
          <div key={c.label} className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50 text-center">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{c.label}</p>
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
              filter === s ? 'bg-amber-500/20 text-amber-400' : 'text-zinc-400 hover:text-white bg-zinc-800/50'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Flag className="w-10 h-10 text-zinc-600 mb-4" />
          <p className="text-sm text-zinc-400">No reports found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="border border-zinc-800 rounded-xl p-4 hover:border-zinc-700/60">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border ${severityBadge[r.severity] || severityBadge.low}`}>
                      {r.severity}
                    </span>
                    <span className={`inline-flex text-[11px] font-semibold px-1.5 py-0.5 rounded border ${statusBadge[r.status] || statusBadge.open}`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-zinc-500">{r.detectionType}</span>
                  </div>
                  <p className="text-sm text-zinc-300 line-clamp-2">{r.description}</p>
                </div>
                {r.severity === 'critical' && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-600">
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
