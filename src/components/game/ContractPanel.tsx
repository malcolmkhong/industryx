'use client';

import { useMemo, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ScrollText, Package, Clock, Check, X, AlertTriangle,
  Star, Trophy, Coins, FlaskConical, Globe, Lock, ChevronDown, ChevronRight,
  RefreshCw, Swords, Zap, Gem, Trash2,
} from 'lucide-react';
import { ResourceType, Contract, ContractDifficulty, CONTRACT_DIFFICULTY_META } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
// Difficulty tier visual config
const DIFFICULTY_CONFIG: Record<ContractDifficulty, {
  gradient: string;
  borderColor: string;
  glowClass: string;
  icon: React.ReactNode;
  stars: string;
}> = {
  easy: {
    gradient: 'from-green-900/20 to-green-800/5',
    borderColor: 'border-green-500/30',
    glowClass: '',
    icon: <span className="text-green-400">🟢</span>,
    stars: '★',
  },
  medium: {
    gradient: 'from-yellow-900/20 to-yellow-800/5',
    borderColor: 'border-yellow-500/30',
    glowClass: '',
    icon: <span className="text-yellow-400">🟡</span>,
    stars: '★★',
  },
  hard: {
    gradient: 'from-red-900/20 to-red-800/5',
    borderColor: 'border-red-500/30',
    glowClass: 'shadow-[0_0_12px_rgba(239,68,68,0.1)]',
    stars: '★★★★',
    icon: <span className="text-red-400">🔴</span>,
  },
  legendary: {
    gradient: 'from-purple-900/30 to-purple-800/5',
    borderColor: 'border-purple-500/40',
    glowClass: 'shadow-[0_0_20px_rgba(168,85,247,0.15)]',
    stars: '★★★★★',
    icon: <span className="text-purple-400">💎</span>,
  },
};

// Contract card for board (unaccepted) or active (accepted)
function ContractCard({ contract }: { contract: Contract }) {
  const store = useGameStore();
  const isAccepted = contract.accepted;
  const isCompleted = contract.completed;
  const isFailed = contract.failed;
  const difficultyTier = contract.difficultyTier || 'easy';
  const diffConfig = DIFFICULTY_CONFIG[difficultyTier];
  const meta = CONTRACT_DIFFICULTY_META[difficultyTier];
  const canFulfill = isAccepted && !isCompleted && !isFailed && contract.requiredResources.every(r => {
    if (r.resource === 'money') return true;
    return (store.resources[r.resource as ResourceType] ?? 0) >= r.amount;
  });
  const timePct = contract.timeLimit > 0 ? (contract.timeRemaining / contract.timeLimit) * 100 : 0;
  const isUrgent = isAccepted && timePct < 25;

  // Expiration for unaccepted contracts
  const expiresTicks = !isAccepted && contract.expiresAt ? contract.expiresAt - store.gameTick : null;
  const isExpiring = expiresTicks !== null && expiresTicks < 200;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-xl bg-gradient-to-br ${diffConfig.gradient} border ${diffConfig.borderColor} ${diffConfig.glowClass} overflow-hidden ${
        isCompleted ? 'opacity-60' : isFailed ? 'opacity-40' : ''
      }`}
      style={{ borderLeftWidth: '3px', borderLeftColor: meta.color }}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">{contract.emoji}</span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-gray-200 truncate">{contract.name}</div>
              <div className="text-[9px] text-gray-500 truncate">{contract.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {/* Difficulty badge */}
            <Badge
              className="text-[8px] px-1.5 py-0 border-0"
              style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
            >
              {meta.icon} {meta.label}
            </Badge>
            {/* Type badge */}
            <Badge variant="outline" className="text-[8px] px-1 py-0 border-gray-700 text-gray-500 hidden sm:inline-flex">
              {contract.type}
            </Badge>
          </div>
        </div>

        {/* Required Resources */}
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {contract.requiredResources.filter(r => RESOURCE_META[r.resource as ResourceType]).map((r, i) => {
            const resMeta = RESOURCE_META[r.resource as ResourceType];
            const have = store.resources[r.resource as ResourceType] ?? 0;
            const enough = have >= r.amount;
            return (
              <div key={i} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] ${
                enough ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                <span className="text-xs">{resMeta?.emoji}</span>
                <span className="font-mono">{formatNumber(have)}/{formatNumber(r.amount)}</span>
              </div>
            );
          })}
        </div>

        {/* Progress bar for resource fulfillment */}
        {isAccepted && !isCompleted && (
          <div className="mb-2">
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${contract.progress * 100}%`,
                  backgroundColor: contract.progress >= 1 ? '#22c55e' : meta.color,
                }}
              />
            </div>
          </div>
        )}

        {/* Time remaining (for accepted) or Expiration (for board) */}
        {isAccepted && !isCompleted ? (
          <div className="mb-2.5">
            <div className="flex items-center justify-between text-[9px] mb-1">
              <span className="text-gray-500"><Clock className="w-2.5 h-2.5 inline mr-0.5" /> Deadline</span>
              <span className={`font-mono ${isUrgent ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
                {formatNumber(contract.timeRemaining)}/{formatNumber(contract.timeLimit)}t
              </span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  isUrgent ? 'bg-red-500' : timePct < 50 ? 'bg-yellow-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${timePct}%` }}
              />
            </div>
          </div>
        ) : !isAccepted && !isFailed && expiresTicks !== null ? (
          <div className="mb-2.5">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-gray-600"><Clock className="w-2.5 h-2.5 inline mr-0.5" /> Board expires in</span>
              <span className={`font-mono ${isExpiring ? 'text-amber-400' : 'text-gray-500'}`}>
                {formatNumber(expiresTicks)}t
              </span>
            </div>
          </div>
        ) : null}

        {/* Rewards */}
        <div className="flex items-center gap-3 mb-2.5 text-[10px]">
          <div className="flex items-center gap-1 text-green-400">
            <Coins className="w-3 h-3" />
            <span className="font-mono">${formatNumber(contract.reward.money)}</span>
          </div>
          {contract.reward.researchPoints ? (
            <div className="flex items-center gap-1 text-purple-400">
              <FlaskConical className="w-3 h-3" />
              <span className="font-mono">{contract.reward.researchPoints} RP</span>
            </div>
          ) : null}
          {contract.reward.corporationPoints && contract.reward.corporationPoints > 0 ? (
            <div className="flex items-center gap-1 text-fuchsia-400">
              <Globe className="w-3 h-3" />
              <span className="font-mono">{contract.reward.corporationPoints} CP</span>
            </div>
          ) : null}
          {contract.reward.rareResources && contract.reward.rareResources.length > 0 && (
            <div className="flex items-center gap-1 text-amber-400">
              <Gem className="w-3 h-3" />
              {contract.reward.rareResources.map((rr, i) => {
                const rrMeta = RESOURCE_META[rr.resource];
                return <span key={i} className="font-mono">{rrMeta?.emoji} {rr.amount}</span>;
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        {isCompleted ? (
          <Badge className="w-full justify-center text-[10px] bg-green-900/20 text-green-400 border-0 h-7">
            <Check className="w-3 h-3 mr-1" /> Completed
          </Badge>
        ) : isFailed ? (
          <Badge className="w-full justify-center text-[10px] bg-red-900/20 text-red-400 border-0 h-7">
            <X className="w-3 h-3 mr-1" /> {contract.accepted ? 'Failed' : 'Expired'}
          </Badge>
        ) : !isAccepted ? (
          <div className="flex gap-2">
            <Button
              onClick={() => store.acceptContract(contract.id)}
              className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] h-7"
              size="sm"
            >
              <ScrollText className="w-3 h-3 mr-1" /> Accept Contract
            </Button>
            <Button
              onClick={() => store.abandonContract(contract.id)}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-gray-600 hover:text-red-400 hover:bg-red-900/20"
              aria-label="Dismiss contract"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={() => store.fulfillContract(contract.id)}
              disabled={!canFulfill}
              className={`flex-1 text-[10px] h-7 ${canFulfill ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-800 text-gray-500'}`}
              size="sm"
            >
              {canFulfill ? (
                <><Check className="w-3 h-3 mr-1" /> Fulfill Contract</>
              ) : (
                <><Package className="w-3 h-3 mr-1" /> Need Resources</>
              )}
            </Button>
            <Button
              onClick={() => store.abandonContract(contract.id)}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-gray-600 hover:text-red-400 hover:bg-red-900/20"
              aria-label="Abandon contract"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function ContractPanel() {
  const store = useGameStore();
  const [selectedDifficulty, setSelectedDifficulty] = useState<ContractDifficulty | 'all'>('all');
  const [showHistory, setShowHistory] = useState(false);

  const playerTier = store.getPlayerGameTier();

  // Separate board and active contracts
  const boardContracts = useMemo(() =>
    store.contracts.filter(c => !c.accepted && !c.completed && !c.failed),
    [store.contracts]
  );
  const activeContracts = useMemo(() =>
    store.contracts.filter(c => c.accepted && !c.completed && !c.failed),
    [store.contracts]
  );
  const completedContracts = useMemo(() =>
    store.contracts.filter(c => c.completed),
    [store.contracts]
  );
  const failedContracts = useMemo(() =>
    store.contracts.filter(c => c.failed),
    [store.contracts]
  );

  // Filter by difficulty
  const filteredBoard = useMemo(() => {
    if (selectedDifficulty === 'all') return boardContracts;
    return boardContracts.filter(c => c.difficultyTier === selectedDifficulty);
  }, [boardContracts, selectedDifficulty]);

  const filteredActive = useMemo(() => {
    if (selectedDifficulty === 'all') return activeContracts;
    return activeContracts.filter(c => c.difficultyTier === selectedDifficulty);
  }, [activeContracts, selectedDifficulty]);

  // Difficulty counts
  const difficultyCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, easy: 0, medium: 0, hard: 0, legendary: 0 };
    [...boardContracts, ...activeContracts].forEach(c => {
      counts.all++;
      counts[c.difficultyTier || 'easy']++;
    });
    return counts;
  }, [boardContracts, activeContracts]);

  // Stats
  const totalEarned = completedContracts.reduce((s, c) => s + c.reward.money, 0);
  const totalRP = completedContracts.reduce((s, c) => s + (c.reward.researchPoints ?? 0), 0);
  const totalCP = completedContracts.reduce((s, c) => s + (c.reward.corporationPoints ?? 0), 0);
  const successRate = store.contracts.length > 0
    ? ((completedContracts.length / Math.max(1, completedContracts.length + failedContracts.length)) * 100).toFixed(0)
    : '0';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-rose-400 neon-glow-cyan tracking-wide">Contract Board</h2>
          <p className="text-xs text-gray-500 mt-0.5">Dynamic contracts — unique material combinations every refresh</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-900/20 text-xs">
            <ScrollText className="w-3 h-3 mr-1" />
            {boardContracts.length} available
          </Badge>
          <Badge variant="outline" className="border-rose-500/50 text-rose-400 bg-rose-900/20 text-xs">
            <Swords className="w-3 h-3 mr-1" />
            {activeContracts.length}/5 active
          </Badge>
          <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-900/20 text-xs">
            <Trophy className="w-3 h-3 mr-1" />
            {store.completedContracts} done
          </Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="game-card rounded-lg bg-[#111827] p-2.5 border border-[#1e293b]">
          <div className="text-[9px] text-gray-500">Available</div>
          <div className="text-base font-bold font-mono text-amber-400">{boardContracts.length}</div>
        </div>
        <div className="game-card rounded-lg bg-[#111827] p-2.5 border border-[#1e293b]">
          <div className="text-[9px] text-gray-500">Active</div>
          <div className="text-base font-bold font-mono text-rose-400">{activeContracts.length}/5</div>
        </div>
        <div className="game-card rounded-lg bg-[#111827] p-2.5 border border-[#1e293b]">
          <div className="text-[9px] text-gray-500">Completed</div>
          <div className="text-base font-bold font-mono text-green-400">{completedContracts.length}</div>
        </div>
        <div className="game-card rounded-lg bg-[#111827] p-2.5 border border-[#1e293b]">
          <div className="text-[9px] text-gray-500">Total Earned</div>
          <div className="text-base font-bold font-mono text-purple-400">${formatNumber(totalEarned)}</div>
        </div>
        <div className="game-card rounded-lg bg-[#111827] p-2.5 border border-[#1e293b]">
          <div className="text-[9px] text-gray-500">Success Rate</div>
          <div className="text-base font-bold font-mono text-cyan-400">{successRate}%</div>
        </div>
      </div>

      {/* Difficulty Filter + Refresh */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-500">Filter:</span>
        {(['all', 'easy', 'medium', 'hard', 'legendary'] as const).map(diff => {
          const isActive = selectedDifficulty === diff;
          const count = difficultyCounts[diff] || 0;
          const isUnlocked = diff === 'all' || playerTier >= CONTRACT_DIFFICULTY_META[diff].minGameTier;

          if (diff !== 'all' && !isUnlocked) return null;

          return (
            <button
              key={diff}
              onClick={() => setSelectedDifficulty(diff)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
                isActive
                  ? 'ring-1'
                  : 'bg-gray-900/30 text-gray-400 border border-gray-800 hover:bg-gray-800/50'
              }`}
              style={isActive && diff !== 'all' ? {
                backgroundColor: `${CONTRACT_DIFFICULTY_META[diff as ContractDifficulty]?.color}22`,
                color: CONTRACT_DIFFICULTY_META[diff as ContractDifficulty]?.color,
                borderColor: `${CONTRACT_DIFFICULTY_META[diff as ContractDifficulty]?.color}55`,
              } : isActive ? {
                backgroundColor: 'rgba(244,63,94,0.15)',
                color: '#fb7185',
                borderColor: 'rgba(244,63,94,0.3)',
              } : undefined}
            >
              {diff === 'all' ? '📋 All' : CONTRACT_DIFFICULTY_META[diff]?.icon + ' ' + CONTRACT_DIFFICULTY_META[diff]?.label}
              {count > 0 && <span className="ml-0.5 text-[8px] opacity-70">({count})</span>}
            </button>
          );
        })}
        <div className="ml-auto">
          <Button
            onClick={() => store.refreshContractBoard()}
            variant="outline"
            size="sm"
            className="text-[10px] h-7 px-2.5 bg-[#111827] border-gray-700 text-gray-400 hover:text-rose-400 hover:border-rose-700/50"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh Board
          </Button>
        </div>
      </div>

      {/* Main Content: Board + Active */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Contract Board (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Available Contracts on Board */}
          {filteredBoard.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <ScrollText className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Available on Board</h3>
                <span className="text-[10px] text-gray-600">({filteredBoard.length} contracts)</span>
                <div className="flex-1 h-px bg-amber-500/20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredBoard.map(contract => (
                    <ContractCard key={contract.id} contract={contract} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Active Contracts */}
          {filteredActive.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Swords className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">Active Contracts</h3>
                <span className="text-[10px] text-gray-600">({filteredActive.length}/5)</span>
                <div className="flex-1 h-px bg-rose-500/20" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredActive.map(contract => (
                    <ContractCard key={contract.id} contract={contract} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Empty state */}
          {filteredBoard.length === 0 && filteredActive.length === 0 && (
            <div className="game-card rounded-xl bg-[#111827] p-8 border border-[#1e293b] text-center">
              <ScrollText className="w-10 h-10 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No contracts available</p>
              <p className="text-[10px] text-gray-600 mt-1">New contracts appear every ~200 ticks — or click "Refresh Board"</p>
            </div>
          )}

          {/* Contract History */}
          {(completedContracts.length > 0 || failedContracts.length > 0) && (
            <div className="game-card rounded-xl bg-[#111827] border border-[#1e293b]">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center gap-2 p-3 hover:bg-white/[0.02] transition-colors"
              >
                <Trophy className="w-4 h-4 text-green-400" />
                <h3 className="text-xs font-semibold text-green-400">Contract History</h3>
                <span className="text-[10px] text-gray-600">({completedContracts.length} done, {failedContracts.length} failed)</span>
                <div className="ml-auto">
                  {showHistory ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
                </div>
              </button>
              {showHistory && (
                <div className="px-3 pb-3 space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                  {[...completedContracts.slice(-20).reverse(), ...failedContracts.slice(-10).reverse()].map(c => {
                    const diffTier = c.difficultyTier || 'easy';
                    const diffMeta = CONTRACT_DIFFICULTY_META[diffTier];
                    return (
                      <div key={c.id} className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[10px] ${
                        c.completed ? 'bg-green-900/10' : 'bg-red-900/10'
                      }`}>
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-3 rounded-full" style={{ backgroundColor: diffMeta?.color }} />
                          <span>{c.emoji}</span>
                          <span className={c.completed ? 'text-green-400' : 'text-red-400'}>{c.name}</span>
                          <span className="text-[8px] text-gray-600">{diffMeta?.icon} {diffMeta?.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.completed ? (
                            <Badge className="text-[7px] bg-green-900/20 text-green-400 border-0 px-1">
                              <Check className="w-2 h-2 mr-0.5" /> Done
                            </Badge>
                          ) : (
                            <Badge className="text-[7px] bg-red-900/20 text-red-400 border-0 px-1">
                              <X className="w-2 h-2 mr-0.5" /> {c.accepted ? 'Failed' : 'Expired'}
                            </Badge>
                          )}
                          {c.completed && (
                            <span className="text-green-400 font-mono">${formatNumber(c.reward.money)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar (1/3) */}
        <div className="space-y-3">
          {/* Difficulty Tier Legend */}
          <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-2.5">
              <Star className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-semibold text-rose-400">Contract Tiers</h3>
            </div>
            <div className="space-y-2">
              {(['easy', 'medium', 'hard', 'legendary'] as ContractDifficulty[]).map(diff => {
                const meta = CONTRACT_DIFFICULTY_META[diff];
                const isUnlocked = playerTier >= meta.minGameTier;
                return (
                  <div key={diff} className={`p-2 rounded-lg border transition-all ${
                    isUnlocked ? 'bg-gray-800/30 border-gray-700/30' : 'bg-gray-900/20 border-gray-800/20 opacity-40'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs">{meta.icon}</span>
                      <span className="text-[10px] font-semibold" style={{ color: meta.color }}>
                        {meta.label}
                      </span>
                      {!isUnlocked && <Lock className="w-3 h-3 text-gray-600 ml-auto" />}
                      {isUnlocked && (
                        <span className="text-[8px] text-gray-500 ml-auto">
                          T{meta.minGameTier}+
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] text-gray-500">
                      {meta.materialCount[0]}–{meta.materialCount[1]} materials · {diff === 'easy' ? 'Long' : diff === 'medium' ? 'Moderate' : diff === 'hard' ? 'Short' : 'Very short'} deadline
                    </div>
                    <div className="text-[9px] text-gray-500">
                      {diff === 'legendary' ? '6× rewards + rare resources' : `${meta.rewardMultiplier}× rewards`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-2.5">
              <Star className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-semibold text-rose-400">Contract Stats</h3>
            </div>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Success Rate</span>
                <span className="text-green-400 font-mono">{successRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Rewards</span>
                <span className="text-green-400 font-mono">${formatNumber(totalEarned)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">RP Earned</span>
                <span className="text-purple-400 font-mono">{formatNumber(totalRP)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">CP Earned</span>
                <span className="text-fuchsia-400 font-mono">{formatNumber(totalCP)}</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertTriangle className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-semibold text-gray-400">Contract Tips</h3>
            </div>
            <div className="space-y-1.5 text-[10px] text-gray-500">
              <p>• Contracts are dynamically generated with random materials!</p>
              <p>• 🟢 Easy: 1-2 materials, long deadlines</p>
              <p>• 🟡 Medium: 2-4 materials, moderate deadlines</p>
              <p>• 🔴 Hard: 3-6 materials, short deadlines, 3.5× rewards</p>
              <p>• 💎 Legendary: 5-10 materials, rare resources!</p>
              <p>• Unaccepted contracts expire from the board</p>
              <p>• Click "Refresh Board" for new contract offers</p>
              <p>• Max 5 active contracts at a time</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
