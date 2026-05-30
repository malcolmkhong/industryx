'use client';

import { useMemo } from 'react';
import { useGameStore, formatNumber, isResearchUnlocked } from '@/lib/game/store';
import { RESEARCH_TREE, RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FlaskConical, Lock, Check, ChevronRight, Timer,
  Zap, Cog, Truck, Bot, Brain, Atom, BarChart3, Users,
  ListOrdered, X, ArrowUp, ArrowDown, Trash2, Plus, ChevronDown,
} from 'lucide-react';
import { ResearchCategory } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { motion, AnimatePresence } from 'framer-motion';

const MAX_QUEUE_SIZE = 5;

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

  // Queue data with node info
  const queueData = useMemo(() => {
    return store.researchQueue.map(id => {
      const node = RESEARCH_TREE.find(r => r.id === id);
      return { id, node };
    });
  }, [store.researchQueue]);

  // Calculate total RP locked in queue
  const totalQueuedRP = useMemo(() => {
    return store.researchQueue.reduce((sum, id) => {
      const node = RESEARCH_TREE.find(r => r.id === id);
      return sum + (node?.cost ?? 0);
    }, 0);
  }, [store.researchQueue]);

  // Estimated total ticks for queue
  const totalQueuedTicks = useMemo(() => {
    return store.researchQueue.reduce((sum, id) => {
      const node = RESEARCH_TREE.find(r => r.id === id);
      return sum + (node?.timeRequired ?? 0);
    }, 0);
  }, [store.researchQueue]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
          {store.researchQueue.length > 0 && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-900/20 text-xs">
              <ListOrdered className="w-3 h-3 mr-1" />
              {store.researchQueue.length}/{MAX_QUEUE_SIZE} queued
            </Badge>
          )}
        </div>
      </div>

      {/* Active Research + Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Active Research - 2/3 width */}
        <div className="lg:col-span-2 game-card rounded-xl bg-[#111827] p-4 border border-purple-900/30 relative overflow-hidden">
          {/* Subtle glow effect behind active research card */}
          {activeResearchNode && (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.08)_0%,transparent_70%)] pointer-events-none" />
          )}
          <div className="flex items-center gap-2 mb-3 relative z-10">
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-purple-400">Active Research</h3>
          </div>
          {activeResearchNode ? (
            <div className="relative z-10">
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
                  className="h-full research-progress-gradient rounded-full transition-all duration-300 relative"
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

        {/* Research Queue - 1/3 width */}
        <div className="game-card rounded-xl bg-[#111827] p-4 border border-amber-900/20 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.04)_0%,transparent_60%)] pointer-events-none" />
          <div className="flex items-center justify-between mb-3 relative z-10">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-400">Research Queue</h3>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-700/50 text-amber-400 bg-amber-900/10">
                {store.researchQueue.length}/{MAX_QUEUE_SIZE}
              </Badge>
              {store.researchQueue.length > 0 && (
                <Button
                  onClick={() => store.clearResearchQueue()}
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  aria-label="Clear research queue"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Queue Items */}
          <div className="space-y-1.5 relative z-10 max-h-[240px] overflow-y-auto custom-scrollbar">
            {queueData.length === 0 ? (
              <div className="text-center py-4">
                <ListOrdered className="w-8 h-8 text-gray-700 mx-auto mb-1.5" />
                <p className="text-[10px] text-gray-500">Queue is empty</p>
                <p className="text-[9px] text-gray-600 mt-0.5">Click research while one is active to queue it</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {queueData.map(({ id, node }, index) => {
                  if (!node) return null;
                  const isNext = index === 0 && !activeResearchNode;
                  return (
                    <motion.div
                      key={id}
                      layout
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`group flex items-center gap-2 p-2 rounded-lg border transition-all duration-200 ${
                        isNext
                          ? 'bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/10'
                          : 'bg-gray-800/30 border-gray-700/20 hover:border-gray-600/30'
                      }`}
                    >
                      {/* Position badge */}
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        isNext ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-700/50 text-gray-400'
                      }`}>
                        {index + 1}
                      </div>

                      {/* Emoji */}
                      <span className="text-base flex-shrink-0">{node.emoji}</span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-gray-300 truncate">{node.name}</div>
                        <div className="text-[9px] text-gray-500">
                          {formatNumber(node.cost)} RP · {node.timeRequired}t
                        </div>
                      </div>

                      {/* Reorder + Remove */}
                      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                        {index > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); store.reorderResearchQueue(index, index - 1); }}
                            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-amber-400 hover:bg-amber-900/20 rounded transition-colors"
                            aria-label="Move up in queue"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {index < store.researchQueue.length - 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); store.reorderResearchQueue(index, index + 1); }}
                            className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-amber-400 hover:bg-amber-900/20 rounded transition-colors"
                            aria-label="Move down in queue"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); store.removeFromResearchQueue(index); }}
                          className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                          aria-label="Remove from queue"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Queue Summary */}
          {queueData.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-700/30 space-y-1">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-gray-500">Total RP locked:</span>
                <span className="text-amber-400 font-mono">{formatNumber(totalQueuedRP)} RP</span>
              </div>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-gray-500">Est. total time:</span>
                <span className="text-gray-400 font-mono">{formatNumber(totalQueuedTicks)} ticks</span>
              </div>
              {activeResearchNode && (
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-gray-500">Queue + Active:</span>
                  <span className="text-purple-400 font-mono">{formatNumber(activeResearchNode.timeRequired - store.researchProgress + totalQueuedTicks)} ticks</span>
                </div>
              )}
            </div>
          )}
        </div>
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
                  const isInQueue = store.researchQueue.includes(node.id);
                  const isUnlocked = isResearchUnlocked(node.id, store.completedResearch);
                  const canAfford = store.researchPoints >= node.cost;
                  const canQueue = !isCompleted && !isActive && !isInQueue && isUnlocked && store.researchQueue.length < MAX_QUEUE_SIZE;
                  const isAvailable = !isCompleted && !isActive && !isInQueue && isUnlocked && canAfford;
                  const canAddToQueue = canQueue && canAfford;

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
                      className={`rounded-lg p-3 transition-all duration-200 ${
                        isCompleted
                          ? 'bg-green-900/10 border border-green-900/30'
                          : isActive
                            ? 'bg-purple-900/10 border border-purple-500/30 neon-pulse shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                            : isInQueue
                              ? 'bg-amber-900/10 border border-amber-500/25 shadow-[0_0_8px_rgba(245,158,11,0.08)]'
                              : isAvailable
                                ? 'bg-[#0a0e17] border border-gray-800 hover:border-purple-900/50 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer'
                                : 'bg-[#0a0e17] border border-gray-800 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
                          isCompleted ? 'bg-green-900/30' : isActive ? 'bg-purple-900/30' : isInQueue ? 'bg-amber-900/30' : 'bg-gray-800/50'
                        }`}>
                          {isCompleted ? '✅' : isInQueue ? '⏳' : isUnlocked ? node.emoji : <Lock className="w-4 h-4 text-gray-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${isCompleted ? 'text-green-400' : isInQueue ? 'text-amber-400' : isUnlocked ? 'text-gray-200' : 'text-gray-500'}`}>
                              {node.name}
                            </span>
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-gray-700 text-gray-500">
                              Tier {node.tier}
                            </Badge>
                            {isInQueue && (
                              <Badge className="text-[8px] px-1 py-0 bg-amber-900/30 text-amber-400 border-0">
                                Q{store.researchQueue.indexOf(node.id) + 1}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 truncate">{node.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {isCompleted ? (
                            <Badge className="text-[9px] bg-green-900/30 text-green-400 border-0">Done</Badge>
                          ) : isActive ? (
                            <Badge className="text-[9px] bg-purple-900/30 text-purple-400 border-0 neon-pulse">Active</Badge>
                          ) : isInQueue ? (
                            <Badge className="text-[9px] bg-amber-900/30 text-amber-400 border-0">Queued</Badge>
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

                      {/* Action Buttons */}
                      {isAvailable && (
                        <div className="mt-2 flex gap-2">
                          <Button
                            onClick={() => store.startResearch(node.id)}
                            className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-xs h-7"
                            size="sm"
                          >
                            <FlaskConical className="w-3 h-3 mr-1" />
                            Start ({formatNumber(node.cost)} RP)
                          </Button>
                          {store.activeResearch && canAddToQueue && (
                            <Button
                              onClick={() => store.addToResearchQueue(node.id)}
                              variant="outline"
                              className="bg-amber-900/20 text-amber-400 border-amber-700/30 hover:bg-amber-900/40 text-xs h-7 px-2"
                              size="sm"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Queue
                            </Button>
                          )}
                        </div>
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
