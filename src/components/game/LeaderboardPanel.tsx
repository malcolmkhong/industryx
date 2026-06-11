'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { formatNumber } from '@/lib/game/store';
import { RANK_THRESHOLDS } from '@/lib/game/configCache';
import { Trophy, ChevronDown, ChevronUp, Building2, FlaskConical, ScrollText, Coins, Clock, RotateCcw, Loader2, RefreshCw, Crown, Medal, Award, Globe, LogIn, WifiOff } from 'lucide-react';
import { GameIcon } from '@/components/game/shared/GameIcon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Types ──────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  id: string;
  user_id: string;
  corporation_name: string;
  score: number;
  total_money_earned: number;
  buildings_built: number;
  research_completed: number;
  contracts_completed: number;
  prestige_count: number;
  play_time_ticks: number;
  rank_name: string | null;
  game_tick: number;
  created_at: string;
  rank: number;
}

interface UserRankInfo {
  bestScore: number;
  bestRank: number;
  totalRuns: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

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

const getRankIcon = (rank: number) => {
  if (rank === 1) return <Crown className="w-4 h-4" />;
  if (rank === 2) return <Medal className="w-4 h-4" />;
  if (rank === 3) return <Award className="w-4 h-4" />;
  return <span className="text-xs font-bold">#{rank}</span>;
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

const timeAgo = (dateStr: string): string => {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

// ─── Component ──────────────────────────────────────────────────────────

export default function LeaderboardPanel() {
  const { user } = useAuth();

  // State
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<UserRankInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number>(0);

  // ── Fetch leaderboard data ──
  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: '50' });
      if (user?.id) {
        params.set('userId', user.id);
      }

      const response = await fetch(`/api/leaderboard?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to load leaderboard (${response.status})`);
      }

      const data = await response.json();
      setEntries(data.entries || []);
      setUserRank(data.userRank || null);
      setLastRefresh(Date.now());
    } catch (err) {
      console.error('[Leaderboard] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Fetch on mount and when user changes
  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchLeaderboard, 30_000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedEntry(prev => prev === id ? null : id);
  }, []);

  // ── Stats ──
  const stats = useMemo(() => {
    if (entries.length === 0) return null;
    const bestScore = Math.max(...entries.map(e => e.score));
    const totalPrestiges = entries.reduce((sum, e) => sum + e.prestige_count, 0);
    const uniquePlayers = new Set(entries.map(e => e.user_id)).size;
    return { bestScore, totalPrestiges, uniquePlayers, totalRuns: entries.length };
  }, [entries]);

  // ── Loading state ──
  if (isLoading && entries.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-amber-400 neon-glow-cyan">LEADERBOARD</h2>
        </div>
        <div className="rounded-lg border border-cyan-900/20 bg-card p-8 text-center">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">Loading global rankings...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error && entries.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-amber-400 neon-glow-cyan">LEADERBOARD</h2>
        </div>
        <div className="rounded-lg border border-red-900/30 bg-card p-8 text-center">
          <WifiOff className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLeaderboard}
            className="mt-3 border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/20"
          >
            <RefreshCw className="w-3 h-3 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-amber-400 neon-glow-cyan">LEADERBOARD</h2>
          <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 bg-cyan-900/20">
            <Globe className="w-2.5 h-2.5 mr-1" /> Global
          </Badge>
          {user && (
            <Badge variant="outline" className="text-[10px] border-success/30 text-success bg-success/20">
              ✓ Signed In
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {lastRefresh > 0 ? `Updated ${timeAgo(new Date(lastRefresh).toISOString())}` : 'Loading...'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchLeaderboard}
            disabled={isLoading}
            className="h-6 w-6 p-0 text-gray-500 hover:text-cyan-400"
            aria-label="Refresh leaderboard"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* User's Rank Card (only if authenticated and has entries) */}
      {user && userRank && userRank.bestScore > 0 && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-900/10 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-xs font-bold text-white shadow-lg">
                #{userRank.bestRank}
              </div>
              <div>
                <div className="text-xs font-bold text-cyan-400">Your Best Ranking</div>
                <div className="text-[10px] text-gray-500">
                  <GameIcon icon={getRankForScore(userRank.bestScore).icon} size={14} className="inline-flex" /> {getRankForScore(userRank.bestScore).name}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono font-bold text-amber-400">{formatNumber(userRank.bestScore)}</div>
              <div className="text-[10px] text-gray-500">{userRank.totalRuns} run{userRank.totalRuns !== 1 ? 's' : ''}</div>
            </div>
          </div>
        </div>
      )}

      {/* Not signed in notice */}
      {!user && (
        <div className="rounded-lg border border-amber-900/30 bg-amber-900/10 p-3 flex items-center gap-2">
          <LogIn className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div className="text-xs text-amber-300">
            Sign in to submit your score and compete on the global leaderboard. Prestige to record your run!
          </div>
        </div>
      )}

      {/* Leaderboard Table */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-cyan-900/20 bg-card p-8 text-center">
          <div className="mb-3"><GameIcon icon="gi:trophy" size={28} /></div>
          <div className="text-sm text-gray-400 font-medium">No entries yet</div>
          <div className="text-xs text-gray-600 mt-1">
            Be the first to prestige and claim the #1 spot!
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const isExpanded = expandedEntry === entry.id;
            const isCurrentUser = user?.id === entry.user_id;
            const rankInfo = getRankForScore(entry.score);
            return (
              <div
                key={entry.id}
                className={`rounded-lg border ${
                  isCurrentUser
                    ? 'bg-cyan-900/15 border-cyan-500/40 ring-1 ring-cyan-500/20'
                    : entry.rank <= 3
                      ? getRankBadgeBg(entry.rank)
                      : 'bg-card border-cyan-900/20'
                } ${isExpanded ? 'ring-1 ring-cyan-900/30' : ''}`}
              >
                {/* Main Row */}
                <button
                  onClick={() => toggleExpand(entry.id)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors"
                >
                  {/* Rank Badge */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${getRankBadgeColor(entry.rank)} flex items-center justify-center text-xs font-bold text-white shadow-lg`}>
                    {getRankIcon(entry.rank)}
                  </div>

                  {/* Corporation Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-200 truncate">
                        {entry.corporation_name}
                      </span>
                      {isCurrentUser && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 border-cyan-500/40 text-cyan-400 bg-cyan-900/30">
                          YOU
                        </Badge>
                      )}
                      {entry.rank_name ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400 flex-shrink-0">
                          {entry.rank_name}
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/80 text-gray-400 flex-shrink-0">
                          <GameIcon icon={rankInfo.icon} size={12} className="inline-flex" /> {rankInfo.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-500">
                      <span className="flex items-center gap-0.5">
                        <Building2 className="w-3 h-3" />{entry.buildings_built}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <FlaskConical className="w-3 h-3" />{entry.research_completed}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <ScrollText className="w-3 h-3" />{entry.contracts_completed}
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
                  <div className="overflow-hidden">
                    <div className="px-3 pb-3 pt-0 border-t border-gray-800/50">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                        <div className="bg-[#0a0e17] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Coins className="w-3 h-3 text-success" /> Money Earned
                          </div>
                          <div className="text-xs font-mono text-success">${formatNumber(entry.total_money_earned)}</div>
                        </div>
                        <div className="bg-[#0a0e17] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-cyan-400" /> Buildings
                          </div>
                          <div className="text-xs font-mono text-cyan-400">{entry.buildings_built}</div>
                        </div>
                        <div className="bg-[#0a0e17] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <FlaskConical className="w-3 h-3 text-purple-400" /> Research
                          </div>
                          <div className="text-xs font-mono text-purple-400">{entry.research_completed}</div>
                        </div>
                        <div className="bg-[#0a0e17] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <ScrollText className="w-3 h-3 text-rose-400" /> Contracts
                          </div>
                          <div className="text-xs font-mono text-rose-400">{entry.contracts_completed}</div>
                        </div>
                        <div className="bg-[#0a0e17] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-yellow-400" /> Play Time
                          </div>
                          <div className="text-xs font-mono text-yellow-400">{formatPlayTime(entry.play_time_ticks)}</div>
                        </div>
                        <div className="bg-[#0a0e17] rounded-lg p-3">
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <RotateCcw className="w-3 h-3 text-fuchsia-400" /> Prestiges
                          </div>
                          <div className="text-xs font-mono text-fuchsia-400">{entry.prestige_count}</div>
                        </div>
                      </div>
                      <div className="text-[10px] text-gray-600 mt-2 flex items-center justify-between">
                        <span>Recorded at Tick #{formatNumber(entry.game_tick)}</span>
                        <span>{timeAgo(entry.created_at)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Summary */}
      {stats && (
        <div className="rounded-lg border border-cyan-900/20 bg-card p-3">
          <div className="text-xs text-gray-400 font-medium mb-2">Global Leaderboard Stats</div>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-sm font-mono font-bold text-amber-400">
                {formatNumber(stats.bestScore)}
              </div>
              <div className="text-[10px] text-gray-500">Best Score</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono font-bold text-cyan-400">
                {stats.uniquePlayers}
              </div>
              <div className="text-[10px] text-gray-500">Players</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono font-bold text-purple-400">
                {stats.totalRuns}
              </div>
              <div className="text-[10px] text-gray-500">Total Runs</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-mono font-bold text-fuchsia-400">
                {stats.totalPrestiges}
              </div>
              <div className="text-[10px] text-gray-500">Total Prestiges</div>
            </div>
          </div>
        </div>
      )}

      {/* Info Card */}
      <div className="bg-card border border-cyan-900/20 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Trophy className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-gray-500 space-y-1">
            <p>
              <span className="text-gray-400 font-semibold">How it works:</span> The leaderboard records your score every time you prestige (Global Expand).
              Scores are validated server-side to prevent cheating.
            </p>
            <p>
              <span className="text-amber-400 font-semibold">Score formula:</span> Total Money Earned + Buildings × 100 + Research × 200 + Contracts × 50 + Prestiges × 500
            </p>
            <p>
              <span className="text-success font-semibold">Requirement:</span> You must be signed in to submit scores. Guest progress is local-only and won&apos;t appear on the leaderboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
