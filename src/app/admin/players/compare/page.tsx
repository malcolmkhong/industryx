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
          <p className="text-sm text-muted-label mt-1">Side-by-side comparison of up to 4 players</p>
        </div>
      </div>

      <div className="border border-muted-label/40 rounded-xl p-4 mb-6 bg-background/80/50">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {ids.map((id, i) => (
            <input
              key={`player-input-${i}`}
              aria-label={`Player ${i + 1} UUID`}
              value={id}
              onChange={(e) => updateId(i, e.target.value)}
              placeholder={`Player ${i + 1} UUID...`}
              className="px-3 py-2 bg-background/60 border border-muted-label/30 rounded-lg text-xs text-white placeholder-muted-label font-mono focus:outline-none focus:border-warning/60/50"
            />
          ))}
        </div>
        {error && <p className="text-xs text-danger mb-2">{error}</p>}
        <button
          type="button"
          onClick={compare}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-warning/70 hover:bg-warning/80 disabled:bg-background/40 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <GitCompare className="w-4 h-4" />
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {players.length >= 2 && (
        <div className="overflow-x-auto rounded-xl border border-muted-label/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-muted-label/40">
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-semibold text-muted-label w-32">Metric</th>
                {players.map((p) => (
                  <th scope="col" key={p.userId} className="text-right px-4 py-2.5 text-xs font-semibold text-muted-label">
                    {p.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.key} className="border-b border-muted-label/40/60 last:border-0 hover:bg-background/60/30">
                  <td className="px-4 py-2 text-muted-label">{m.label}</td>
                  {players.map((p) => {
                    const val = p[m.key];
                    const isHighest = players.every(
                      (o) => (typeof val === 'number' ? (o[m.key] as number) <= (val as number) : true)
                    );
                    return (
                      <td
                        key={p.userId}
                        className={`px-4 py-2 text-right font-mono ${isHighest && typeof val === 'number' ? 'text-warning' : 'text-white'}`}
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
          <Users className="w-10 h-10 text-muted-label/80 mb-4" />
          <p className="text-sm text-muted-label">Enter player UUIDs above to compare</p>
        </div>
      )}
    </>
  );
}
