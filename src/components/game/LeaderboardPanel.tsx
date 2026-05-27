'use client';

import { useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RANK_THRESHOLDS } from '@/lib/game/data';
import { LeaderboardEntry } from '@/lib/game/types';
import { Trophy, ChevronDown, ChevronUp, Building2, FlaskConical, ScrollText, Coins, Clock, RotateCcw } from 'lucide-react';

export default function LeaderboardPanel() {
  const store = useGameStore();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const entries = store.leaderboardEntries;

  // Calculate current run score for comparison
  const currentScore = Math.floor(
    store.totalMoneyEarned +
    store.buildings.length * 100 +
    store.completedResearch.length * 200 +
    store.stats.contractsCompleted * 50 +
    store.prestigeState.totalPrestiges * 500
  );

  // Check if current run would be in top 10
  const isInTop10 = entries.length < 10 || currentScore > (entries[entries.length - 1]?.score ?? 0);

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return 'from-yellow-400 to-amber-600'; // Gold
    if (rank === 2) return 'from-gray-300 to-gray-500'; // Silver
    if (rank === 3) return 'from-amber-600 to-amber-800'; // Bronze
    return 'from-gray-600 to-gray-700';
  };

  const getRankBadgeBg = (rank: number) => {
    if (rank === 1) return 'bg-yellow-500/20 border-yellow-500/40';
    if (rank === 2) return 'bg-gray-400/20 border-gray-400/40';
    if (rank === 3) return 'bg-amber-600/20 border-amber-600/40';
    return 'bg-gray-800/50 border-gray-700/40';
  };

  const formatPlayTime = (ticks: number) => {
    if (ticks >= 3600) return `${(ticks / 3600).toFixed(1)}h`;
    if (ticks >= 60) return `${Math.floor(ticks / 60)}m`;
    return `${ticks}s`;
  };

  const getRankForScore = (score: number) => {
    for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
      if (score >= RANK_THRESHOLDS[i].minScore) {
        return RANK_THRESHOLDS[i];
      }
    }
    return RANK_THRESHOLDS[0];
  };

  const toggleExpand = (id: string) => {
    setExpandedEntry(prev => prev === id ? null : id);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-bold text-amber-400 neon-glow-cyan" style={{ textShadow: '0 0 10px rgba(251,191,36,0.4)' }}>
            LEADERBOARD
          </h2>
        </div>
        <div className="text-xs text-gray-500">
          Top 10 Runs • Prestige to record your score
        </div>
      </div>

      {/* Current Run Indicator */}
      <div className={`rounded-lg border p-3 ${
        isInTop10 && entries.length > 0
          ? 'bg-cyan-900/15 border-cyan-500/40'
          : 'bg-[#111827] border-cyan-900/20'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-[10px] font-bold text-cyan-400">
              ★
            </div>
            <div>
              <div className="text-xs font-bold text-cyan-400">Current Run</div>
              <div className="text-[10px] text-gray-500">
                {getRankForScore(currentScore).emoji} {getRankForScore(currentScore).name}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono font-bold text-cyan-400">{formatNumber(currentScore)}</div>
            <div className="text-[10px] text-gray-500">Score</div>
          </div>
        </div>
        {isInTop10 && entries.length > 0 && (
          <div className="mt-2 text-[10px] text-cyan-400/70 text-center">
            🏆 This run qualifies for the leaderboard!
          </div>
        )}
      </div>

      {/* Leaderboard Table */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-cyan-900/20 bg-[#111827] p-8 text-center">
          <div className="text-3xl mb-3">🏆</div>
          <div className="text-sm text-gray-400 font-medium">No entries yet</div>
          <div className="text-xs text-gray-600 mt-1">
            Prestige (Global Expand) to record your first run!
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry: LeaderboardEntry) => {
            const isExpanded = expandedEntry === entry.id;
            const rankInfo = getRankForScore(entry.score);
            return (
              <div
                key={entry.id}
                className={`rounded-lg border transition-all duration-200 ${
                  entry.rank <= 3
                    ? getRankBadgeBg(entry.rank)
                    : 'bg-[#111827] border-cyan-900/20'
                } ${isExpanded ? 'ring-1 ring-cyan-900/30' : ''}`}
              >
                {/* Main Row */}
                <button
                  onClick={() => toggleExpand(entry.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  {/* Rank Badge */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${getRankBadgeColor(entry.rank)} flex items-center justify-center text-xs font-bold text-white shadow-lg`}>
                    {entry.rank <= 3 ? (
                      <Trophy className="w-4 h-4" />
                    ) : (
                      <span>#{entry.rank}</span>
                    )}
                  </div>

                  {/* Corporation Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-200 truncate">{entry.corporationName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400 flex-shrink-0">
                        {rankInfo.emoji} {entry.rankName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-500">
                      <span className="flex items-center gap-0.5">
                        <Building2 className="w-3 h-3" />{entry.buildingsBuilt}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <FlaskConical className="w-3 h-3" />{entry.researchCompleted}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <ScrollText className="w-3 h-3" />{entry.contractsCompleted}
                      </span>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-mono font-bold text-amber-400">{formatNumber(entry.score)}</div>
                    <div className="text-[10px] text-gray-600">Score</div>
                  </div>

                  {/* Expand Toggle */}
                  <div className="flex-shrink-0 text-gray-600">
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-gray-800/50">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                      <div className="bg-[#0a0e17] rounded-md p-2">
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Coins className="w-3 h-3 text-green-400" /> Money Earned
                        </div>
                        <div className="text-xs font-mono text-green-400">${formatNumber(entry.totalMoneyEarned)}</div>
                      </div>
                      <div className="bg-[#0a0e17] rounded-md p-2">
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-cyan-400" /> Buildings
                        </div>
                        <div className="text-xs font-mono text-cyan-400">{entry.buildingsBuilt}</div>
                      </div>
                      <div className="bg-[#0a0e17] rounded-md p-2">
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <FlaskConical className="w-3 h-3 text-purple-400" /> Research
                        </div>
                        <div className="text-xs font-mono text-purple-400">{entry.researchCompleted}</div>
                      </div>
                      <div className="bg-[#0a0e17] rounded-md p-2">
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <ScrollText className="w-3 h-3 text-rose-400" /> Contracts
                        </div>
                        <div className="text-xs font-mono text-rose-400">{entry.contractsCompleted}</div>
                      </div>
                      <div className="bg-[#0a0e17] rounded-md p-2">
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-yellow-400" /> Play Time
                        </div>
                        <div className="text-xs font-mono text-yellow-400">{formatPlayTime(entry.playTime)}</div>
                      </div>
                      <div className="bg-[#0a0e17] rounded-md p-2">
                        <div className="text-[10px] text-gray-500 flex items-center gap-1">
                          <RotateCcw className="w-3 h-3 text-fuchsia-400" /> Prestiges
                        </div>
                        <div className="text-xs font-mono text-fuchsia-400">{entry.prestigeCount}</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-600 mt-2 text-right">
                      Recorded at Tick #{formatNumber(entry.achievedAt)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Summary */}
      {entries.length > 0 && (
        <div className="rounded-lg border border-cyan-900/20 bg-[#111827] p-3">
          <div className="text-xs text-gray-400 font-medium mb-2">Leaderboard Stats</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-sm font-mono font-bold text-amber-400">
                {formatNumber(Math.max(...entries.map(e => e.score)))}
              </div>
              <div className="text-[10px] text-gray-500">Best Score</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono font-bold text-cyan-400">
                {entries.length}
              </div>
              <div className="text-[10px] text-gray-500">Total Runs</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono font-bold text-purple-400">
                {entries.reduce((sum, e) => sum + e.prestigeCount, 0)}
              </div>
              <div className="text-[10px] text-gray-500">Total Prestiges</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
