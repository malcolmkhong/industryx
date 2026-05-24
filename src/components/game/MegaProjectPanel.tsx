'use client';

import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META } from '@/lib/game/data';
import { ResourceType } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Rocket, Lock, Check, ChevronRight, Sparkles, AlertTriangle,
  Zap, ArrowUpRight, Cpu, Package, Trophy
} from 'lucide-react';

const PROJECT_COLORS: Record<string, { border: string; glow: string; bg: string; text: string; badge: string }> = {
  spaceElevator: { border: 'border-orange-500/40', glow: 'shadow-orange-500/20', bg: 'bg-orange-900/10', text: 'text-orange-400', badge: 'border-orange-500/50 text-orange-400 bg-orange-900/20' },
  dysonSphere: { border: 'border-yellow-500/40', glow: 'shadow-yellow-500/20', bg: 'bg-yellow-900/10', text: 'text-yellow-400', badge: 'border-yellow-500/50 text-yellow-400 bg-yellow-900/20' },
  quantumInternet: { border: 'border-cyan-500/40', glow: 'shadow-cyan-500/20', bg: 'bg-cyan-900/10', text: 'text-cyan-400', badge: 'border-cyan-500/50 text-cyan-400 bg-cyan-900/20' },
  fusionCity: { border: 'border-fuchsia-500/40', glow: 'shadow-fuchsia-500/20', bg: 'bg-fuchsia-900/10', text: 'text-fuchsia-400', badge: 'border-fuchsia-500/50 text-fuchsia-400 bg-fuchsia-900/20' },
  terraformingEngine: { border: 'border-emerald-500/40', glow: 'shadow-emerald-500/20', bg: 'bg-emerald-900/10', text: 'text-emerald-400', badge: 'border-emerald-500/50 text-emerald-400 bg-emerald-900/20' },
};

const BONUS_ICONS: Record<string, React.ReactNode> = {
  transportMultiplier: <Rocket className="w-3.5 h-3.5" />,
  powerMultiplier: <Zap className="w-3.5 h-3.5" />,
  researchMultiplier: <Cpu className="w-3.5 h-3.5" />,
  productionMultiplier: <ArrowUpRight className="w-3.5 h-3.5" />,
  unlimitedStorage: <Package className="w-3.5 h-3.5" />,
};

export function MegaProjectPanel() {
  const store = useGameStore();

  const isUnlocked = (project: typeof store.megaProjects[0]) => {
    const req = project.unlockRequirement;
    if (req.buildings && store.buildings.length < req.buildings) return false;
    if (req.research && store.completedResearch.length < req.research) return false;
    if (req.prestige && store.prestigeState.totalPrestiges < req.prestige) return false;
    return true;
  };

  const canContribute = (project: typeof store.megaProjects[0]) => {
    if (!project.active || project.completed) return false;
    const stage = project.stages[project.currentStage];
    if (!stage || stage.completed) return false;
    // Already contributed if progress > 0
    if (project.progress > 0) return false;
    return stage.requiredResources.every(r => {
      if (r.resource === 'money') return store.money >= r.amount;
      return store.resources[r.resource as ResourceType] >= r.amount;
    });
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-fuchsia-400 tracking-wide flex items-center gap-2" style={{ textShadow: '0 0 10px rgba(217,70,239,0.5), 0 0 20px rgba(217,70,239,0.3)' }}>
            <Sparkles className="w-5 h-5" />
            MEGA PROJECTS
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Massive endgame constructions that grant permanent empire-wide bonuses</p>
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
        </div>
      </div>

      {/* Completed MegaProjects Bonuses */}
      {completedCount > 0 && (
        <div className="game-card rounded-xl bg-[#111827] p-4 border border-fuchsia-900/30" style={{ boxShadow: '0 0 30px rgba(217,70,239,0.1)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-fuchsia-400" />
            <h3 className="text-sm font-semibold text-fuchsia-400">Active MegaProject Bonuses</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {store.megaProjects.filter(p => p.completed).map(p => {
              const colors = PROJECT_COLORS[p.type];
              return (
                <div key={p.type} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${colors.bg} border ${colors.border}`}>
                  <span className="text-lg">{p.emoji}</span>
                  <div>
                    <div className={`text-xs font-medium ${colors.text}`}>{p.name}</div>
                    <div className="text-[10px] text-green-400 flex items-center gap-1">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {store.megaProjects.map(project => {
          const colors = PROJECT_COLORS[project.type];
          const unlocked = isUnlocked(project);
          const currentStage = project.stages[project.currentStage];

          return (
            <div
              key={project.type}
              className={`game-card rounded-xl bg-[#111827] border transition-all duration-500 ${
                project.completed
                  ? `${colors.border} ring-1 ring-fuchsia-500/20`
                  : project.active
                    ? `${colors.border}`
                    : unlocked
                      ? 'border-gray-800'
                      : 'border-gray-800/50 opacity-70'
              }`}
              style={
                project.completed
                  ? { boxShadow: `0 0 40px rgba(217,70,239,0.15), 0 0 80px rgba(217,70,239,0.05)` }
                  : project.active
                    ? { boxShadow: `0 0 20px ${project.type === 'spaceElevator' ? 'rgba(249,115,22,0.1)' : project.type === 'dysonSphere' ? 'rgba(234,179,8,0.1)' : project.type === 'quantumInternet' ? 'rgba(6,182,212,0.1)' : project.type === 'fusionCity' ? 'rgba(217,70,239,0.1)' : 'rgba(16,185,129,0.1)'}` }
                    : undefined
              }
            >
              <div className="p-4 lg:p-5">
                {/* Project Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                    project.completed
                      ? `${colors.bg} neon-pulse`
                      : project.active
                        ? `${colors.bg}`
                        : unlocked
                          ? 'bg-gray-800/50'
                          : 'bg-gray-900/50'
                  }`}>
                    {project.completed ? project.emoji : unlocked ? project.emoji : <Lock className="w-5 h-5 text-gray-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm font-bold ${project.completed ? colors.text : unlocked ? 'text-gray-100' : 'text-gray-500'}`}>
                        {unlocked || project.completed ? project.name : '???'}
                      </h3>
                      {project.completed && (
                        <Badge className="bg-green-600/20 text-green-400 border-green-500/30 text-[9px] px-1.5">
                          <Check className="w-2.5 h-2.5 mr-0.5" /> COMPLETE
                        </Badge>
                      )}
                      {project.active && !project.completed && (
                        <Badge className={`${colors.badge} text-[9px] px-1.5`}>
                          <Zap className="w-2.5 h-2.5 mr-0.5" /> ACTIVE
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">
                      {unlocked || project.completed ? project.description : 'Meet unlock requirements to reveal this project'}
                    </p>
                  </div>
                </div>

                {/* Unlock Requirements (if locked) */}
                {!unlocked && !project.completed && (
                  <div className="bg-[#0a0e17] rounded-lg p-3 mb-3">
                    <div className="text-[10px] text-gray-500 font-medium mb-1.5 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Unlock Requirements
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {project.unlockRequirement.buildings && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${store.buildings.length >= (project.unlockRequirement.buildings ?? 0) ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                          {store.buildings.length}/{project.unlockRequirement.buildings} Buildings
                        </span>
                      )}
                      {project.unlockRequirement.research && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${store.completedResearch.length >= (project.unlockRequirement.research ?? 0) ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                          {store.completedResearch.length}/{project.unlockRequirement.research} Research
                        </span>
                      )}
                      {project.unlockRequirement.prestige && (
                        <span className={`text-[10px] px-2 py-0.5 rounded ${store.prestigeState.totalPrestiges >= (project.unlockRequirement.prestige ?? 0) ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                          {store.prestigeState.totalPrestiges}/{project.unlockRequirement.prestige} Prestiges
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Bonus Preview */}
                {unlocked && !project.completed && (
                  <div className={`${colors.bg} rounded-lg p-2.5 mb-3 border ${colors.border}`}>
                    <div className="text-[10px] text-gray-500 mb-0.5">Completion Bonus</div>
                    <div className={`text-xs font-medium ${colors.text} flex items-center gap-1.5`}>
                      {BONUS_ICONS[project.bonus.type]}
                      {project.bonus.description}
                    </div>
                  </div>
                )}

                {/* Completed Bonus */}
                {project.completed && (
                  <div className="bg-green-900/10 rounded-lg p-2.5 mb-3 border border-green-500/30">
                    <div className="text-[10px] text-green-400/60 mb-0.5">Permanent Bonus Active</div>
                    <div className="text-xs font-medium text-green-400 flex items-center gap-1.5">
                      {BONUS_ICONS[project.bonus.type]}
                      {project.bonus.description}
                    </div>
                  </div>
                )}

                {/* Stage Progress (if active) */}
                {project.active && !project.completed && currentStage && (
                  <>
                    {/* Stage Indicators */}
                    <div className="flex items-center gap-1 mb-3">
                      {project.stages.map((s, i) => (
                        <div key={i} className="flex items-center gap-1 flex-1">
                          <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                            s.completed
                              ? `bg-green-500`
                              : i === project.currentStage
                                ? `${colors.bg.replace('/10', '/30')} ${colors.text.replace('text-', 'bg-').replace('400', '500')}`
                                : 'bg-gray-800'
                          }`} style={i === project.currentStage && !s.completed ? {
                            background: `linear-gradient(90deg, ${project.type === 'spaceElevator' ? '#f97316' : project.type === 'dysonSphere' ? '#eab308' : project.type === 'quantumInternet' ? '#06b6d4' : project.type === 'fusionCity' ? '#d946ef' : '#10b981'} ${project.progress * 100}%, #1f2937 ${project.progress * 100}%)`,
                          } : undefined} />
                          {i < project.stages.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-gray-700 flex-shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Current Stage Info */}
                    <div className="bg-[#0a0e17] rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[11px] font-medium text-gray-300">
                          Stage {project.currentStage + 1}/{project.stages.length}: {currentStage.name}
                        </div>
                        <div className={`text-[10px] font-mono ${colors.text}`}>
                          {(project.progress * 100).toFixed(1)}%
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${project.progress * 100}%`,
                            background: project.type === 'spaceElevator' ? 'linear-gradient(90deg, #f97316, #fb923c)' :
                              project.type === 'dysonSphere' ? 'linear-gradient(90deg, #eab308, #facc15)' :
                              project.type === 'quantumInternet' ? 'linear-gradient(90deg, #06b6d4, #22d3ee)' :
                              project.type === 'fusionCity' ? 'linear-gradient(90deg, #d946ef, #e879f9)' :
                              'linear-gradient(90deg, #10b981, #34d399)',
                          }}
                        />
                      </div>

                      {/* Required Resources */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] text-gray-500">Required Resources</div>
                        {currentStage.requiredResources.map((r, i) => {
                          const resKey = r.resource as ResourceType;
                          const meta = RESOURCE_META[resKey];
                          const current = r.resource === 'money' ? store.money : store.resources[resKey] ?? 0;
                          const enough = current >= r.amount;

                          return (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5">
                                {meta ? <span>{meta.emoji}</span> : <span>💰</span>}
                                <span className="text-gray-400">{meta?.name ?? 'Money'}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className={enough ? 'text-green-400' : 'text-red-400'}>
                                  {formatNumber(current)}
                                </span>
                                <span className="text-gray-600">/</span>
                                <span className={enough ? 'text-gray-300' : 'text-red-300'}>
                                  {formatNumber(r.amount)}
                                </span>
                                {enough ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3 text-red-500" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Time estimate */}
                      <div className="mt-2 text-[10px] text-gray-600">
                        ⏱ Est. {currentStage.timeRequired} ticks ({(currentStage.timeRequired / 60).toFixed(0)} min at 1x)
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {project.progress === 0 ? (
                        <Button
                          onClick={() => store.contributeToMegaProject(project.type)}
                          disabled={!hasResources(project)}
                          className={`flex-1 text-xs h-8 ${
                            hasResources(project)
                              ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white'
                              : 'bg-gray-800 text-gray-500'
                          }`}
                          size="sm"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          {hasResources(project) ? 'Contribute Resources' : 'Insufficient Resources'}
                        </Button>
                      ) : (
                        <div className="flex-1 text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
                          <span className={`inline-block w-2 h-2 rounded-full ${colors.text.replace('text-', 'bg-')}`} style={{ animation: 'neonPulse 2s ease-in-out infinite' }} />
                          Construction in progress...
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Start Button (if unlocked but not active) */}
                {unlocked && !project.active && !project.completed && (
                  <Button
                    onClick={() => store.startMegaProject(project.type)}
                    className={`w-full text-xs h-9 ${colors.bg} hover:opacity-80 border ${colors.border} ${colors.text}`}
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
                    <div className="text-[10px] text-gray-600">Stage Progress</div>
                    {project.stages.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        {s.completed ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : i === project.currentStage ? (
                          <span className={`w-3 h-3 rounded-full border ${colors.border} ${colors.bg}`} style={{ animation: 'neonPulse 2s ease-in-out infinite' }} />
                        ) : (
                          <span className="w-3 h-3 rounded-full bg-gray-800" />
                        )}
                        <span className={s.completed ? 'text-green-400' : i === project.currentStage ? colors.text : 'text-gray-600'}>
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
                        <Check className="w-3 h-3 text-green-500" />
                        <span className="text-green-400/60">{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Section */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-fuchsia-400" />
          <h3 className="text-sm font-semibold text-fuchsia-400">About MegaProjects</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[11px] text-gray-500">
          <div>
            <div className="text-gray-400 font-medium mb-1">How It Works</div>
            <p>Each MegaProject has multiple stages. Contribute the required resources to start construction, then wait for each stage to complete automatically over time.</p>
          </div>
          <div>
            <div className="text-gray-400 font-medium mb-1">Permanent Bonuses</div>
            <p>Completed MegaProjects grant permanent empire-wide bonuses that persist across Global Expansions. The strongest boosts in the game.</p>
          </div>
          <div>
            <div className="text-gray-400 font-medium mb-1">Strategy Tips</div>
            <p>Start with Quantum Internet (easiest unlock) for +100% research speed. Dyson Sphere&apos;s +200% power is a game-changer for late-game production.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
