'use client';

import { useMemo } from 'react';
import { useGameStore, formatNumber, isResearchUnlocked } from '@/lib/game/store';
import { RESEARCH_TREE, RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FlaskConical, Lock, Check, ChevronRight, Timer,
  Zap, Cog, Truck, Bot, Brain, Atom, BarChart3, Users
} from 'lucide-react';
import { ResearchCategory } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';

export function ResearchPanel() {
  const store = useGameStore();

  const categories: { id: ResearchCategory; name: string; icon: React.ReactNode; color: string }[] = [
    { id: 'automation', name: 'Automation', icon: <Cog className="w-4 h-4" />, color: 'text-orange-400' },
    { id: 'logistics', name: 'Logistics', icon: <Truck className="w-4 h-4" />, color: 'text-blue-400' },
    { id: 'energy', name: 'Energy', icon: <Zap className="w-4 h-4" />, color: 'text-yellow-400' },
    { id: 'ai', name: 'Electronics & AI', icon: <Brain className="w-4 h-4" />, color: 'text-green-400' },
    { id: 'robotics', name: 'Robotics', icon: <Bot className="w-4 h-4" />, color: 'text-pink-400' },
    { id: 'quantum', name: 'Quantum Tech', icon: <Atom className="w-4 h-4" />, color: 'text-purple-400' },
  ];

  const activeResearchNode = store.activeResearch
    ? RESEARCH_TREE.find(r => r.id === store.activeResearch)
    : null;

  const researchByCategory = useMemo(() => {
    const grouped: Record<string, typeof RESEARCH_TREE> = {};
    categories.forEach(cat => {
      grouped[cat.id] = RESEARCH_TREE.filter(r => r.category === cat.id).sort((a, b) => a.tier - b.tier);
    });
    return grouped;
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-purple-400 neon-glow-cyan tracking-wide">Research Lab</h2>
          <p className="text-xs text-gray-500 mt-0.5">Unlock new technologies and boost production</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-900/20 text-xs">
            <FlaskConical className="w-3 h-3 mr-1" />
            {formatNumber(store.researchPoints)} RP
          </Badge>
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <Check className="w-3 h-3 mr-1" />
            {store.completedResearch.length}/{RESEARCH_TREE.length}
          </Badge>
        </div>
      </div>

      {/* Active Research */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-purple-900/30">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-purple-400">Active Research</h3>
        </div>
        {activeResearchNode ? (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-purple-900/20 flex items-center justify-center text-2xl neon-pulse">
                {activeResearchNode.emoji}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-gray-200">{activeResearchNode.name}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{activeResearchNode.description}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono text-purple-400">
                  {((store.researchProgress / activeResearchNode.timeRequired) * 100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-gray-500">
                  <Timer className="w-2.5 h-2.5 inline mr-0.5" />
                  {formatNumber(store.researchProgress)}/{formatNumber(activeResearchNode.timeRequired)} ticks
                </div>
              </div>
            </div>
            <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-600 to-purple-400 rounded-full transition-all duration-300 relative"
                style={{ width: `${Math.min(100, (store.researchProgress / activeResearchNode.timeRequired) * 100)}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <FlaskConical className="w-10 h-10 text-gray-700 mx-auto mb-2" />
            <p className="text-xs text-gray-500">No active research</p>
            <p className="text-[10px] text-gray-600 mt-1">Select a research node below to begin</p>
          </div>
        )}
      </div>

      {/* Research Tree by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {categories.map(cat => {
          const nodes = researchByCategory[cat.id] || [];
          return (
            <div key={cat.id} className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
              <div className="flex items-center gap-2 mb-3">
                <div className={cat.color}>{cat.icon}</div>
                <h3 className={`text-sm font-semibold ${cat.color}`}>{cat.name}</h3>
                <span className="text-[10px] text-gray-500 ml-auto">
                  {nodes.filter(n => store.completedResearch.includes(n.id)).length}/{nodes.length}
                </span>
              </div>
              <div className="space-y-2">
                {nodes.map(node => {
                  const isCompleted = store.completedResearch.includes(node.id);
                  const isActive = store.activeResearch === node.id;
                  const isUnlocked = isResearchUnlocked(node.id, store.completedResearch);
                  const canAfford = store.researchPoints >= node.cost;
                  const isAvailable = !isCompleted && !isActive && isUnlocked && canAfford;

                  return (
                    <GameItemTooltip
                      key={node.id}
                      name={node.name}
                      emoji={node.emoji}
                      description={node.description}
                      category={node.category}
                      tier={node.tier}
                      details={[
                        { label: 'Cost', value: `${formatNumber(node.cost)} RP`, color: 'text-purple-400' },
                        { label: 'Time Required', value: `${node.timeRequired} ticks` },
                        ...node.effects.map((effect, i) => ({
                          label: `Effect ${i + 1}`,
                          value: `${effect.type === 'productionSpeed' ? 'Speed' : effect.type === 'unlockBuilding' ? 'Unlock' : effect.type === 'transportSpeed' ? 'Transport' : effect.type === 'powerEfficiency' ? 'Power' : effect.type === 'marketBonus' ? 'Market' : effect.type === 'workerEfficiency' ? 'Workers' : effect.type === 'unlockTransport' ? 'Unlock' : effect.type === 'storageBonus' ? 'Storage' : 'Bonus'} +${(effect.value * 100).toFixed(0)}%${effect.target ? ` (${effect.target})` : ''}`,
                          color: 'text-cyan-400',
                        })),
                      ]}
                      requirements={[
                        ...node.prerequisites.map(pre => {
                          const preNode = RESEARCH_TREE.find(r => r.id === pre);
                          return {
                            label: 'Prerequisite',
                            value: preNode?.name ?? pre,
                            color: store.completedResearch.includes(pre) ? 'text-green-400' : 'text-red-400',
                          };
                        }),
                      ]}
                      side="right"
                    >
                    <div
                      className={`rounded-lg p-3 transition-all ${
                        isCompleted
                          ? 'bg-green-900/10 border border-green-900/30'
                          : isActive
                            ? 'bg-purple-900/10 border border-purple-500/30 neon-pulse'
                            : isAvailable
                              ? 'bg-[#0a0e17] border border-gray-800 hover:border-purple-900/50 cursor-pointer'
                              : 'bg-[#0a0e17] border border-gray-800 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
                          isCompleted ? 'bg-green-900/30' : isActive ? 'bg-purple-900/30' : 'bg-gray-800/50'
                        }`}>
                          {isCompleted ? '✅' : isUnlocked ? node.emoji : <Lock className="w-4 h-4 text-gray-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${isCompleted ? 'text-green-400' : isUnlocked ? 'text-gray-200' : 'text-gray-500'}`}>
                              {node.name}
                            </span>
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-gray-700 text-gray-500">
                              Tier {node.tier}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate">{node.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {isCompleted ? (
                            <Badge className="text-[9px] bg-green-900/30 text-green-400 border-0">Done</Badge>
                          ) : isActive ? (
                            <Badge className="text-[9px] bg-purple-900/30 text-purple-400 border-0 neon-pulse">Active</Badge>
                          ) : (
                            <div>
                              <div className="text-[10px] text-purple-400 font-mono">{formatNumber(node.cost)} RP</div>
                              <div className="text-[9px] text-gray-500">{node.timeRequired} ticks</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prerequisites */}
                      {!isUnlocked && node.prerequisites.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-800">
                          <div className="text-[9px] text-gray-500 mb-1">Requires:</div>
                          <div className="flex flex-wrap gap-1">
                            {node.prerequisites.map(pre => {
                              const preNode = RESEARCH_TREE.find(r => r.id === pre);
                              const preDone = store.completedResearch.includes(pre);
                              return (
                                <Badge key={pre} variant="outline" className={`text-[8px] px-1 py-0 ${
                                  preDone ? 'border-green-700 text-green-400' : 'border-red-700 text-red-400'
                                }`}>
                                  {preDone ? '✓' : '✗'} {preNode?.name ?? pre}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Effects */}
                      {isUnlocked && !isCompleted && (
                        <div className="mt-2 pt-2 border-t border-gray-800/50">
                          <div className="flex flex-wrap gap-1">
                            {node.effects.map((effect, i) => (
                              <Badge key={i} variant="outline" className="text-[8px] px-1 py-0 border-cyan-800 text-cyan-400">
                                {effect.type === 'productionSpeed' ? '⚡ Speed' :
                                 effect.type === 'unlockBuilding' ? '🏗️ Unlock' :
                                 effect.type === 'transportSpeed' ? '🚚 Transport' :
                                 effect.type === 'powerEfficiency' ? '🔋 Power' :
                                 effect.type === 'marketBonus' ? '📈 Market' :
                                 effect.type === 'workerEfficiency' ? '👷 Workers' :
                                 effect.type === 'unlockTransport' ? '🚛 Unlock' :
                                 effect.type === 'storageBonus' ? '📦 Storage' : '✨ Bonus'}
                                {' '}+{(effect.value * 100).toFixed(0)}%
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Start Research Button */}
                      {isAvailable && (
                        <Button
                          onClick={() => store.startResearch(node.id)}
                          className="w-full mt-2 bg-purple-600 hover:bg-purple-500 text-white text-xs h-7"
                          size="sm"
                        >
                          <FlaskConical className="w-3 h-3 mr-1" />
                          Start Research ({formatNumber(node.cost)} RP)
                        </Button>
                      )}
                    </div>
                    </GameItemTooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
