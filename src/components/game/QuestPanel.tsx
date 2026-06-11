'use client';

import React, { useState, useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { WEATHER_DEFS, TIER_INFO } from '@/lib/game/configCache';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { Pin, PinOff, Clock, Lock, Filter, ChevronDown, ChevronRight, Sparkles, ScrollText } from 'lucide-react';
import { GameCard } from '@/components/game/shared/GameCard';
import { Quest, QuestType } from '@/lib/game/types';
import { GameIcon } from '@/components/game/shared/GameIcon';

const TIER_COLORS = ['#a0a0a0', '#22d3ee', '#f97316', '#a855f7', '#00ffcc'];

function getTierColor(tier: number): string {
  return TIER_COLORS[tier] ?? '#a0a0a0';
}

const QUEST_TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  build: { label: 'BUILD', color: 'text-amber-400', bg: 'bg-amber-900/20', border: 'border-amber-800/40' },
  produce: { label: 'PRODUCE', color: 'text-cyan-400', bg: 'bg-cyan-900/20', border: 'border-cyan-800/40' },
  sell: { label: 'SELL', color: 'text-success', bg: 'bg-success/20', border: 'border-success/40' },
  research: { label: 'RESEARCH', color: 'text-purple-400', bg: 'bg-purple-900/20', border: 'border-purple-800/40' },
  earn: { label: 'EARN', color: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-800/40' },
  reach: { label: 'REACH', color: 'text-teal-400', bg: 'bg-teal-900/20', border: 'border-teal-800/40' },
  contract: { label: 'CONTRACT', color: 'text-blue-400', bg: 'bg-blue-900/20', border: 'border-blue-800/40' },
  transport: { label: 'TRANSPORT', color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-800/40' },
  worker: { label: 'WORKER', color: 'text-success', bg: 'bg-success/20', border: 'border-success/40' },
  prestige: { label: 'PRESTIGE', color: 'text-fuchsia-400', bg: 'bg-fuchsia-900/20', border: 'border-fuchsia-800/40' },
  megaProject: { label: 'MEGA', color: 'text-rose-400', bg: 'bg-rose-900/20', border: 'border-rose-800/40' },
};

const CATEGORY_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
  tutorial: { icon: 'gi:book-cover', label: 'Tutorial', color: 'text-cyan-400', bg: 'bg-cyan-900/20', border: 'border-cyan-800/40' },
  daily: { icon: 'gi:calendar', label: 'Daily', color: 'text-amber-400', bg: 'bg-amber-900/20', border: 'border-amber-800/40' },
  weekly: { icon: 'gi:calendar', label: 'Weekly', color: 'text-teal-400', bg: 'bg-teal-900/20', border: 'border-teal-800/40' },
  challenge: { icon: 'gi:medal', label: 'Challenge', color: 'text-rose-400', bg: 'bg-rose-900/20', border: 'border-rose-800/40' },
  milestone: { icon: 'gi:crown', label: 'Milestone', color: 'text-yellow-400', bg: 'bg-yellow-900/20', border: 'border-yellow-800/40' },
};

type FilterType = 'all' | 'active' | 'completed' | QuestType;

interface QuestItemProps {
  quest: Quest;
  isLocked: boolean;
  isTracked: boolean;
  onTrack: (id: string | null) => void;
  onClaim: (id: string) => void;
  gameTick: number;
}

const MemoizedQuestItem = React.memo(function MemoizedQuestItem({
  quest,
  isLocked,
  isTracked,
  onTrack,
  onClaim,
  gameTick,
}: QuestItemProps) {
  const allStepsComplete = quest.steps.every(s => s.completed);
  const progress = quest.steps.length > 0
    ? quest.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / quest.steps.length
    : 0;
  const tier = quest.gameTier ?? 0;
  const tierColor = getTierColor(tier);
  const tierInfo = TIER_INFO[tier];
  const typeConfig = QUEST_TYPE_CONFIG[quest.type] ?? QUEST_TYPE_CONFIG.build;
  const catConfig = CATEGORY_CONFIG[quest.category] ?? CATEGORY_CONFIG.challenge;

  return (
    <div
      className={`quest-card-hover rounded-xl border p-4 border-l-2 ${
        isLocked
          ? 'border-gray-800 bg-gray-900/20 cursor-not-allowed opacity-40'
          : quest.claimed
            ? 'border-gray-800 bg-gray-900/30 opacity-50'
            : allStepsComplete
              ? 'border-success/30 bg-success/10'
              : isTracked
                ? 'border-cyan-400/40 bg-cyan-900/10'
                : 'border-cyan-900/30 bg-card/50'
      }`} style={{ borderLeftColor: isLocked ? '#333' : tierColor }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GameItemTooltip
            name={quest.name}
            icon={quest.icon}
            description={quest.description}
            category={catConfig.label}
            tier={tier}
            details={[
              { label: 'Tier', value: `T${tier}: ${tierInfo?.name ?? 'Unknown'}`, color: tierColor, isStyle: true },
              { label: 'Type', value: typeConfig.label, color: typeConfig.color },
              { label: 'Category', value: catConfig.label, color: catConfig.color },
              ...(quest.reward.money > 0 ? [{ label: 'Money Reward', value: `$${formatNumber(quest.reward.money)}`, color: 'text-success' }] : []),
              ...(quest.reward.researchPoints && quest.reward.researchPoints > 0 ? [{ label: 'RP Reward', value: `${quest.reward.researchPoints}`, color: 'text-purple-400' }] : []),
              ...(quest.reward.corporationPoints && quest.reward.corporationPoints > 0 ? [{ label: 'CP Reward', value: `${quest.reward.corporationPoints}`, color: 'text-fuchsia-400' }] : []),
              ...quest.steps.map((step, i) => ({
                label: `Step ${i + 1}`,
                value: `${Math.min(step.current, step.target)}/${step.target} ${step.completed ? '✓' : ''}`,
                color: step.completed ? 'text-success' : 'text-gray-300',
              })),
              ...(quest.expiresAt && quest.expiresAt > 0 ? [{
                label: 'Time Remaining',
                value: `${Math.max(0, quest.expiresAt - gameTick)} ticks`,
                color: (quest.expiresAt - gameTick) > 100 ? 'text-cyan-300' : (quest.expiresAt - gameTick) > 30 ? 'text-amber-400' : 'text-red-400',
              }] : []),
            ]}
            side="right"
            disabled={quest.claimed || isLocked}
          >
            <div className="flex items-center gap-2 cursor-help min-w-0">
              <GameIcon icon={quest.icon} size={24} className="flex-shrink-0" />
              <div className="min-w-0">
                <h4 className={`text-sm font-semibold truncate ${
                  isLocked ? 'text-gray-600' :
                  quest.claimed ? 'text-gray-500 line-through'
                  : allStepsComplete ? 'text-success'
                  : isTracked ? 'text-cyan-300'
                  : 'text-gray-200'
                }`}>
                  {quest.name}
                </h4>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-[9px] px-1.5 py-0.5 rounded border"
                    style={{ color: tierColor, borderColor: tierInfo?.borderColor, backgroundColor: tierInfo?.bgColor }}>
                    <GameIcon icon={tierInfo?.icon} size={12} className="inline-flex" /> T{tier}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${catConfig.color} ${catConfig.bg} ${catConfig.border}`}>
                    {quest.category.toUpperCase()}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${typeConfig.color} ${typeConfig.bg} ${typeConfig.border}`}>
                    {typeConfig.label}
                  </span>
                  {isLocked && (
                    <span className="flex items-center gap-0.5 text-[9px] text-gray-600">
                      <Lock className="w-2.5 h-2.5" /> Requires T{tier} buildings
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{quest.description}</p>
              </div>
            </div>
          </GameItemTooltip>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isLocked && !quest.claimed && (
            <button
              onClick={() => onTrack(isTracked ? null : quest.id)}
              className={`p-1.5 rounded-lg ${
                isTracked
                  ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-900/60'
                  : 'bg-gray-800/50 text-gray-500 border border-gray-700/50 hover:text-gray-300 hover:bg-gray-800'
              }`}
              title={isTracked ? 'Untrack quest' : 'Track quest on dashboard'}
            >
              {isTracked ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          )}

          {isLocked ? (
            <Lock className="w-4 h-4 text-gray-600" />
          ) : quest.claimed ? (
            <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-1 rounded">CLAIMED</span>
          ) : allStepsComplete ? (
            <button
                onClick={() => onClaim(quest.id)}
                className="text-[11px] font-bold text-success bg-success/30 border border-success/30 px-3 py-1.5 rounded-lg hover:bg-success/50 transition-colors neon-breathe"
              >
                CLAIM
              </button>
          ) : (
            <span className="text-[10px] text-cyan-400 bg-cyan-900/20 px-2 py-1 rounded">
              {Math.round(progress * 100)}%
            </span>
          )}
        </div>
      </div>

      {!isLocked && (
        <div className="mt-3 space-y-1.5">
          {quest.steps.map((step, i) => {
            const stepProgress = Math.min(1, step.current / Math.max(1, step.target));
            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className={step.completed ? 'text-success' : 'text-gray-400'}>{step.description}</span>
                  <span className={step.completed ? 'text-success' : 'text-gray-500'}>
                    {Math.min(step.current, step.target)}/{step.target}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 progress-bar-shimmer ${
                      step.completed ? 'bg-success' : isTracked ? 'bg-cyan-400' : 'bg-cyan-500'
                    }`}
                    style={{ width: `${stepProgress * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLocked && (
        <div className="mt-3 flex items-center gap-2 text-[10px] pt-2 border-t border-gray-800/50">
          <span className="text-gray-600">Rewards:</span>
          {quest.reward.money > 0 && <span className="text-success">${formatNumber(quest.reward.money)}</span>}
          {quest.reward.researchPoints && quest.reward.researchPoints > 0 && <span className="text-purple-400">{quest.reward.researchPoints} RP</span>}
          {quest.reward.corporationPoints && quest.reward.corporationPoints > 0 && <span className="text-fuchsia-400">{quest.reward.corporationPoints} CP</span>}
        </div>
      )}
    </div>
  );
});

export function QuestPanel() {
  const store = useGameStore();
  const quests = store.quests;
  const playerTier = store.getPlayerGameTier();
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Group quests by gameTier
  const questsByTier: Record<number, Quest[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  quests.forEach(q => {
    const tier = q.gameTier ?? 0;
    if (!questsByTier[tier]) questsByTier[tier] = [];
    questsByTier[tier].push(q);
  });

  const completedCount = quests.filter(q => q.completed).length;
  const claimedCount = quests.filter(q => q.claimed).length;
  const totalCount = quests.length;
  const activeCount = quests.filter(q => !q.completed && !q.claimed).length;
  const unclaimedQuests = quests.filter(q => q.completed && !q.claimed);
  const availableReward = unclaimedQuests.reduce((sum, q) => sum + q.reward.money, 0);
  const availableRPReward = unclaimedQuests.reduce((sum, q) => sum + (q.reward.researchPoints ?? 0), 0);
  const availableCPReward = unclaimedQuests.reduce((sum, q) => sum + (q.reward.corporationPoints ?? 0), 0);

  // Filtered quests
  const filteredQuestsByTier = useMemo(() => {
    const result: Record<number, Quest[]> = {};
    for (const tier of [0, 1, 2, 3, 4]) {
      const tierQuests = questsByTier[tier] ?? [];
      result[tier] = tierQuests.filter(q => {
        if (filterType === 'all') return true;
        if (filterType === 'active') return !q.completed && !q.claimed;
        if (filterType === 'completed') return q.claimed;
        return q.type === filterType;
      });
    }
    return result;
  }, [questsByTier, filterType, quests]);

  const formatTimeRemaining = (ticks: number) => {
    if (ticks <= 0) return 'Expired';
    if (ticks < 60) return `${ticks} ticks`;
    const minutes = Math.floor(ticks / 60);
    if (minutes < 60) return `~${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `~${hours}h ${minutes % 60}m`;
  };

  const renderQuest = (quest: Quest, isLocked: boolean = false) => {
    const allStepsComplete = quest.steps.every(s => s.completed);
    const progress = quest.steps.length > 0
      ? quest.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / quest.steps.length
      : 0;
    const isTracked = store.trackedQuest === quest.id;
    const tier = quest.gameTier ?? 0;
    const tierColor = getTierColor(tier);
    const tierInfo = TIER_INFO[tier];
    const typeConfig = QUEST_TYPE_CONFIG[quest.type] ?? QUEST_TYPE_CONFIG.build;
    const catConfig = CATEGORY_CONFIG[quest.category] ?? CATEGORY_CONFIG.challenge;

    // Build tooltip details
    const tooltipDetails = [
      { label: 'Tier', value: `T${tier}: ${tierInfo?.name ?? 'Unknown'}`, color: tierColor, isStyle: true },
      { label: 'Type', value: typeConfig.label, color: typeConfig.color },
      { label: 'Category', value: catConfig.label, color: catConfig.color },
    ];

    if (quest.reward.money > 0) {
      tooltipDetails.push({ label: 'Money Reward', value: `$${formatNumber(quest.reward.money)}`, color: 'text-success' });
    }
    if (quest.reward.researchPoints && quest.reward.researchPoints > 0) {
      tooltipDetails.push({ label: 'RP Reward', value: `${quest.reward.researchPoints}`, color: 'text-purple-400' });
    }
    if (quest.reward.corporationPoints && quest.reward.corporationPoints > 0) {
      tooltipDetails.push({ label: 'CP Reward', value: `${quest.reward.corporationPoints}`, color: 'text-fuchsia-400' });
    }

    quest.steps.forEach((step, i) => {
      tooltipDetails.push({
        label: `Step ${i + 1}`,
        value: `${Math.min(step.current, step.target)}/${step.target} ${step.completed ? '✓' : ''}`,
        color: step.completed ? 'text-success' : 'text-gray-300',
      });
    });

    if (quest.expiresAt && quest.expiresAt > 0) {
      const remaining = quest.expiresAt - store.gameTick;
      tooltipDetails.push({
        label: 'Time Remaining',
        value: formatTimeRemaining(Math.max(0, remaining)),
        color: remaining > 100 ? 'text-cyan-300' : remaining > 30 ? 'text-amber-400' : 'text-red-400',
      });
    }

    return (
      <div
        key={quest.id}
        className={`quest-card-hover rounded-xl border p-4 border-l-2 ${
          isLocked
            ? 'border-gray-800 bg-gray-900/20 cursor-not-allowed opacity-40'
            : quest.claimed
              ? 'border-gray-800 bg-gray-900/30 opacity-50'
              : allStepsComplete
                ? 'border-success/30 bg-success/10'
                : isTracked
                  ? 'border-cyan-400/40 bg-cyan-900/10'
                  : 'border-cyan-900/30 bg-card/50'
        }`} style={{ borderLeftColor: isLocked ? '#333' : tierColor }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <GameItemTooltip
              name={quest.name}
              icon={quest.icon}
              description={quest.description}
              category={catConfig.label}
              tier={tier}
              details={tooltipDetails}
              side="right"
              disabled={quest.claimed || isLocked}
            >
              <div className="flex items-center gap-2 cursor-help min-w-0">
                <GameIcon icon={quest.icon} size={24} className="flex-shrink-0" />
                <div className="min-w-0">
                  <h4 className={`text-sm font-semibold truncate ${
                    isLocked ? 'text-gray-600' :
                    quest.claimed ? 'text-gray-500 line-through'
                    : allStepsComplete ? 'text-success'
                    : isTracked ? 'text-cyan-300'
                    : 'text-gray-200'
                  }`}>
                    {quest.name}
                  </h4>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {/* Tier Badge */}
                    <span className="text-[9px] px-1.5 py-0.5 rounded border"
                      style={{ color: tierColor, borderColor: tierInfo?.borderColor, backgroundColor: tierInfo?.bgColor }}>
                      <GameIcon icon={tierInfo?.icon} size={12} className="inline-flex" /> T{tier}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${catConfig.color} ${catConfig.bg} ${catConfig.border}`}>
                      {quest.category.toUpperCase()}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${typeConfig.color} ${typeConfig.bg} ${typeConfig.border}`}>
                      {typeConfig.label}
                    </span>
                    {quest.expiresAt && quest.expiresAt > 0 && !quest.claimed && !isLocked && (
                      <span className="flex items-center gap-0.5 text-[9px] text-amber-400">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTimeRemaining(Math.max(0, quest.expiresAt - store.gameTick))}
                      </span>
                    )}
                    {isLocked && (
                      <span className="flex items-center gap-0.5 text-[9px] text-gray-600">
                        <Lock className="w-2.5 h-2.5" /> Requires T{tier} buildings
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{quest.description}</p>
                </div>
              </div>
            </GameItemTooltip>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!isLocked && !quest.claimed && (
              <button
                onClick={() => store.setTrackedQuest(isTracked ? null : quest.id)}
                className={`p-1.5 rounded-lg ${
                  isTracked
                    ? 'bg-cyan-900/40 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-900/60'
                    : 'bg-gray-800/50 text-gray-500 border border-gray-700/50 hover:text-gray-300 hover:bg-gray-800'
                }`}
                title={isTracked ? 'Untrack quest' : 'Track quest on dashboard'}
              >
                {isTracked ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
            )}

            {isLocked ? (
              <Lock className="w-4 h-4 text-gray-600" />
            ) : quest.claimed ? (
              <span className="text-[10px] text-gray-600 bg-gray-800 px-2 py-1 rounded">CLAIMED</span>
            ) : allStepsComplete ? (
              <button
                  onClick={() => store.claimQuestReward(quest.id)}
                  className="text-[11px] font-bold text-success bg-success/30 border border-success/30 px-3 py-1.5 rounded-lg hover:bg-success/50 transition-colors neon-breathe"
                >
                  CLAIM
                </button>
            ) : (
              <span className="text-[10px] text-cyan-400 bg-cyan-900/20 px-2 py-1 rounded">
                {Math.round(progress * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Steps progress */}
        {!isLocked && (
          <div className="mt-3 space-y-1.5">
            {quest.steps.map((step, i) => {
              const stepProgress = Math.min(1, step.current / Math.max(1, step.target));
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className={step.completed ? 'text-success' : 'text-gray-400'}>{step.description}</span>
                    <span className={step.completed ? 'text-success' : 'text-gray-500'}>
                      {Math.min(step.current, step.target)}/{step.target}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 progress-bar-shimmer ${
                        step.completed ? 'bg-success' : isTracked ? 'bg-cyan-400' : 'bg-cyan-500'
                      }`}
                      style={{ width: `${stepProgress * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rewards */}
        {!isLocked && (
          <div className="mt-3 flex items-center gap-2 text-[10px] pt-2 border-t border-gray-800/50">
            <span className="text-gray-600">Rewards:</span>
            {quest.reward.money > 0 && <span className="text-success">${formatNumber(quest.reward.money)}</span>}
            {quest.reward.researchPoints && quest.reward.researchPoints > 0 && <span className="text-purple-400">{quest.reward.researchPoints} RP</span>}
            {quest.reward.corporationPoints && quest.reward.corporationPoints > 0 && <span className="text-fuchsia-400">{quest.reward.corporationPoints} CP</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2 neon-glow-cyan">
          <GameIcon icon="gi:scroll-unfurled" size={20} className="inline" /> Quest Board
        </h2>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-gray-400">{claimedCount}/{totalCount} Completed</span>
          <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all"
              style={{ width: `${totalCount > 0 ? (claimedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Claim All Button - prominent gradient */}
      {unclaimedQuests.length > 0 && (
        <button
          onClick={() => {
            unclaimedQuests.forEach(q => store.claimQuestReward(q.id));
          }}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-green-900/60 via-emerald-800/50 to-green-900/60 border border-green-400/40 text-success hover:from-green-800/70 hover:via-emerald-700/60 hover:to-green-800/70 hover:border-green-400/60 hover:text-green-200 shadow-[0_0_20px_rgba(74,222,128,0.15)]"
        >
          <Sparkles className="w-4 h-4" />
          Claim All Rewards ({unclaimedQuests.length} quest{unclaimedQuests.length > 1 ? 's' : ''})
          <span className="flex items-center gap-2 ml-1 text-xs">
            {availableReward > 0 && <span className="text-success">${formatNumber(availableReward)}</span>}
            {availableRPReward > 0 && <span className="text-purple-400">{formatNumber(availableRPReward)} RP</span>}
            {availableCPReward > 0 && <span className="text-fuchsia-400">{availableCPReward} CP</span>}
          </span>
        </button>
      )}

      {/* Tier Progress Bar */}
      <GameCard>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: getTierColor(playerTier) }}>
            Current Tier: <GameIcon icon={TIER_INFO[playerTier]?.icon} size={14} className="inline-flex" /> {TIER_INFO[playerTier]?.name}
          </span>
          <span className="text-[10px] text-gray-500">Quests unlock as you advance</span>
        </div>
        <div className="flex gap-1 h-3">
          {[0, 1, 2, 3, 4].map(tier => {
            const isUnlocked = tier <= playerTier;
            const isCurrent = tier === playerTier;
            const tierQuests = questsByTier[tier] ?? [];
            const completedInTier = tierQuests.filter(q => q.completed).length;
            return (
              <div
                key={tier}
                className={`flex-1 rounded-sm flex items-center justify-center text-[8px] font-bold ${
                  isUnlocked ? 'opacity-100' : 'opacity-30'
                } ${isCurrent ? 'ring-1 ring-white/20' : ''}`}
                style={{ backgroundColor: isUnlocked ? getTierColor(tier) : '#1e293b', color: isUnlocked ? '#000' : '#555' }}
              >
                {isUnlocked ? `${completedInTier}/${tierQuests.length}` : <Lock className="w-2 h-2" />}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] text-gray-600">
          {[0, 1, 2, 3, 4].map(tier => (
            <span key={tier} style={{ color: tier <= playerTier ? getTierColor(tier) : undefined }}>
              <GameIcon icon={TIER_INFO[tier]?.icon} size={14} className="inline-flex" /> {TIER_INFO[tier]?.name}
            </span>
          ))}
        </div>
      </GameCard>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Available reward */}
        <div className="rounded-xl p-3 text-center border border-success/30 bg-success/10">
          <div className="text-xl mb-1"><GameIcon icon="gi:present" size={20} /></div>
          <div className="text-lg font-bold text-success">${formatNumber(availableReward)}</div>
          <div className="text-[10px] text-gray-500">Available</div>
        </div>
        {[0, 1, 2, 3, 4].map(tier => {
          const tierQuests = questsByTier[tier] ?? [];
          const completed = tierQuests.filter(q => q.completed).length;
          const info = TIER_INFO[tier];
          const isUnlocked = tier <= playerTier;
          return (
            <div key={tier} className={`rounded-xl p-3 text-center border ${
              isUnlocked ? '' : 'opacity-40'
            }`} style={{ borderColor: info?.borderColor, backgroundColor: info?.bgColor }}>
              <div className="text-xl mb-1"><GameIcon icon={info?.icon} size={24} /></div>
              <div className="text-lg font-bold" style={{ color: getTierColor(tier) }}>{completed}/{tierQuests.length}</div>
              <div className="text-[10px] text-gray-500">T{tier}: {info?.name}</div>
            </div>
          );
        })}
      </div>

      {/* Filter Bar */}
      <GameCard className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-cyan-400 transition-colors"
          >
            <Filter className="w-3 h-3" />
            Filter
            {showFilters ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {/* Quick filter pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { key: 'all' as FilterType, label: 'All', count: totalCount },
              { key: 'active' as FilterType, label: 'Active', count: activeCount },
              { key: 'completed' as FilterType, label: 'Done', count: claimedCount },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterType(f.key)}
                className={`text-[9px] px-2 py-1 rounded-full border ${
                  filterType === f.key
                    ? 'border-cyan-500/50 bg-cyan-900/30 text-cyan-400'
                    : 'border-gray-800 bg-gray-900/30 text-gray-500 hover:text-gray-300'
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          {filterType !== 'all' && (
            <button
              onClick={() => setFilterType('all')}
              className="text-[9px] text-cyan-400 hover:text-cyan-300 ml-auto"
            >
              Clear filter ✕
            </button>
          )}
        </div>
          {showFilters && (
            <div
              className="overflow-hidden"
            >
              <div className="pt-3 flex flex-wrap gap-1.5 border-t border-gray-800/50 mt-2">
                {/* Quest type filters */}
                <span className="text-[9px] text-gray-600 w-full mb-1">By Type:</span>
                {Object.entries(QUEST_TYPE_CONFIG).map(([key, config]) => {
                  const count = quests.filter(q => q.type === key).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilterType(key as FilterType)}
                      className={`text-[9px] px-2 py-1 rounded border ${
                        filterType === key
                          ? `${config.bg} ${config.border} ${config.color}`
                          : 'border-gray-800 bg-gray-900/30 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {config.label} ({count})
                    </button>
                  );
                })}
                {/* Category filters */}
                <span className="text-[9px] text-gray-600 w-full mb-1 mt-2">By Category:</span>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                  const count = quests.filter(q => q.category === key).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilterType(key as FilterType)}
                      className={`text-[9px] px-2 py-1 rounded border ${
                        filterType === key
                          ? `${config.bg} ${config.border} ${config.color}`
                          : 'border-gray-800 bg-gray-900/30 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <GameIcon icon={config.icon} size={12} className="inline" /> {config.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
      </GameCard>

      {/* Tracked Quest Indicator */}
      {store.trackedQuest && (() => {
        const trackedQuestData = quests.find(q => q.id === store.trackedQuest);
        if (!trackedQuestData || trackedQuestData.claimed) return null;
        const tProgress = trackedQuestData.steps.length > 0
          ? trackedQuestData.steps.reduce((sum, s) => sum + Math.min(1, s.current / Math.max(1, s.target)), 0) / trackedQuestData.steps.length
          : 0;
        return (
          <div className="bg-gradient-to-r from-cyan-900/20 to-teal-900/10 border border-cyan-500/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Pin className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[10px] text-cyan-400 uppercase tracking-wider font-semibold">Tracked Quest</span>
              </div>
              <button
                onClick={() => store.setTrackedQuest(null)}
                className="text-gray-500 hover:text-gray-300 text-[10px] p-1 rounded hover:bg-gray-800/50 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <GameIcon icon={trackedQuestData.icon} size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{trackedQuestData.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full transition-all"
                      style={{ width: `${tProgress * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-cyan-400 font-mono">{Math.round(tProgress * 100)}%</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              {trackedQuestData.reward.money > 0 && <span className="text-success">${formatNumber(trackedQuestData.reward.money)}</span>}
              {trackedQuestData.reward.researchPoints && trackedQuestData.reward.researchPoints > 0 && <span className="text-purple-400">{trackedQuestData.reward.researchPoints} RP</span>}
              {trackedQuestData.reward.corporationPoints && trackedQuestData.reward.corporationPoints > 0 && <span className="text-fuchsia-400">{trackedQuestData.reward.corporationPoints} CP</span>}
            </div>
          </div>
        );
      })()}

      {/* Quest sections by Tier */}
      {[0, 1, 2, 3, 4].map(tier => {
        const tierQuests = filteredQuestsByTier[tier];
        if (!tierQuests || tierQuests.length === 0) return null;
        const isUnlocked = tier <= playerTier;
        const info = TIER_INFO[tier];
        const completed = tierQuests.filter(q => q.completed).length;
        return (
          <div key={tier} className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-5 rounded-full" style={{ backgroundColor: getTierColor(tier) }} />
              <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: getTierColor(tier) }}>
                <GameIcon icon={info?.icon} size={14} className="inline-flex" /> Tier {tier}: {info?.name}
              </h3>
              <span className="text-[10px] text-gray-600">{completed}/{tierQuests.length} completed</span>
              {!isUnlocked && (
                <span className="text-[9px] text-gray-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Locked — build T{tier} buildings to unlock
                </span>
              )}
              <div className="flex-1 h-px" style={{ backgroundColor: info?.borderColor }} />
            </div>
            <div className="space-y-2.5">
              {tierQuests.map(quest => (
                <MemoizedQuestItem
                  key={quest.id}
                  quest={quest}
                  isLocked={!isUnlocked}
                  isTracked={store.trackedQuest === quest.id}
                  onTrack={store.setTrackedQuest}
                  onClaim={store.claimQuestReward}
                  gameTick={store.gameTick}
                />
              ))}
            </div>
          </div>
        );
      })}

      {quests.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <ScrollText className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">No quests match your current filter.</p>
        </div>
      )}
    </div>
  );
}
