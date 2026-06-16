'use client';

import { useState, useCallback } from 'react';
import { GitCompare, Users } from 'lucide-react';

interface PlayerData {
  userId: string;
  displayName: string;
  money: number;
  totalEarned: number;
  researchPoints: number;
  gameTick: number;
  gameSpeed: number;
  buildingsCount: number;
  cheatFlags: number;
  isLocked: boolean;
  lastSaved: string;
}

function formatMoney(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}

const METRICS: { key: keyof PlayerData; label: string; format: (v: unknown) => string }[] = [
  { key: 'money', label: 'Money', format: (v) => `$${formatMoney(v as number)}` },
  { key: 'totalEarned', label: 'Total Earned', format: (v) => `$${formatMoney(v as number)}` },
  { key: 'researchPoints', label: 'Research', format: (v) => String(v) },
  { key: 'gameTick', label: 'Tick', format: (v) => String(v) },
  { key: 'gameSpeed', label: 'Speed', format: (v) => `${v}x` },
  { key: 'buildingsCount', label: 'Buildings', format: (v) => String(v) },
  { key: 'cheatFlags', label: 'Cheat Flags', format: (v) => String(v) },
  { key: 'isLocked', label: 'Locked', format: (v) => (v ? 'Yes' : 'No') },
  { key: 'lastSaved', label: 'Last Saved', format: (v) => new Date(v as string).toLocaleString() },
];

export default function ComparePage() {
  const [ids, setIds] = useState<string[]>(['', '', '', '']);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const compare = useCallback(async () => {
    const valid = ids.filter((id) => id.trim());
    if (valid.length < 2) {
      setError('Enter at least 2 player IDs');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/players/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: valid.map((s) => s.trim()) }),
      });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.data || []);
      } else {
        setError('Failed to load players');
      }
    } finally {
      setLoading(false);
    }
  }, [ids]);

  const updateId = (i: number, val: string) => {
    const next = [...ids];
    next[i] = val;
    setIds(next);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Compare Players</h2>
          <p className="text-sm text-zinc-400 mt-1">Side-by-side comparison of up to 4 players</p>
        </div>
      </div>

      <div className="border border-zinc-800 rounded-xl p-4 mb-6 bg-zinc-900/50">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {ids.map((id, i) => (
            <input
              key={`player-input-${i}`}
              value={id}
              onChange={(e) => updateId(i, e.target.value)}
              placeholder={`Player ${i + 1} UUID...`}
              className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-500/50"
            />
          ))}
        </div>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button
          type="button"
          onClick={compare}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <GitCompare className="w-4 h-4" />
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {players.length >= 2 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-zinc-400 w-32">Metric</th>
                {players.map((p) => (
                  <th key={p.userId} className="text-right px-4 py-2.5 text-xs font-semibold text-zinc-400">
                    {p.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <td className="px-4 py-2 text-zinc-400">{m.label}</td>
                  {players.map((p) => {
                    const val = p[m.key];
                    const isHighest = players.every(
                      (o) => (typeof val === 'number' ? (o[m.key] as number) <= (val as number) : true)
                    );
                    return (
                      <td
                        key={p.userId}
                        className={`px-4 py-2 text-right font-mono ${isHighest && typeof val === 'number' ? 'text-amber-400' : 'text-white'}`}
                      >
                        {m.format(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && players.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16">
          <Users className="w-10 h-10 text-zinc-600 mb-4" />
          <p className="text-sm text-zinc-400">Enter player UUIDs above to compare</p>
        </div>
      )}
    </>
  );
}
