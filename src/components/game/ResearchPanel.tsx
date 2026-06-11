'use client';

import { useMemo, useState } from 'react';
import { useGameStore, formatNumber, isResearchUnlocked } from '@/lib/game/store';
import { RESEARCH_TREE, RESOURCE_META } from '@/lib/game/configCache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  FlaskConical, Lock, Check, ChevronRight, Timer,
  Zap, Cog, Truck, Bot, Brain, Atom, BarChart3, Users
} from 'lucide-react';
import { LoadingSpinner } from '@/components/game/shared/LoadingSpinner';
import { ResearchCategory } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { GameIcon } from '@/components/game/shared/GameIcon';

export function ResearchPanel() {
  const store = useGameStore();
  const [startingResearch, setStartingResearch] = useState<string | null>(null);

  const categories: { id: ResearchCategory; name: string; icon: React.ReactNode; color: string }[] = [
    { id: 'automation', name: 'Automation', icon: <Cog className="w-4 h-4" />, color: 'text-domain' },
    { id: 'logistics', name: 'Logistics', icon: <Truck className="w-4 h-4" />, color: 'text-brand' },
    { id: 'energy', name: 'Energy', icon: <Zap className="w-4 h-4" />, color: 'text-warning' },
    { id: 'ai', name: 'Electronics & AI', icon: <Brain className="w-4 h-4" />, color: 'text-success' },
    { id: 'robotics', name: 'Robotics', icon: <Bot className="w-4 h-4" />, color: 'text-premium' },
    { id: 'quantum', name: 'Quantum Tech', icon: <Atom className="w-4 h-4" />, color: 'text-research' },
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
          <h2 className="text-xl font-bold text-research neon-glow-cyan tracking-wide">Research Lab</h2>
          <p className="text-xs text-muted-label mt-0.5">Unlock new technologies and boost production</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-research/50 text-research bg-research/20 text-xs">
            <FlaskConical className="w-3 h-3 mr-1" />
            {formatNumber(store.researchPoints)} RP
          </Badge>
          <Badge variant="outline" className="border-brand/50 text-brand bg-brand/20 text-xs">
            <Check className="w-3 h-3 mr-1" />
            {store.completedResearch.length}/{RESEARCH_TREE.length}
          </Badge>
        </div>
      </div>

      {/* Active Research */}
      <div className="game-card rounded-xl bg-card p-4 border border-research/30 relative overflow-hidden">
        {/* Subtle glow effect behind active research card */}
        {activeResearchNode && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.08)_0%,transparent_70%)] pointer-events-none" />
        )}
        <div className="flex items-center gap-2 mb-3 relative z-10">
          <FlaskConical className="w-4 h-4 text-research" />
          <h3 className="text-sm font-semibold text-research">Active Research</h3>
        </div>
        {activeResearchNode ? (
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-research/20 flex items-center justify-center text-2xl neon-pulse">
                <GameIcon icon={activeResearchNode.icon} size={24} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-subtle">{activeResearchNode.name}</div>
                <div className="text-[10px] text-subtle mt-0.5">{activeResearchNode.description}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold font-mono text-research">
                  {((store.researchProgress / activeResearchNode.timeRequired) * 100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-label">
                  <Timer className="w-2.5 h-2.5 inline mr-0.5" />
                  {formatNumber(store.researchProgress)}/{formatNumber(activeResearchNode.timeRequired)} ticks
                </div>
              </div>
            </div>
            <div className="h-3 bg-muted-label rounded-full overflow-hidden">
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
            <FlaskConical className="w-10 h-10 text-dim mx-auto mb-2" />
            <p className="text-xs text-muted-label">No active research</p>
            <p className="text-[10px] text-muted-label mt-1">Select a research node below to begin</p>
          </div>
        )}
      </div>

      {/* Research Tree by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {store.completedResearch.length >= RESEARCH_TREE.length && (
          <div className="col-span-full flex flex-col items-center justify-center py-8 text-muted-label">
            <FlaskConical className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">All research completed! <GameIcon icon="gi:sparkles" size={16} className="inline" /></p>
          </div>
        )}
        {categories.map(cat => {
          const nodes = researchByCategory[cat.id] || [];
          return (
            <div key={cat.id} className="game-card rounded-xl bg-card p-4 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <div className={cat.color}><GameIcon icon={cat.icon} size={16} /></div>
                <h3 className={`text-sm font-semibold ${cat.color}`}>{cat.name}</h3>
                <span className="text-[10px] text-muted-label ml-auto">
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
                      icon={node.icon}
                      description={node.description}
                      category={node.category}
                      tier={node.tier}
                      details={[
                        { label: 'Cost', value: `${formatNumber(node.cost)} RP`, color: 'text-research' },
                        { label: 'Time Required', value: `${node.timeRequired} ticks` },
                        ...node.effects.map((effect, i) => ({
                          label: `Effect ${i + 1}`,
                          value: `${effect.type === 'productionSpeed' ? 'Speed' : effect.type === 'unlockBuilding' ? 'Unlock' : effect.type === 'transportSpeed' ? 'Transport' : effect.type === 'powerEfficiency' ? 'Power' : effect.type === 'marketBonus' ? 'Market' : effect.type === 'workerEfficiency' ? 'Workers' : effect.type === 'unlockTransport' ? 'Unlock' : effect.type === 'storageBonus' ? 'Storage' : 'Bonus'} +${(effect.value * 100).toFixed(0)}%${effect.target ? ` (${effect.target})` : ''}`,
                          color: 'text-brand',
                        })),
                      ]}
                      requirements={[
                        ...node.prerequisites.map(pre => {
                          const preNode = RESEARCH_TREE.find(r => r.id === pre);
                          return {
                            label: 'Prerequisite',
                            value: preNode?.name ?? pre,
                            color: store.completedResearch.includes(pre) ? 'text-success' : 'text-danger',
                          };
                        }),
                      ]}
                      side="right"
                    >
                    <div
                      className={`rounded-lg p-3 ${
                        isCompleted
                          ? 'bg-success/10 border border-success/30'
                          : isActive
                            ? 'bg-research/10 border border-research/30 neon-pulse shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                            : isAvailable
                              ? 'bg-[#0a0e17] border border-muted-label hover:border-research/50 hover:-translate-y-0.5 hover:shadow-lg'
                              : 'bg-[#0a0e17] border border-muted-label opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
                          isCompleted ? 'bg-success/30' : isActive ? 'bg-research/30' : 'bg-muted-label/50'
                        }`}>
                          {isCompleted ? <GameIcon icon="lucide:check-circle" size={16} /> : isUnlocked ? <GameIcon icon={node.icon} size={16} /> : <Lock className="w-4 h-4 text-muted-label" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${isCompleted ? 'text-success' : isUnlocked ? 'text-subtle' : 'text-muted-label'}`}>
                              {node.name}
                            </span>
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-muted-label text-muted-label">
                              Tier {node.tier}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-subtle truncate">{node.description}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {isCompleted ? (
                            <Badge className="text-[9px] bg-success/30 text-success border-0">Done</Badge>
                          ) : isActive ? (
                            <Badge className="text-[9px] bg-research/30 text-research border-0 neon-pulse">Active</Badge>
                          ) : (
                            <div>
                              <div className="text-[10px] text-research font-mono">{formatNumber(node.cost)} RP</div>
                              <div className="text-[9px] text-muted-label">{node.timeRequired} ticks</div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Prerequisites */}
                      {!isUnlocked && node.prerequisites.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-muted-label">
                          <div className="text-[9px] text-muted-label mb-1">Requires:</div>
                          <div className="flex flex-wrap gap-1">
                            {node.prerequisites.map(pre => {
                              const preNode = RESEARCH_TREE.find(r => r.id === pre);
                              const preDone = store.completedResearch.includes(pre);
                              return (
                                <Badge key={pre} variant="outline" className={`text-[8px] px-1 py-0 ${
                                  preDone ? 'border-success text-success' : 'border-danger text-danger'
                                }`}>
                                  {preDone ? 'lucide:check' : 'lucide:x'} {preNode?.name ?? pre}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Effects */}
                      {isUnlocked && !isCompleted && (
                        <div className="mt-2 pt-2 border-t border-muted-label/50">
                          <div className="flex flex-wrap gap-1">
                            {node.effects.map((effect, i) => (
                              <Badge key={i} variant="outline" className="text-[8px] px-1 py-0 border-brand text-brand">
                                {effect.type === 'productionSpeed' ? <><GameIcon icon="gi:lightning-frequency" size={14} className="inline" /> Speed</> :
                                 effect.type === 'unlockBuilding' ? <><GameIcon icon="gi:castle" size={14} className="inline" /> Unlock</> :
                                 effect.type === 'transportSpeed' ? <><GameIcon icon="gi:truck" size={14} className="inline" /> Transport</> :
                                 effect.type === 'powerEfficiency' ? <><GameIcon icon="gi:battery-75" size={14} className="inline" /> Power</> :
                                 effect.type === 'marketBonus' ? <><GameIcon icon="gi:profit" size={14} className="inline" /> Market</> :
                                 effect.type === 'workerEfficiency' ? <><GameIcon icon="gi:overhead" size={14} className="inline" /> Workers</> :
                                 effect.type === 'unlockTransport' ? <><GameIcon icon="gi:steam-locomotive" size={14} className="inline" /> Unlock</> :
                                 effect.type === 'storageBonus' ? <><GameIcon icon="gi:cardboard-box" size={14} className="inline" /> Storage</> : <><GameIcon icon="gi:sparkles" size={14} className="inline" /> Bonus</>}
                                {' '}+{(effect.value * 100).toFixed(0)}%
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Start Research Button */}
                      {isAvailable && (
                        <Button
                          onClick={() => {
                            setStartingResearch(node.id);
                            store.startResearch(node.id);
                            setTimeout(() => setStartingResearch(null), 300);
                          }}
                          disabled={startingResearch === node.id}
                          className="w-full mt-2 bg-research hover:bg-research text-white text-xs h-7 min-h-[36px]"
                          size="sm"
                        >
                          {startingResearch === node.id ? <LoadingSpinner /> : <FlaskConical className="w-3 h-3 mr-1" />}
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
