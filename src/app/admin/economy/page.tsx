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
        <div className="w-6 h-6 border-2 border-zinc-600 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const stats = data?.economy ? [
    { label: 'Total Money', value: `$${formatMoney(data.economy.totalMoney)}`, icon: <Coins className="w-4 h-4" />, color: 'text-emerald-400' },
    { label: 'Total Earned', value: `$${formatMoney(data.economy.totalEarned)}`, icon: <TrendingUp className="w-4 h-4" />, color: 'text-amber-400' },
    { label: 'Players', value: String(data.economy.playerCount), icon: <Users className="w-4 h-4" />, color: 'text-blue-400', sub: `${data.economy.activePlayers} active` },
    { label: 'Trans. Today', value: String(data.economy.transactionsToday), icon: <Activity className="w-4 h-4" />, color: 'text-purple-400' },
    { label: 'Avg/Player', value: `$${formatMoney(data.economy.avgMoneyPerPlayer)}`, icon: <Coins className="w-4 h-4" />, color: 'text-zinc-400' },
    { label: 'Locked', value: String(data.economy.lockedPlayers), icon: <Lock className="w-4 h-4" />, color: 'text-red-400' },
  ] : [];

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Economy</h2>
          <p className="text-sm text-zinc-400 mt-1">Currency monitoring and transaction analytics</p>
        </div>
        <button type="button" onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {stats.map((s) => (
          <div key={s.label} className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/50">
            <div className="flex items-center gap-2 mb-2">
              <span className={s.color}>{s.icon}</span>
              <span className="text-xs text-zinc-500">{s.label}</span>
            </div>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            {s.sub && <p className="text-xs text-zinc-500 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {data?.topEarners && data.topEarners.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Top Earners</h3>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-400">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-400">Player</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-400">Money</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-400 hidden sm:table-cell">Total Earned</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-400 hidden md:table-cell">Tick</th>
                </tr>
              </thead>
              <tbody>
                {data.topEarners.map((p, i) => (
                  <tr key={p.userId} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-zinc-500">{i + 1}</td>
                    <td className="px-4 py-2 text-white font-mono text-xs">{p.userId.slice(0, 8)}...</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-400">${formatMoney(p.money)}</td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-300 hidden sm:table-cell">${formatMoney(p.totalEarned)}</td>
                    <td className="px-4 py-2 text-right text-zinc-500 font-mono text-xs hidden md:table-cell">{p.gameTick}</td>
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
