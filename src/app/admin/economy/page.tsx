'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Coins, Users, TrendingUp, Activity, Lock } from 'lucide-react';

interface EconomyData {
  totalMoney: number;
  totalEarned: number;
  playerCount: number;
  activePlayers: number;
  lockedPlayers: number;
  transactionsToday: number;
  avgMoneyPerPlayer: number;
}

interface TopEarner {
  userId: string;
  money: number;
  totalEarned: number;
  gameTick: number;
}

function formatMoney(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}

export default function EconomyPage() {
  const [data, setData] = useState<{ economy: EconomyData; topEarners: TopEarner[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/economy');
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to fetch economy data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-muted-label/20 border-t-warning/60 rounded-full animate-spin" />
      </div>
    );
  }

  const stats = data?.economy ? [
    { label: 'Total Money', value: `$${formatMoney(data.economy.totalMoney)}`, icon: <Coins className="w-4 h-4" />, color: 'text-success' },
    { label: 'Total Earned', value: `$${formatMoney(data.economy.totalEarned)}`, icon: <TrendingUp className="w-4 h-4" />, color: 'text-warning' },
    { label: 'Players', value: String(data.economy.playerCount), icon: <Users className="w-4 h-4" />, color: 'text-domain/80', sub: `${data.economy.activePlayers} active` },
    { label: 'Trans. Today', value: String(data.economy.transactionsToday), icon: <Activity className="w-4 h-4" />, color: 'text-research' },
    { label: 'Avg/Player', value: `$${formatMoney(data.economy.avgMoneyPerPlayer)}`, icon: <Coins className="w-4 h-4" />, color: 'text-muted-label' },
    { label: 'Locked', value: String(data.economy.lockedPlayers), icon: <Lock className="w-4 h-4" />, color: 'text-danger/60' },
  ] : [];

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Economy</h2>
          <p className="text-sm text-muted-label mt-1">Currency monitoring and transaction analytics</p>
        </div>
        <button type="button" onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-label hover:text-white bg-background/60/50 hover:bg-background/40/50 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="border border-muted-label/40 rounded-xl p-4 bg-background/80/50">
            <div className="flex items-center gap-2 mb-2">
              <span className={s.color}>{s.icon}</span>
              <span className="text-xs text-muted-label">{s.label}</span>
            </div>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            {s.sub && <p className="text-xs text-muted-label mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {data?.topEarners && data.topEarners.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-subtle mb-3">Top Earners</h3>
          <div className="overflow-x-auto rounded-xl border border-muted-label/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-muted-label/40">
                  <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">#</th>
                  <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label">Player</th>
                  <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">Money</th>
                  <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label hidden sm:table-cell">Total Earned</th>
                  <th scope="col" className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label hidden md:table-cell">Tick</th>
                </tr>
              </thead>
              <tbody>
                {data.topEarners.map((p, i) => (
                  <tr key={p.userId} className="border-b border-muted-label/40/60 last:border-0 hover:bg-background/60/30">
                    <td className="px-4 py-2 text-muted-label">{i + 1}</td>
                    <td className="px-4 py-2 text-white font-mono text-xs">{p.userId.slice(0, 8)}...</td>
                    <td className="px-4 py-2 text-right font-mono text-success">${formatMoney(p.money)}</td>
                    <td className="px-4 py-2 text-right font-mono text-subtle hidden sm:table-cell">${formatMoney(p.totalEarned)}</td>
                    <td className="px-4 py-2 text-right text-muted-label font-mono text-xs hidden md:table-cell">{p.gameTick}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
