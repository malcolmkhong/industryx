'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/configCache';
import { ResourceType } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GameIcon } from '@/components/game/shared/GameIcon';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Rocket, Lock, Check, ChevronRight, Sparkles, AlertTriangle,
  Zap, ArrowUpRight, Cpu, Package, Trophy, Eye, Pause,
  TrendingUp, Pickaxe, Users, Wrench, DollarSign
} from 'lucide-react';

const PROJECT_COLORS: Record<string, { border: string; glow: string; bg: string; text: string; badge: string; gradient: string }> = {
  spaceElevator: { border: 'border-orange-500/40', glow: 'shadow-orange-500/20', bg: 'bg-orange-900/10', text: 'text-orange-400', badge: 'border-orange-500/50 text-orange-400 bg-orange-900/20', gradient: 'linear-gradient(90deg, #f97316, #fb923c)' },
  dysonSphere: { border: 'border-warning/40', glow: 'shadow-yellow-500/20', bg: 'bg-yellow-900/10', text: 'text-warning', badge: 'border-warning/50 text-warning bg-yellow-900/20', gradient: 'linear-gradient(90deg, #eab308, #facc15)' },
  quantumInternet: { border: 'border-cyan-500/40', glow: 'shadow-cyan-500/20', bg: 'bg-cyan-900/10', text: 'text-cyan-400', badge: 'border-cyan-500/50 text-cyan-400 bg-cyan-900/20', gradient: 'linear-gradient(90deg, #06b6d4, #22d3ee)' },
  fusionCity: { border: 'border-fuchsia-500/40', glow: 'shadow-fuchsia-500/20', bg: 'bg-fuchsia-900/10', text: 'text-fuchsia-400', badge: 'border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-900/20', gradient: 'linear-gradient(90deg, #d946ef, #e879f9)' },
  terraformingEngine: { border: 'border-success/40', glow: 'shadow-emerald-500/20', bg: 'bg-success/10', text: 'text-success', badge: 'border-success/50 text-success bg-success/20', gradient: 'linear-gradient(90deg, #10b981, #34d399)' },
  galacticTradeHub: { border: 'border-warning/40', glow: 'shadow-amber-500/20', bg: 'bg-amber-900/10', text: 'text-warning', badge: 'border-warning/50 text-warning bg-amber-900/20', gradient: 'linear-gradient(90deg, #f59e0b, #fbbf24)' },
  deepCoreExtractor: { border: 'border-danger/40', glow: 'shadow-red-500/20', bg: 'bg-danger/10', text: 'text-danger', badge: 'border-danger/50 text-danger bg-danger/20', gradient: 'linear-gradient(90deg, #ef4444, #f87171)' },
  neuralCommandCenter: { border: 'border-violet-500/40', glow: 'shadow-violet-500/20', bg: 'bg-violet-900/10', text: 'text-violet-400', badge: 'border-violet-500/50 text-violet-400 bg-violet-900/20', gradient: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' },
  nanoAssemblyMatrix: { border: 'border-teal-500/40', glow: 'shadow-teal-500/20', bg: 'bg-teal-900/10', text: 'text-teal-400', badge: 'border-teal-500/50 text-teal-400 bg-teal-900/20', gradient: 'linear-gradient(90deg, #14b8a6, #2dd4bf)' },
};

const BONUS_ICONS: Record<string, React.ReactNode> = {
  transportMultiplier: <Rocket className="w-3.5 h-3.5" />,
  powerMultiplier: <Zap className="w-3.5 h-3.5" />,
  researchMultiplier: <Cpu className="w-3.5 h-3.5" />,
  productionMultiplier: <ArrowUpRight className="w-3.5 h-3.5" />,
  unlimitedStorage: <Package className="w-3.5 h-3.5" />,
  marketMultiplier: <TrendingUp className="w-3.5 h-3.5" />,
  extractionMultiplier: <Pickaxe className="w-3.5 h-3.5" />,
  workerEfficiency: <Users className="w-3.5 h-3.5" />,
  buildingCostReduction: <Wrench className="w-3.5 h-3.5" />,
};

// Detailed bonus descriptions for tooltips
const BONUS_DETAILS: Record<string, string> = {
  transportMultiplier: 'All transport line throughput is boosted, making your logistics network significantly more efficient.',
  powerMultiplier: 'All power generation is massively increased, providing enormous energy for your expanding factory.',
  researchMultiplier: 'Research speed is boosted, allowing you to unlock technologies much faster.',
  productionMultiplier: 'All building production rates are boosted across your entire empire.',
  unlimitedStorage: 'Resource storage capacity is removed — store unlimited amounts of any resource forever.',
  marketMultiplier: 'All market sell prices are increased, generating more income from every sale.',
  extractionMultiplier: 'All extractor production rates are boosted, yielding more raw materials per second.',
  workerEfficiency: 'All assigned workers become significantly more effective at boosting building output.',
  buildingCostReduction: 'All building construction and upgrade costs are reduced, making expansion cheaper.',
};

// Color for project glow shadows
function getProjectGlowColor(type: string): string {
  const map: Record<string, string> = {
    spaceElevator: 'rgba(249,115,22,0.1)',
    dysonSphere: 'rgba(234,179,8,0.1)',
    quantumInternet: 'rgba(6,182,212,0.1)',
    fusionCity: 'rgba(217,70,239,0.1)',
    terraformingEngine: 'rgba(16,185,129,0.1)',
    galacticTradeHub: 'rgba(245,158,11,0.1)',
    deepCoreExtractor: 'rgba(239,68,68,0.1)',
    neuralCommandCenter: 'rgba(139,92,246,0.1)',
    nanoAssemblyMatrix: 'rgba(20,184,166,0.1)',
  };
  return map[type] || 'rgba(217,70,239,0.1)';
}

// Color for progress bar hex
function getProjectProgressHex(type: string): string {
  const map: Record<string, string> = {
    spaceElevator: '#f97316',
    dysonSphere: '#eab308',
    quantumInternet: '#06b6d4',
    fusionCity: '#d946ef',
    terraformingEngine: '#10b981',
    galacticTradeHub: '#f59e0b',
    deepCoreExtractor: '#ef4444',
    neuralCommandCenter: '#8b5cf6',
    nanoAssemblyMatrix: '#14b8a6',
  };
  return map[type] || '#d946ef';
}

export function MegaProjectPanel() {
  const store = useGameStore();

  const isUnlocked = (project: typeof store.megaProjects[0]) => {
    const req = project.unlockRequirement;
    if (req.buildings && store.buildings.length < req.buildings) return false;
    if (req.research && store.completedResearch.length < req.research) return false;
    if (req.prestige && store.prestigeState.totalPrestiges < req.prestige) return false;
    return true;
  };

  const hasResources = (project: typeof store.megaProjects[0]) => {
    if (!project.active || project.completed) return false;
    const stage = project.stages[project.currentStage];
    if (!stage || stage.completed) return false;
    return stage.requiredResources.every(r => {
      if (r.resource === 'money') return store.money >= r.amount;
      return store.resources[r.resource as ResourceType] >= r.amount;
    });
  };

  const completedCount = store.megaProjects.filter(p => p.completed).length;
  const activeCount = store.megaProjects.filter(p => p.active && !p.completed).length;
  const unlockedCount = store.megaProjects.filter(p => isUnlocked(p) && !p.active && !p.completed).length;
  const lockedCount = store.megaProjects.filter(p => !isUnlocked(p) && !p.completed).length;
  const pausedCount = store.megaProjects.filter(p => p.active && !p.completed && !hasResources(p)).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-fuchsia-400 tracking-wide flex items-center gap-2 neon-glow-purple">
            <Sparkles className="w-5 h-5" />
            MEGA PROJECTS
          </h2>
          <p className="text-xs text-muted-label mt-0.5">Massive endgame constructions that grant permanent empire-wide bonuses</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-900/20 text-xs">
            <Trophy className="w-3 h-3 mr-1" />
            {completedCount}/{store.megaProjects.length} Complete
          </Badge>
          {activeCount > 0 && (
            <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
              <Zap className="w-3 h-3 mr-1" />
              {activeCount} Active
            </Badge>
          )}
          {pausedCount > 0 && (
            <Badge variant="outline" className="border-warning/50 text-warning bg-amber-900/20 text-xs">
              <Pause className="w-3 h-3 mr-1" />
              {pausedCount} Paused
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Summary Bar */}
      <div className="game-card rounded-xl bg-card p-3 border border-border">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-muted-label">Progress:</span>
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-muted-label" />
              <span className="text-muted-label">{lockedCount} Locked</span>
            </span>
            <span className="text-dim">|</span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3 text-cyan-500" />
              <span className="text-cyan-400">{unlockedCount} Unlocked</span>
            </span>
            <span className="text-dim">|</span>
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3 text-fuchsia-500" />
              <span className="text-fuchsia-400">{activeCount} In Progress</span>
            </span>
            <span className="text-dim">|</span>
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3 text-success" />
              <span className="text-success">{completedCount} Completed</span>
            </span>
          </div>
        </div>
        {/* Visual progress bar */}
        <div className="flex h-2 rounded-full overflow-hidden bg-muted-label mt-2">
          {completedCount > 0 && <div className="bg-success transition-all duration-500" style={{ width: `${(completedCount / store.megaProjects.length) * 100}%` }} />}
          {activeCount > 0 && <div className="bg-fuchsia-500 transition-all duration-500" style={{ width: `${(activeCount / store.megaProjects.length) * 100}%` }} />}
          {unlockedCount > 0 && <div className="bg-cyan-500/50 transition-all duration-500" style={{ width: `${(unlockedCount / store.megaProjects.length) * 100}%` }} />}
          {/* Locked = remaining space */}
        </div>
      </div>

      {/* Completed MegaProjects Bonuses */}
      {completedCount > 0 && (
        <div className="game-card rounded-xl bg-card p-4 border border-fuchsia-900/30" style={{ boxShadow: '0 0 30px rgba(217,70,239,0.1)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-fuchsia-400" />
            <h3 className="text-sm font-semibold text-fuchsia-400">Active MegaProject Bonuses</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {store.megaProjects.filter(p => p.completed).map(p => {
              const colors = PROJECT_COLORS[p.type];
              return (
                <div key={p.type} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${colors?.bg ?? 'bg-muted-label/10'} border ${colors?.border ?? 'border-muted-label/30'}`}>
                  <GameIcon icon={p.icon} size={20} />
                  <div>
                    <div className={`text-xs font-medium ${colors?.text ?? 'text-subtle'}`}>{p.name}</div>
                    <div className="text-[10px] text-success flex items-center gap-1">
                      {BONUS_ICONS[p.bonus.type]}
                      {p.bonus.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MegaProject Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 relative">
        {store.megaProjects.map(project => {
          const colors = PROJECT_COLORS[project.type];
          const unlocked = isUnlocked(project);
          const resourcesMet = hasResources(project);
          const progressHex = getProjectProgressHex(project.type);

          return (
            <div
              key={project.type}
              className={`game-card rounded-xl bg-card border ${
                project.completed
                  ? `${colors?.border ?? 'border-fuchsia-500/40'} ring-1 ring-fuchsia-500/20`
                  : project.active
                    ? `${colors?.border ?? 'border-muted-label/40'}`
                    : unlocked
                      ? 'border-muted-label'
                      : 'border-muted-label/50 opacity-80'
              }`}
              style={
                project.completed
                  ? { boxShadow: `0 0 40px rgba(217,70,239,0.15), 0 0 80px rgba(217,70,239,0.05)` }
                  : project.active
                    ? { boxShadow: `0 0 20px ${getProjectGlowColor(project.type)}` }
                    : undefined
              }
            >
              <div className="p-4 lg:p-5">
                {/* Project Header - ALWAYS show name and emoji */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                    project.completed
                      ? `${colors?.bg ?? 'bg-fuchsia-900/10'} neon-pulse`
                      : project.active
                        ? `${colors?.bg ?? 'bg-muted-label/50'}`
                        : unlocked
                          ? 'bg-muted-label/50'
                          : 'bg-muted-label/50'
                  }`}>
                    <GameIcon icon={project.icon} size={20} className={unlocked || project.completed ? "" : "opacity-50 grayscale"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`text-sm font-bold ${project.completed ? (colors?.text ?? 'text-fuchsia-400') : unlocked ? 'text-subtle' : 'text-subtle'}`}>
                        {project.name}
                      </h3>
                      {project.completed && (
                        <Badge className="bg-success/20 text-success border-success/30 text-[9px] px-1.5">
                          <Check className="w-2.5 h-2.5 mr-0.5" /> COMPLETE
                        </Badge>
                      )}
                      {project.active && !project.completed && resourcesMet && (
                        <Badge className={`${colors?.badge ?? 'border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-900/20'} text-[9px] px-1.5`}>
                          <Zap className="w-2.5 h-2.5 mr-0.5" /> BUILDING
                        </Badge>
                      )}
                      {project.active && !project.completed && !resourcesMet && (
                        <Badge className="border-warning/50 text-warning bg-amber-900/20 text-[9px] px-1.5">
                          <Pause className="w-2.5 h-2.5 mr-0.5" /> PAUSED
                        </Badge>
                      )}
                      {!unlocked && !project.completed && (
                        <Badge className="bg-muted-label/50 text-subtle border-muted-label/30 text-[9px] px-1.5">
                          <Lock className="w-2.5 h-2.5 mr-0.5" /> LOCKED
                        </Badge>
                      )}
                      {unlocked && !project.active && !project.completed && (
                        <Badge className="bg-cyan-900/20 text-cyan-400 border-cyan-500/30 text-[9px] px-1.5">
                          <Eye className="w-2.5 h-2.5 mr-0.5" /> UNLOCKED
                        </Badge>
                      )}
                    </div>
                    <p className={`text-[11px] mt-0.5 line-clamp-2 ${unlocked || project.completed ? 'text-muted-label' : 'text-muted-label'}`}>
                      {project.description}
                    </p>
                  </div>
                </div>

                {/* Bonus Preview with Tooltip - shown for ALL projects */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`${project.completed ? 'bg-success/10 border-success/30' : unlocked ? `${colors?.bg ?? 'bg-muted-label/10'} ${colors?.border ?? 'border-muted-label/30'}` : 'bg-muted-label/30 border-muted-label/30'} rounded-lg p-3 mb-3 border cursor-help`}>
                      <div className="text-[10px] text-muted-label mb-0.5">
                        {project.completed ? 'Permanent Bonus Active' : 'Completion Bonus'}
                      </div>
                      <div className={`text-xs font-medium flex items-center gap-1.5 ${project.completed ? 'text-success' : unlocked ? (colors?.text ?? 'text-subtle') : 'text-muted-label'}`}>
                        {BONUS_ICONS[project.bonus.type]}
                        {project.bonus.description}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-card border-fuchsia-900/30 max-w-xs">
                    <p className="text-xs text-subtle">{BONUS_DETAILS[project.bonus.type] ?? project.bonus.description}</p>
                    <p className="text-[10px] text-fuchsia-400 mt-1">
                      Bonus value: {project.bonus.type === 'buildingCostReduction' ? '-' : '+'}{(project.bonus.value * 100).toFixed(0)}%
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* Unlock Requirements (if locked) */}
                {!unlocked && !project.completed && (
                  <div className="bg-[#0a0e17] rounded-lg p-3 mb-3">
                    <div className="text-[10px] text-muted-label font-medium mb-1.5 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Unlock Requirements
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {project.unlockRequirement.buildings && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${store.buildings.length >= (project.unlockRequirement.buildings ?? 0) ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                          {store.buildings.length}/{project.unlockRequirement.buildings} Buildings
                        </span>
                      )}
                      {project.unlockRequirement.research && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${store.completedResearch.length >= (project.unlockRequirement.research ?? 0) ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                          {store.completedResearch.length}/{project.unlockRequirement.research} Research
                        </span>
                      )}
                      {project.unlockRequirement.prestige && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${store.prestigeState.totalPrestiges >= (project.unlockRequirement.prestige ?? 0) ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                          {store.prestigeState.totalPrestiges}/{project.unlockRequirement.prestige} Prestiges
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Stage Progress (if active) */}
                {project.active && !project.completed && (() => {
                  const currentStage = project.stages[project.currentStage];
                  if (!currentStage || currentStage.completed) return null;
                  return (
                    <>
                      {/* Paused Warning */}
                      {!resourcesMet && (
                        <div className="bg-amber-900/10 border border-warning/20 rounded-lg p-3 mb-3 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
                          <div className="text-[10px]">
                            <div className="text-warning font-medium">Construction Paused</div>
                            <div className="text-warning/60">Resources must be held to continue. Progress resumes automatically when all materials are available.</div>
                          </div>
                        </div>
                      )}

                      {/* Stage Indicators */}
                      <div className="flex items-center gap-1 mb-3">
                        {project.stages.map((s, i) => (
                          <div key={i} className="flex items-center gap-1 flex-1">
                            <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                              s.completed
                                ? 'bg-success'
                                : i === project.currentStage
                                  ? 'bg-muted-label'
                                  : 'bg-muted-label'
                            }`} style={i === project.currentStage && !s.completed ? {
                              background: `linear-gradient(90deg, ${progressHex} ${project.progress * 100}%, #1f2937 ${project.progress * 100}%)`,
                            } : undefined} />
                            {i < project.stages.length - 1 && (
                              <ChevronRight className="w-3 h-3 text-dim flex-shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Current Stage Info */}
                      <div className="bg-[#0a0e17] rounded-lg p-3 mb-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] font-medium text-subtle">
                            Stage {project.currentStage + 1}/{project.stages.length}: {currentStage.name}
                          </div>
                          <div className={`text-[10px] font-mono ${resourcesMet ? (colors?.text ?? 'text-fuchsia-400') : 'text-warning'}`}>
                            {(project.progress * 100).toFixed(1)}%
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-muted-label rounded-full overflow-hidden mb-3">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${project.progress * 100}%`,
                              background: colors?.gradient ?? 'linear-gradient(90deg, #d946ef, #e879f9)',
                              opacity: resourcesMet ? 1 : 0.5,
                            }}
                          />
                        </div>

                        {/* Required Resources */}
                        <div className="space-y-1.5">
                          <div className="text-[10px] text-muted-label flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Required Materials (must be held)
                          </div>
                          {currentStage.requiredResources.map((r, i) => {
                            const resKey = r.resource as ResourceType;
                            const meta = RESOURCE_META[resKey];
                            const current = r.resource === 'money' ? store.money : store.resources[resKey] ?? 0;
                            const enough = current >= r.amount;

                            return (
                              <div key={i} className="flex items-center justify-between text-[11px]">
                                <div className="flex items-center gap-1.5">
                                  {meta ? <GameIcon icon={meta.icon} size={16} /> : <GameIcon icon="gi:money-stack" size={16} />}
                                  <span className="text-subtle">{meta?.name ?? 'Money'}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className={enough ? 'text-success' : 'text-danger'}>
                                    {formatNumber(current)}
                                  </span>
                                  <span className="text-muted-label">/</span>
                                  <span className={enough ? 'text-subtle' : 'text-danger'}>
                                    {formatNumber(r.amount)}
                                  </span>
                                  {enough ? (
                                    <Check className="w-3 h-3 text-success" />
                                  ) : (
                                    <AlertTriangle className="w-3 h-3 text-danger" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Time estimate */}
                        <div className="mt-2 text-[10px] text-muted-label">
                          <GameIcon icon="gi:clockwork" size={12} className="inline" /> Est. {currentStage.timeRequired} ticks ({(currentStage.timeRequired / 60).toFixed(0)} min at 1x)
                          {!resourcesMet && <span className="text-warning ml-2">(paused until resources available)</span>}
                        </div>
                      </div>

                      {/* Status Indicator */}
                      <div className="flex items-center gap-2">
                        {resourcesMet ? (
                          <div className="flex-1 text-center text-[11px] text-subtle flex items-center justify-center gap-1.5">
                            <span className={`inline-block w-2 h-2 rounded-full ${colors?.text?.replace('text-', 'bg-') ?? 'bg-fuchsia-400'}`} style={{ animation: 'neonPulse 2s ease-in-out infinite' }} />
                            Construction in progress...
                          </div>
                        ) : (
                          <div className="flex-1 text-center text-[11px] text-warning flex items-center justify-center gap-1.5">
                            <Pause className="w-3 h-3" />
                            Paused — need more resources
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}

                {/* Start Button (if unlocked but not active) */}
                {unlocked && !project.active && !project.completed && (
                  <Button
                    onClick={() => store.startMegaProject(project.type)}
                    className={`w-full text-xs h-9 ${colors?.bg ?? 'bg-muted-label/50'} hover:opacity-80 border ${colors?.border ?? 'border-muted-label/30'} ${colors?.text ?? 'text-subtle'}`}
                    size="sm"
                    variant="outline"
                  >
                    <Rocket className="w-3.5 h-3.5 mr-1.5" />
                    Begin {project.name}
                  </Button>
                )}

                {/* Completed Stages List */}
                {project.active && !project.completed && (
                  <div className="mt-3 space-y-1">
                    <div className="text-[10px] text-muted-label">Stage Progress</div>
                    {project.stages.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        {s.completed ? (
                          <Check className="w-3 h-3 text-success" />
                        ) : i === project.currentStage ? (
                          <span className={`w-3 h-3 rounded-full border ${colors?.border ?? 'border-fuchsia-500/40'} ${colors?.bg ?? 'bg-fuchsia-900/10'}`} style={{ animation: 'neonPulse 2s ease-in-out infinite' }} />
                        ) : (
                          <span className="w-3 h-3 rounded-full bg-muted-label" />
                        )}
                        <span className={s.completed ? 'text-success' : i === project.currentStage ? (colors?.text ?? 'text-fuchsia-400') : 'text-muted-label'}>
                          {s.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Completed Project Glow Effect */}
                {project.completed && (
                  <div className="mt-2 space-y-1">
                    {project.stages.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <Check className="w-3 h-3 text-success" />
                        <span className="text-success/60">{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Gradient scroll indicator at bottom of project grid */}
        <div className="hidden lg:block absolute bottom-0 left-0 right-0 h-8 pointer-events-none bg-gradient-to-t from-[#0a0e17] to-transparent opacity-50" />
      </div>

      {/* Info Section */}
      <div className="game-card rounded-xl bg-card p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-fuchsia-400" />
          <h3 className="text-sm font-semibold text-fuchsia-400">About MegaProjects</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[11px] text-muted-label">
          <div>
            <div className="text-subtle font-medium mb-1">How It Works</div>
            <p>Each MegaProject has multiple stages. Start the project, then maintain the required resources to keep construction progressing. If resources run out, construction pauses until they&apos;re available again. Resources are consumed when each stage completes.</p>
          </div>
          <div>
            <div className="text-subtle font-medium mb-1">Permanent Bonuses</div>
            <p>Completed MegaProjects grant 9 types of permanent empire-wide bonuses: transport, power, research, production, storage, market, extraction, worker efficiency, and building cost reduction. The strongest boosts in the game.</p>
          </div>
          <div>
            <div className="text-subtle font-medium mb-1">Strategy Tips</div>
            <p>Start with Quantum Internet (easiest unlock) for +100% research speed. Deep Core Extractor boosts all raw material output by 75%. Build production chains that sustain the required materials to keep construction running.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
