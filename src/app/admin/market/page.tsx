'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Zap, ShieldOff } from 'lucide-react';

interface MarketResource {
  resource: string;
  price: number;
  basePrice: number | null;
  changePercent: string | null;
  circuitBreaker: { active?: boolean; triggered_at?: string; cooldown_ticks?: number } | null;
}

interface MarketState {
  tick: number;
  volatility: number | null;
  updatedAt: string;
  news: string[];
  circuitBreakers: Record<string, unknown>;
}

interface MarketData {
  state: MarketState | null;
  resources: MarketResource[];
}

function formatPrice(n: number): string {
  return n >= 1 ? n.toFixed(2) : n.toFixed(4);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function MarketPage() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchMarket = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/market');
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to fetch market data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMarket(); }, [fetchMarket]);

  const clearBreakers = async () => {
    setClearing(true);
    try {
      await fetch('/api/admin/market', { method: 'POST' });
      await fetchMarket();
    } finally {
      setClearing(false);
    }
  };

  const breakeActiveCount = data?.resources.filter((r) => r.circuitBreaker?.active).length ?? 0;

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
          <h2 className="text-xl font-bold text-white">Market Control</h2>
          <p className="text-sm text-muted-label mt-1">Global market state, prices, and circuit breakers</p>
        </div>
        <div className="flex items-center gap-2">
          {breakeActiveCount > 0 && (
            <button
              type="button"
              onClick={clearBreakers}
              disabled={clearing}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-warning bg-warning/60/10 hover:bg-warning/60/20 border border-warning/60/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              {clearing ? 'Clearing...' : `Clear ${breakeActiveCount} breaker${breakeActiveCount > 1 ? 's' : ''}`}
            </button>
          )}
          <button
            type="button"
            onClick={fetchMarket}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-background/60/50 hover:bg-background/40/50 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {data?.state && (
        <div className="flex items-center gap-4 flex-wrap mb-6 text-xs text-muted-label">
          <span>Tick #{data.state.tick}</span>
          {data.state.volatility != null && (
            <span>Volatility: {data.state.volatility.toFixed(2)}</span>
          )}
          <span>Updated: {formatTime(data.state.updatedAt)}</span>
          {data.state.news.length > 0 && (
            <span>{data.state.news.length} news headlines</span>
          )}
        </div>
      )}

      {data?.resources && data.resources.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-muted-label/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-muted-label/40">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">Resource</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">Price</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label hidden sm:table-cell">Base</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">Change</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label hidden md:table-cell">Breaker</th>
              </tr>
            </thead>
            <tbody>
              {data.resources.map((r) => {
                const change = r.changePercent ? parseFloat(r.changePercent) : 0;
                return (
                  <tr key={r.resource} className="border-b border-muted-label/40/60 last:border-0 hover:bg-background/60/30">
                    <td className="px-4 py-2 text-white font-medium">{r.resource}</td>
                    <td className="px-4 py-2 text-right text-white font-mono">{formatPrice(r.price)}</td>
                    <td className="px-4 py-2 text-right text-muted-label font-mono hidden sm:table-cell">
                      {r.basePrice ? formatPrice(r.basePrice) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {change !== 0 ? (
                        <span className={`inline-flex items-center gap-1 font-mono text-xs ${change > 0 ? 'text-success' : 'text-danger'}`}>
                          {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {change > 0 ? '+' : ''}{change.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-label/80 text-xs">0%</span>
                      )}
                    </td>
                    <td className="px-4 py-2 hidden md:table-cell">
                      {r.circuitBreaker?.active ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning/60/10 border border-warning/60/20 px-1.5 py-0.5 rounded">
                          <Zap className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="text-muted-label/80 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16">
          <TrendingUp className="w-10 h-10 text-muted-label/80 mb-4" />
          <p className="text-sm text-muted-label">No market data available</p>
          <p className="text-xs text-muted-label mt-1">Wait for the markettick worker to populate data</p>
        </div>
      )}

      {data?.state?.news && data.state.news.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-subtle mb-3">Recent Market News</h3>
          <div className="space-y-2">
            {data.state.news.slice(0, 8).map((headline) => (
              <div
                key={headline}
                className="flex items-start gap-3 p-3 rounded-lg border border-muted-label/40 bg-background/80/50"
              >
                <span className="text-xs text-subtle/80">{headline}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
