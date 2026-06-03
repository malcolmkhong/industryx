'use client';

import React, { useMemo, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META, CONTRACT_TEMPLATES, TIER_INFO } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ScrollText, Package, Clock, Check, X, AlertTriangle,
  Star, Trophy, Coins, FlaskConical, Globe, Lock, ChevronDown, ChevronRight
} from 'lucide-react';
import { ResourceType, Contract } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { LoadingSpinner } from '@/components/game/shared/LoadingSpinner';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { GameCard } from '@/components/game/shared/GameCard';
import { GameIcon } from '@/components/game/shared/GameIcon';

const TIER_COLORS = ['#a0a0a0', '#22d3ee', '#f97316', '#a855f7'];

function getTierColor(tier: number): string {
  return TIER_COLORS[tier] ?? '#a0a0a0';
}

function getTierBorderColor(tier: number): string {
  const info = TIER_INFO[tier];
  return info?.borderColor ?? 'rgba(160,160,160,0.3)';
}

function ContractCard({ contract, store, fulfillingId, onFulfill }: { contract: Contract; store: ReturnType<typeof useGameStore>; fulfillingId: string | null; onFulfill: (id: string) => void }) {
  const timePct = (contract.timeRemaining / contract.timeLimit) * 100;
  const canFulfill = contract.requiredResources.every(r => (store.resources[r.resource] ?? 0) >= r.amount);
  const isUrgent = timePct < 25;
  const tier = contract.gameTier ?? 0;
  const tierColor = getTierColor(tier);
  const tierInfo = TIER_INFO[tier];

  return (
    <GameItemTooltip
      name={contract.name}
      icon={contract.icon}
      description={contract.description}
      category={contract.type}
      tier={tier}
      details={[
        ...contract.requiredResources.filter(r => RESOURCE_META[r.resource]).map(r => ({
          label: `Required: ${RESOURCE_META[r.resource].name}`,
          value: `${formatNumber(r.amount)}`,
          color: store.resources[r.resource] >= r.amount ? 'text-green-400' : 'text-red-400',
        })),
        { label: 'Tier', value: `${tierInfo?.name ?? 'Unknown'}`, color: `text-[${tierColor}]` },
        { label: 'Time Limit', value: `${formatNumber(contract.timeLimit)} ticks` },
        { label: 'Difficulty', value: `${'★'.repeat(contract.difficulty)}`, color: contract.difficulty >= 4 ? 'text-red-400' : contract.difficulty >= 3 ? 'text-orange-400' : 'text-gray-300' },
        { label: 'Money Reward', value: `$${formatNumber(contract.reward.money)}`, color: 'text-green-400' },
        ...(contract.reward.researchPoints ? [{ label: 'RP Reward', value: `${contract.reward.researchPoints} RP`, color: 'text-purple-400' as string }] : []),
        ...(contract.reward.corporationPoints && contract.reward.corporationPoints > 0 ? [{ label: 'CP Reward', value: `${contract.reward.corporationPoints} CP`, color: 'text-fuchsia-400' as string }] : []),
      ]}
      side="right"
    >
      <div className={`bg-[#0a0e17] rounded-lg p-4 border-l-2 ${
        isUrgent ? 'border-l-red-500 border border-red-900/50' :
        canFulfill ? 'border-l-green-500 border border-green-900/30' :
        `border border-gray-800`
      }`} style={{ borderLeftColor: tierColor }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <GameIcon icon={contract.icon} size={20} className="inline-flex" />
            <div>
              <div className="text-xs font-medium text-gray-200">{contract.name}</div>
              <div className="text-[10px] text-gray-400">{contract.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Tier Badge */}
            <Badge
              variant="outline"
              className="text-[9px] border-0 px-1.5"
              style={{ backgroundColor: tierInfo?.bgColor, color: tierColor, borderColor: tierInfo?.borderColor }}
            >
              {tierInfo?.icon && <GameIcon icon={tierInfo.icon} size={12} className="inline-flex" />} T{tier}
            </Badge>
            <Badge variant="outline" className={`text-[9px] ${
              contract.difficulty >= 4 ? 'border-red-600 text-red-400' :
              contract.difficulty >= 3 ? 'border-orange-600 text-orange-400' :
              'border-gray-600 text-gray-400'
            }`}>
              {'★'.repeat(contract.difficulty)}
            </Badge>
            <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-500 hidden sm:inline-flex">
              {contract.type}
            </Badge>
          </div>
        </div>

        {/* Required Resources */}
        <div className="flex flex-wrap gap-2 mb-3">
          {contract.requiredResources.filter(r => RESOURCE_META[r.resource]).map((r, i) => {
            const meta = RESOURCE_META[r.resource];
            const have = store.resources[r.resource] ?? 0;
            const enough = have >= r.amount;
            return (
              <div key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-colors duration-300 ${
                enough ? 'bg-green-900/10 text-green-400' : 'bg-red-900/10 text-red-400'
              }`}>
                <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                <span className="font-mono">{formatNumber(have)}/{formatNumber(r.amount)}</span>
              </div>
            );
          })}
        </div>

        {/* Time remaining */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500">
              <Clock className="w-2.5 h-2.5 inline mr-0.5" />
              Time Remaining
            </span>
            <span className={`font-mono ${isUrgent ? 'text-red-400' : 'text-gray-400'}`}>
              {formatNumber(contract.timeRemaining)} / {formatNumber(contract.timeLimit)} ticks
            </span>
          </div>
          <div
            className="h-2 bg-gray-800 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(timePct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${contract.name} time remaining`}
          >
            <div
              className={`h-full rounded-full transition-all ${
                isUrgent ? 'bg-red-500 neon-pulse' : timePct < 50 ? 'bg-yellow-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${timePct}%` }}
            />
          </div>
        </div>

        {/* Rewards */}
        <div className="flex items-center gap-3 mb-3 text-[10px]">
          <div className="flex items-center gap-1 text-green-400">
            <Coins className="w-3 h-3" />
            <span className="font-mono">${formatNumber(contract.reward.money)}</span>
          </div>
          {contract.reward.researchPoints && (
            <div className="flex items-center gap-1 text-purple-400">
              <FlaskConical className="w-3 h-3" />
              <span className="font-mono">{contract.reward.researchPoints} RP</span>
            </div>
          )}
          {contract.reward.corporationPoints && contract.reward.corporationPoints > 0 && (
            <div className="flex items-center gap-1 text-fuchsia-400">
              <Globe className="w-3 h-3" />
              <span className="font-mono">{contract.reward.corporationPoints} CP</span>
            </div>
          )}
        </div>

        {/* Fulfill button */}
        <Button
          onClick={() => onFulfill(contract.id)}
          disabled={!canFulfill || fulfillingId === contract.id}
          className={`w-full text-xs h-8 min-h-[36px] ${canFulfill ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-800 text-gray-500'}`}
          size="sm"
        >
          {fulfillingId === contract.id ? (
            <LoadingSpinner />
          ) : canFulfill ? (
            <><Check className="w-3.5 h-3.5 mr-1" /> Fulfill Contract</>
          ) : (
            <><Package className="w-3.5 h-3.5 mr-1" /> Need More Resources</>
          )}
        </Button>
      </div>
    </GameItemTooltip>
  );
}

const MemoizedContractCard = React.memo(ContractCard);

export function ContractPanel() {
  const store = useGameStore();
  const [selectedTierFilter, setSelectedTierFilter] = useState<number | null>(null);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);

  const handleFulfill = (id: string) => {
    setFulfillingId(id);
    store.fulfillContract(id);
    setTimeout(() => setFulfillingId(null), 300);
  };

  const playerTier = store.getPlayerGameTier();
  const activeContracts = store.contracts.filter(c => !c.completed && !c.failed);
  const completedContracts = store.contracts.filter(c => c.completed);
  const failedContracts = store.contracts.filter(c => c.failed);

  // Group active contracts by tier
  const contractsByTier = useMemo(() => {
    const groups: Record<number, Contract[]> = { 0: [], 1: [], 2: [], 3: [] };
    const filtered = selectedTierFilter !== null
      ? activeContracts.filter(c => (c.gameTier ?? 0) === selectedTierFilter)
      : activeContracts;
    filtered.forEach(c => {
      const tier = c.gameTier ?? 0;
      if (!groups[tier]) groups[tier] = [];
      groups[tier].push(c);
    });
    return groups;
  }, [activeContracts, selectedTierFilter]);

  // Count available contract templates per tier
  const templateCountByTier = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    CONTRACT_TEMPLATES.forEach(t => {
      const tier = t.gameTier ?? 0;
      counts[tier] = (counts[tier] || 0) + 1;
    });
    return counts;
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-rose-400 neon-glow-cyan tracking-wide">Contracts & Missions</h2>
          <p className="text-xs text-gray-500 mt-0.5">Complete deliveries for rewards — contracts scale with your tier</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-rose-500/50 text-rose-400 bg-rose-900/20 text-xs">
            <ScrollText className="w-3 h-3 mr-1" />
            {activeContracts.length} active
          </Badge>
          <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-900/20 text-xs">
            <Trophy className="w-3 h-3 mr-1" />
            {store.completedContracts} done
          </Badge>
        </div>
      </div>

      {/* Player Tier Progress Bar */}
      <GameCard>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: getTierColor(playerTier) }}>
              <GameIcon icon={TIER_INFO[playerTier]?.icon} size={14} className="inline-flex" /> Tier {playerTier}: {TIER_INFO[playerTier]?.name}
            </span>
          </div>
          <span className="text-[10px] text-gray-500">Contracts unlock as you advance</span>
        </div>
        <div className="flex gap-1 h-3">
          {[0, 1, 2, 3].map(tier => {
            const isUnlocked = tier <= playerTier;
            const isCurrent = tier === playerTier;
            return (
              <div
                key={tier}
                className={`flex-1 rounded-sm flex items-center justify-center text-[8px] font-bold transition-all ${
                  isUnlocked ? 'opacity-100' : 'opacity-30'
                } ${isCurrent ? 'ring-1 ring-white/20' : ''}`}
                style={{ backgroundColor: isUnlocked ? getTierColor(tier) : '#1e293b', color: isUnlocked ? '#000' : '#555' }}
              >
                {isUnlocked ? `T${tier}` : <Lock className="w-2 h-2" />}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1.5 text-[9px] text-gray-600">
          {[0, 1, 2, 3].map(tier => (
            <span key={tier} style={{ color: tier <= playerTier ? getTierColor(tier) : undefined }}>
              {TIER_INFO[tier]?.name}
            </span>
          ))}
        </div>
      </GameCard>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <PanelStatCard
          icon={<ScrollText className="w-4 h-4" />}
          label="Active"
          value={activeContracts.length.toString()}
          subtext="In progress"
          color="rose"
          trend={activeContracts.length > 0 ? 'up' : 'neutral'}
        />
        <PanelStatCard
          icon={<Trophy className="w-4 h-4" />}
          label="Completed"
          value={completedContracts.length.toString()}
          subtext="Fulfilled"
          color="green"
          trend={completedContracts.length > 0 ? 'up' : 'neutral'}
        />
        <PanelStatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Failed"
          value={failedContracts.length.toString()}
          subtext="Expired"
          color="red"
          trend={failedContracts.length > 0 ? 'down' : 'neutral'}
        />
        <PanelStatCard
          icon={<Coins className="w-4 h-4" />}
          label="Total Earned"
          value={`$${formatNumber(completedContracts.reduce((s, c) => s + c.reward.money, 0))}`}
          subtext="From contracts"
          color="purple"
          trend={completedContracts.length > 0 ? 'up' : 'neutral'}
        />
      </div>

      {/* Tier Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-500">Filter:</span>
        <button
          onClick={() => setSelectedTierFilter(null)}
          aria-pressed={selectedTierFilter === null}
          className={`px-2 py-1 rounded-md text-[10px] font-medium ${
            selectedTierFilter === null
              ? 'bg-rose-900/30 text-rose-400 border border-rose-700/50'
              : 'bg-gray-900/30 text-gray-500 border border-gray-800 hover:bg-gray-800/50'
          }`}
        >
          All Tiers
        </button>
        {[0, 1, 2, 3].map(tier => {
          const isUnlocked = tier <= playerTier;
          const isActive = selectedTierFilter === tier;
          const count = contractsByTier[tier]?.length ?? 0;
          return (
            <button
              key={tier}
              onClick={() => setSelectedTierFilter(isActive ? null : tier)}
              disabled={!isUnlocked}
              aria-pressed={isActive}
              className={`px-2 py-1 rounded-md text-[10px] font-medium flex items-center gap-1 ${
                !isUnlocked
                  ? 'bg-gray-900/20 text-gray-700 border border-gray-800/50 cursor-not-allowed'
                  : isActive
                    ? 'border'
                    : 'bg-gray-900/30 text-gray-400 border border-gray-800 hover:bg-gray-800/50'
              }`}
              style={isActive && isUnlocked ? {
                backgroundColor: TIER_INFO[tier]?.bgColor,
                color: getTierColor(tier),
                borderColor: TIER_INFO[tier]?.borderColor,
              } : undefined}
            >
              {isUnlocked ? (
                <>
                  <GameIcon icon={TIER_INFO[tier]?.icon} size={12} className="inline-flex" /> T{tier}
                  {count > 0 && <span className="bg-gray-800 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px]">{count}</span>}
                </>
              ) : (
                <>
                  <Lock className="w-2.5 h-2.5" /> T{tier}
                </>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active Contracts - Grouped by Tier */}
        <div className="lg:col-span-2 space-y-4">
          {activeContracts.length === 0 ? (
            <GameCard className="p-8 text-center">
              <ScrollText className="w-10 h-10 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No contracts available. Keep playing to unlock new contracts!</p>
            </GameCard>
          ) : (
            // Group by tier
            [0, 1, 2, 3].filter(tier => (contractsByTier[tier]?.length ?? 0) > 0).map(tier => {
              const tierContracts = contractsByTier[tier];
              const info = TIER_INFO[tier];
              return (
                <div key={tier} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-4 rounded-full" style={{ backgroundColor: getTierColor(tier) }} />
                    <span className="text-xs font-semibold" style={{ color: getTierColor(tier) }}>
                      <GameIcon icon={info?.icon} size={12} className="inline-flex" /> Tier {tier}: {info?.name}
                    </span>
                    <span className="text-[10px] text-gray-600">({tierContracts.length} contract{tierContracts.length !== 1 ? 's' : ''})</span>
                    <div className="flex-1 h-px" style={{ backgroundColor: TIER_INFO[tier]?.borderColor }} />
                  </div>
                  <div className="space-y-3">
                    {tierContracts.map(contract => (
                      <MemoizedContractCard key={contract.id} contract={contract} store={store} fulfillingId={fulfillingId} onFulfill={handleFulfill} />
                    ))}
                  </div>
                </div>
              );
            })
          )}

          {/* Completed & Failed */}
          {(completedContracts.length > 0 || failedContracts.length > 0) && (
            <GameCard className="p-0">
              <button
                onClick={() => setExpandedHistory(!expandedHistory)}
                className="w-full flex items-center gap-2 p-4 hover:bg-white/[0.02] transition-colors"
                aria-label={expandedHistory ? 'Collapse contract history' : 'Expand contract history'}
                aria-expanded={expandedHistory}
              >
                <Trophy className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Contract History</h3>
                <span className="text-[10px] text-gray-600">({completedContracts.length} done, {failedContracts.length} failed)</span>
                <div className="ml-auto">
                  {expandedHistory ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                </div>
              </button>
              {expandedHistory && (
                <div className="px-4 pb-4 space-y-1.5 max-h-80 overflow-y-auto game-scrollbar">
                  {[...completedContracts.slice(-15).reverse(), ...failedContracts.slice(-5).reverse()].map(c => {
                    const tier = c.gameTier ?? 0;
                    return (
                      <div key={c.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${
                        c.completed ? 'bg-green-900/10' : 'bg-red-900/10'
                      }`}>
                        <div className="flex items-center gap-2">
                          <div className="w-1 h-3 rounded-full" style={{ backgroundColor: getTierColor(tier) }} />
                          <GameIcon icon={c.icon} size={14} className="inline-flex" />
                          <span className={c.completed ? 'text-green-400' : 'text-red-400'}>{c.name}</span>
                          <span className="text-[9px] text-gray-600">T{tier}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.completed ? (
                            <Badge className="text-[8px] bg-green-900/20 text-green-400 border-0">
                              <Check className="w-2.5 h-2.5 mr-0.5" /> Done
                            </Badge>
                          ) : (
                            <Badge className="text-[8px] bg-red-900/20 text-red-400 border-0">
                              <X className="w-2.5 h-2.5 mr-0.5" /> Failed
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
            </GameCard>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Available Contract Pool by Tier */}
          <GameCard>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-rose-400">Contract Pool</h3>
            </div>
            <div className="space-y-2">
              {[0, 1, 2, 3].map(tier => {
                const isUnlocked = tier <= playerTier;
                const info = TIER_INFO[tier];
                const templateCount = templateCountByTier[tier] ?? 0;
                return (
                  <div key={tier} className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                    isUnlocked ? '' : 'opacity-40'
                  }`} style={{ backgroundColor: info?.bgColor }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTierColor(tier) }} />
                    <span className="font-medium" style={{ color: isUnlocked ? getTierColor(tier) : '#555' }}>
                      {info?.icon && <GameIcon icon={info.icon} size={12} className="inline-flex" />} T{tier}: {info?.name}
                    </span>
                    <span className="text-gray-500 ml-auto">{templateCount} types</span>
                    {!isUnlocked && <Lock className="w-3 h-3 text-gray-600" />}
                  </div>
                );
              })}
            </div>
          </GameCard>

          {/* Contract Stats */}
          <GameCard>
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-rose-400">Contract Stats</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Success Rate</span>
                <span className="text-green-400 font-mono">
                  {store.contracts.length > 0
                    ? ((completedContracts.length / store.contracts.length) * 100).toFixed(0)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Rewards</span>
                <span className="text-green-400 font-mono">${formatNumber(completedContracts.reduce((s, c) => s + c.reward.money, 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">RP Earned</span>
                <span className="text-purple-400 font-mono">{completedContracts.reduce((s, c) => s + (c.reward.researchPoints ?? 0), 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">CP Earned</span>
                <span className="text-fuchsia-400 font-mono">{completedContracts.reduce((s, c) => s + (c.reward.corporationPoints ?? 0), 0)}</span>
              </div>
            </div>
          </GameCard>

          {/* Tips */}
          <GameCard>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Contract Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>• Contracts now match your factory tier!</p>
              <p>• Higher tier = better rewards & CP</p>
              <p>• Build higher-tier buildings to unlock T1-T3 contracts</p>
              <p>• ★★★★+ contracts give Corporation Points</p>
              <p>• Fulfill early to avoid running out of time</p>
              <p>• Auto-Trading automation can auto-fulfill</p>
            </div>
          </GameCard>
        </div>
      </div>
    </div>
  );
}
