'use client';

import { useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META, CONTRACT_TEMPLATES } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ScrollText, Package, Clock, Check, X, AlertTriangle,
  Star, Trophy, Coins, FlaskConical, Globe
} from 'lucide-react';
import { ResourceType, Contract } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';

export function ContractPanel() {
  const store = useGameStore();

  const activeContracts = store.contracts.filter(c => !c.completed && !c.failed);
  const completedContracts = store.contracts.filter(c => c.completed);
  const failedContracts = store.contracts.filter(c => c.failed);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-rose-400 neon-glow-cyan tracking-wide">Contracts & Missions</h2>
          <p className="text-xs text-gray-500 mt-0.5">Complete deliveries for rewards and reputation</p>
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

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-rose-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Active</div>
          <div className="text-lg font-bold font-mono text-rose-400">{activeContracts.length}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-green-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Completed</div>
          <div className="text-lg font-bold font-mono text-green-400">{completedContracts.length}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-red-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Failed</div>
          <div className="text-lg font-bold font-mono text-red-400">{failedContracts.length}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-purple-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Total Earned</div>
          <div className="text-lg font-bold font-mono text-purple-400">${formatNumber(completedContracts.reduce((s, c) => s + c.reward.money, 0))}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active Contracts */}
        <div className="lg:col-span-2 space-y-4">
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <ScrollText className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-semibold text-rose-400">Active Contracts</h3>
            </div>
            {activeContracts.length === 0 ? (
              <div className="text-center py-8">
                <ScrollText className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No active contracts</p>
                <p className="text-[10px] text-gray-600 mt-1">New contracts appear periodically — keep producing!</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto game-scrollbar">
                {activeContracts.map(contract => {
                  const timePct = (contract.timeRemaining / contract.timeLimit) * 100;
                  const canFulfill = contract.requiredResources.every(r => store.resources[r.resource] >= r.amount);
                  const isUrgent = timePct < 25;

                  return (
                    <GameItemTooltip
                      key={contract.id}
                      name={contract.name}
                      emoji={contract.emoji}
                      description={contract.description}
                      category={contract.type}
                      details={[
                        ...contract.requiredResources.map(r => ({
                          label: `Required: ${RESOURCE_META[r.resource].name}`,
                          value: `${formatNumber(r.amount)}`,
                          color: store.resources[r.resource] >= r.amount ? 'text-green-400' : 'text-red-400',
                        })),
                        { label: 'Time Limit', value: `${formatNumber(contract.timeLimit)} ticks` },
                        { label: 'Difficulty', value: `${'★'.repeat(contract.difficulty)}`, color: contract.difficulty >= 4 ? 'text-red-400' : contract.difficulty >= 3 ? 'text-orange-400' : 'text-gray-300' },
                        { label: 'Money Reward', value: `$${formatNumber(contract.reward.money)}`, color: 'text-green-400' },
                        ...(contract.reward.researchPoints ? [{ label: 'RP Reward', value: `${contract.reward.researchPoints} RP`, color: 'text-purple-400' as string }] : []),
                        ...(contract.reward.corporationPoints && contract.reward.corporationPoints > 0 ? [{ label: 'CP Reward', value: `${contract.reward.corporationPoints} CP`, color: 'text-fuchsia-400' as string }] : []),
                      ]}
                      side="right"
                    >
                    <div className={`bg-[#0a0e17] rounded-lg p-4 border ${
                      isUrgent ? 'border-red-900/50' : canFulfill ? 'border-green-900/30' : 'border-gray-800'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{contract.emoji}</span>
                          <div>
                            <div className="text-xs font-medium text-gray-200">{contract.name}</div>
                            <div className="text-[10px] text-gray-400">{contract.description}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[9px] ${
                            contract.difficulty >= 4 ? 'border-red-600 text-red-400' :
                            contract.difficulty >= 3 ? 'border-orange-600 text-orange-400' :
                            'border-gray-600 text-gray-400'
                          }`}>
                            {'★'.repeat(contract.difficulty)}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-500">
                            {contract.type}
                          </Badge>
                        </div>
                      </div>

                      {/* Required Resources */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        {contract.requiredResources.map((r, i) => {
                          const meta = RESOURCE_META[r.resource];
                          const have = store.resources[r.resource];
                          const enough = have >= r.amount;
                          return (
                            <div key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${
                              enough ? 'bg-green-900/10 text-green-400' : 'bg-red-900/10 text-red-400'
                            }`}>
                              <span className="text-sm">{meta.emoji}</span>
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
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
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
                        onClick={() => store.fulfillContract(contract.id)}
                        disabled={!canFulfill}
                        className={`w-full text-xs h-8 ${canFulfill ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-gray-800 text-gray-500'}`}
                        size="sm"
                      >
                        {canFulfill ? (
                          <><Check className="w-3.5 h-3.5 mr-1" /> Fulfill Contract</>
                        ) : (
                          <><Package className="w-3.5 h-3.5 mr-1" /> Need More Resources</>
                        )}
                      </Button>
                    </div>
                    </GameItemTooltip>
                  );
                })}
              </div>
            )}
          </div>

          {/* Completed & Failed */}
          {(completedContracts.length > 0 || failedContracts.length > 0) && (
            <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
              <div className="flex items-center gap-2 mb-3">
                <Trophy className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Contract History</h3>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto game-scrollbar">
                {[...completedContracts.slice(-10).reverse(), ...failedContracts.slice(-5).reverse()].map(c => (
                  <div key={c.id} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${
                    c.completed ? 'bg-green-900/10' : 'bg-red-900/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span>{c.emoji}</span>
                      <span className={c.completed ? 'text-green-400' : 'text-red-400'}>{c.name}</span>
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
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Contract Stats */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
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
          </div>

          {/* Tips */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Contract Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>• New contracts appear every ~200 ticks</p>
              <p>• Higher difficulty = better rewards</p>
              <p>• ★★★★+ contracts give Corporation Points</p>
              <p>• Fulfill early to avoid running out of time</p>
              <p>• Auto-Trading automation can auto-fulfill contracts</p>
              <p>• Stockpile resources between contract spawns</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
