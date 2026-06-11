'use client';

import { useMemo, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { WORKER_DEFS, BUILDING_DEFS } from '@/lib/game/configCache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, UserPlus, Briefcase, Star,
  Wrench, Bot, Shield, X, BarChart3,
  Zap, TrendingUp
} from 'lucide-react';
import { WorkerType } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { LoadingSpinner } from '@/components/game/shared/LoadingSpinner';
import { GameIcon } from '@/components/game/shared/GameIcon';

// Radar chart helper: compute polygon points for a 3-axis spider chart
function RadarChart({ values, labels, colors, size = 160 }: {
  values: number[]; // 0-1 normalized
  labels: string[];
  colors: string[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;
  const axes = values.length;

  // Axis positions (top, bottom-right, bottom-left for 3 axes)
  const getPoint = (i: number, val: number) => {
    const angle = (Math.PI * 2 * i) / axes - Math.PI / 2;
    return {
      x: cx + r * val * Math.cos(angle),
      y: cy + r * val * Math.sin(angle),
    };
  };

  const points = values.map((v, i) => {
    const p = getPoint(i, v);
    return `${p.x},${p.y}`;
  }).join(' ');

  const axisLines = Array.from({ length: axes }, (_, i) => {
    const p = getPoint(i, 1);
    return { x1: cx, y1: cy, x2: p.x, y2: p.y };
  });

  const labelPositions = values.map((_, i) => {
    const p = getPoint(i, 1.35);
    return p;
  });

  // Grid rings (25%, 50%, 75%, 100%)
  const gridRings = [0.25, 0.5, 0.75, 1].map(scale => {
    return Array.from({ length: axes }, (_, i) => {
      const p = getPoint(i, scale);
      return `${p.x},${p.y}`;
    }).join(' ');
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {/* Grid rings */}
      {gridRings.map((ring, idx) => (
        <polygon key={idx} points={ring} fill="none" stroke="#1e293b" strokeWidth="0.5" />
      ))}
      {/* Axis lines */}
      {axisLines.map((line, i) => (
        <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#1e293b" strokeWidth="0.5" />
      ))}
      {/* Data polygon fill */}
      <polygon points={points} fill="rgba(14, 165, 233, 0.15)" stroke="#0ea5e9" strokeWidth="1.5" />
      {/* Data points */}
      {values.map((v, i) => {
        const p = getPoint(i, v);
        return <circle key={i} cx={p.x} cy={p.y} r="3" fill={colors[i]} />;
      })}
      {/* Labels */}
      {labels.map((label, i) => {
        const pos = labelPositions[i];
        return (
          <text
            key={i}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[8px] fill-gray-400"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export function WorkerPanel() {
  const buildings = useGameStore((s) => s.buildings);
  const workers = useGameStore((s) => s.workers);
  const money = useGameStore((s) => s.money);
  const assignWorker = useGameStore((s) => s.assignWorker);
  const hireWorker = useGameStore((s) => s.hireWorker);
  const [selectedWorkerType, setSelectedWorkerType] = useState<WorkerType>('engineer');
  const [hiringType, setHiringType] = useState<WorkerType | null>(null);

  const workerTypes: WorkerType[] = ['engineer', 'mechanic', 'transportManager', 'aiSupervisor'];

  const workersByType = useMemo(() => {
    const grouped: Record<WorkerType, typeof workers> = {
      engineer: [],
      mechanic: [],
      transportManager: [],
      aiSupervisor: [],
    };
    workers.forEach(w => grouped[w.type].push(w));
    return grouped;
  }, [workers]);

  const totalWorkerBonus = useMemo(() => {
    let efficiency = 0;
    let speed = 0;
    workers.forEach(w => {
      const def = WORKER_DEFS[w.type];
      efficiency += def.effects.efficiency * w.level;
      speed += def.effects.speed * w.level;
    });
    return { efficiency, speed };
  }, [workers]);

  // Radar chart data for selected worker type
  const radarData = useMemo(() => {
    const def = WORKER_DEFS[selectedWorkerType];
    const workers = workersByType[selectedWorkerType];
    const avgLevel = workers.length > 0 ? workers.reduce((s, w) => s + w.level, 0) / workers.length : 0;
    // Normalize to 0-1 range (max ~10 levels is 1.0)
    return {
      values: [
        Math.min(1, (def.effects.efficiency * avgLevel) / 0.5),
        Math.min(1, (def.effects.speed * avgLevel) / 0.5),
        Math.min(1, (def.effects.maintenance * avgLevel) / 0.5),
      ],
      labels: ['Efficiency', 'Speed', 'Maintenance'],
      colors: ['#22c55e', '#06b6d4', '#f97316'],
    };
  }, [selectedWorkerType, workersByType]);

  // Productivity comparison data
  const productivityComparison = useMemo(() => {
    const assignedWorkers = workers.filter(w => w.assignedTo);
    const unassignedWorkers = workers.filter(w => !w.assignedTo);

    let assignedEff = 0;
    let unassignedEff = 0;
    assignedWorkers.forEach(w => {
      const def = WORKER_DEFS[w.type];
      assignedEff += def.effects.efficiency * w.level;
    });
    unassignedWorkers.forEach(w => {
      const def = WORKER_DEFS[w.type];
      unassignedEff += def.effects.efficiency * w.level;
    });

    // Buildings with workers get +efficiency bonus from the worker
    const buildingsWithWorkers = buildings.filter(b =>
      b.active && workers.some(w => w.assignedTo === b.id)
    ).length;
    const activeBuildings = buildings.filter(b => b.active).length;

    return {
      assignedCount: assignedWorkers.length,
      unassignedCount: unassignedWorkers.length,
      assignedEff,
      unassignedEff,
      buildingsWithWorkers,
      activeBuildings,
      coveragePct: activeBuildings > 0 ? (buildingsWithWorkers / activeBuildings) * 100 : 0,
    };
  }, [workers, buildings]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sky-400 neon-glow-cyan tracking-wide">Workforce</h2>
          <p className="text-xs text-muted-label mt-0.5">Hire and assign workers to boost production</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-sky-500/50 text-sky-400 bg-sky-900/20 text-xs">
            <Users className="w-3 h-3 mr-1" />
            {workers.length} workers
          </Badge>
          <Badge variant="outline" className="border-success/50 text-success bg-success/20 text-xs">
            <Star className="w-3 h-3 mr-1" />
            +{(totalWorkerBonus.efficiency * 100).toFixed(0)}% eff
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-card p-3 border border-sky-900/30">
          <div className="text-[10px] text-muted-label mb-1">Total Workers</div>
          <div className="text-lg font-bold font-mono text-sky-400">{workers.length}</div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-sky-900/30">
          <div className="text-[10px] text-muted-label mb-1">Assigned</div>
          <div className="text-lg font-bold font-mono text-success">{workers.filter(w => w.assignedTo).length}</div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-sky-900/30">
          <div className="text-[10px] text-muted-label mb-1">Total Efficiency</div>
          <div className="text-lg font-bold font-mono text-cyan-400">+{(totalWorkerBonus.efficiency * 100).toFixed(0)}%</div>
        </div>
        <div className="game-card rounded-xl bg-card p-3 border border-sky-900/30">
          <div className="text-[10px] text-muted-label mb-1">Total Speed</div>
          <div className="text-lg font-bold font-mono text-purple-400">+{(totalWorkerBonus.speed * 100).toFixed(0)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hire Workers */}
        <div className="lg:col-span-2 space-y-4">
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-sky-400">Hire Workers</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {workerTypes.map(type => {
                const def = WORKER_DEFS[type];
                const canAfford = money >= def.baseHireCost;
                const count = workersByType[type].length;

                return (
                  <GameItemTooltip
                    key={type}
                    name={def.name}
                    icon={def.icon}
                    description={def.description}
                    category="Worker"
                    details={[
                      { label: 'Hire Cost', value: `$${formatNumber(def.baseHireCost)}`, color: canAfford ? 'text-success' : 'text-danger' },
                      { label: 'Efficiency /lv', value: `+${(def.effects.efficiency * 100).toFixed(0)}%`, color: 'text-success' },
                      { label: 'Speed /lv', value: `+${(def.effects.speed * 100).toFixed(0)}%`, color: 'text-cyan-400' },
                      { label: 'Maintenance /lv', value: `-${(def.effects.maintenance * 100).toFixed(0)}%`, color: 'text-orange-400' },
                      { label: 'Hired', value: `${count}` },
                    ]}
                    side="bottom"
                  >
                  <div className="bg-[#0a0e17] rounded-lg p-3 border border-muted-label">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-sky-900/20 flex items-center justify-center text-xl">
                        <GameIcon icon={def.icon} size={16} />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-medium text-gray-200">{def.name}</div>
                        <div className="text-[10px] text-subtle">{def.description}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] border-muted-label text-subtle px-1">
                        {count} hired
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="bg-card rounded px-2 py-1 text-center">
                        <div className="text-[9px] text-muted-label">Eff/lv</div>
                        <div className="text-[10px] font-mono text-success">+{(def.effects.efficiency * 100).toFixed(0)}%</div>
                      </div>
                      <div className="bg-card rounded px-2 py-1 text-center">
                        <div className="text-[9px] text-muted-label">Spd/lv</div>
                        <div className="text-[10px] font-mono text-cyan-400">+{(def.effects.speed * 100).toFixed(0)}%</div>
                      </div>
                      <div className="bg-card rounded px-2 py-1 text-center">
                        <div className="text-[9px] text-muted-label">Maint/lv</div>
                        <div className="text-[10px] font-mono text-orange-400">-{(def.effects.maintenance * 100).toFixed(0)}%</div>
                      </div>
                    </div>

                    <Button
                      onClick={() => {
                        setHiringType(type);
                        hireWorker(type);
                        setTimeout(() => setHiringType(null), 300);
                      }}
                      disabled={!canAfford || hiringType === type}
                      className={`w-full text-xs h-7 min-h-[36px] ${canAfford ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'bg-muted-label text-muted-label'}`}
                      size="sm"
                    >
                      {hiringType === type ? <LoadingSpinner /> : `Hire for $${formatNumber(def.baseHireCost)}`}
                    </Button>
                  </div>
                  </GameItemTooltip>
                );
              })}
            </div>
          </div>

          {/* Worker Assignment Manager */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-sky-400 flex items-center gap-2">
                <Users className="w-4 h-4" /> Worker Assignments
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] border-sky-800 text-sky-400 hover:bg-sky-900/30"
                aria-pressed={false}
                onClick={() => {
                  // Auto-assign unassigned workers
                  const unassigned = workers.filter(w => !w.assignedTo);
                  const unassignedBuildings = buildings.filter(b =>
                    b.active && !workers.some(w => w.assignedTo === b.id)
                  );
                  unassigned.forEach((worker, i) => {
                    if (i < unassignedBuildings.length) {
                      assignWorker(worker.id, unassignedBuildings[i].id);
                    }
                  });
                }}
              >
                <Bot className="w-3 h-3 mr-1" /> Auto-Assign
              </Button>
            </div>

            {/* Building assignment list */}
            <div className="space-y-2 max-h-80 overflow-y-auto game-scrollbar">
              {buildings.filter(b => b.active).map(building => {
                const def = BUILDING_DEFS[building.type];
                if (!def) return null;
                const assignedWorker = workers.find(w => w.assignedTo === building.id);

                return (
                  <div key={building.id} className="flex items-center gap-3 bg-[#0a0e17] rounded-lg p-3 border border-muted-label/50">
                    <GameIcon icon={def.icon} size={20} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 font-medium truncate">{def.name}</div>
                      <div className="text-[9px] text-muted-label">Lv.{building.level} • {(building.efficiency * 100).toFixed(0)}% eff</div>
                    </div>
                    {assignedWorker ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[8px] border-success text-success px-1.5 py-0">
                          {assignedWorker.type.slice(0, 3).toUpperCase()} Lv.{assignedWorker.level}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-muted-label hover:text-cyan-400 min-h-[36px] min-w-[36px]"
                          onClick={() => assignWorker(assignedWorker.id, null)}
                          aria-label="Unassign worker"
                        >
                          <X className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    ) : (
                      <select
                        className="h-6 text-[9px] bg-muted-label border border-muted-label rounded text-subtle px-1"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            assignWorker(e.target.value, building.id);
                          }
                        }}
                      >
                        <option value="">Assign...</option>
                        {workers.filter(w => !w.assignedTo).map(w => (
                          <option key={w.id} value={w.id}>
                            {w.type} Lv.{w.level}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}

              {buildings.filter(b => b.active).length === 0 && (
                <div className="text-center py-6 text-muted-label">
                  <p className="text-xs">No active buildings to assign workers to</p>
                </div>
              )}
            </div>
          </div>

          {/* Worker Roster */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-sky-400">Worker Roster</h3>
            </div>
            {workers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 text-dim mx-auto mb-2" />
                <p className="text-xs text-muted-label">No workers hired yet</p>
                <p className="text-[10px] text-muted-label mt-1">Workers boost building efficiency and speed</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto game-scrollbar">
                {workers.map(worker => {
                  const def = WORKER_DEFS[worker.type];
                  const assignedBuilding = worker.assignedTo ? buildings.find(b => b.id === worker.assignedTo) : null;
                  const assignedDef = assignedBuilding ? BUILDING_DEFS[assignedBuilding.type] : null;
                  const xpNeeded = worker.level * 100;
                  const xpPercent = (worker.experience / xpNeeded) * 100;

                  return (
                    <div key={worker.id} className="bg-[#0a0e17] rounded-lg p-3 border border-muted-label">
                      <div className="flex items-center gap-2 mb-2">
                        <GameIcon icon={def.icon} size={16} />
                        <span className="text-xs text-gray-200 font-medium">{def.name}</span>
                        <Badge variant="outline" className="text-[9px] border-sky-700 text-sky-400 px-1">
                          Lv.{worker.level}
                        </Badge>
                        <div className="ml-auto flex items-center gap-1">
                          {assignedDef ? (
                            <Badge className="text-[9px] bg-success/20 text-success border-0">
                              <GameIcon icon={assignedDef.icon} size={14} className="inline-flex" /> {assignedDef.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] border-muted-label text-muted-label">
                              Unassigned
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* XP bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 bg-muted-label rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all"
                            style={{ width: `${xpPercent}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-muted-label font-mono">{worker.experience.toFixed(0)}/{xpNeeded} XP</span>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <div className="bg-card rounded px-2 py-0.5 text-center">
                          <div className="text-[9px] text-muted-label">Efficiency</div>
                          <div className="text-[10px] font-mono text-success">{(worker.efficiency * 100).toFixed(0)}%</div>
                        </div>
                        <div className="bg-card rounded px-2 py-0.5 text-center">
                          <div className="text-[9px] text-muted-label">Speed</div>
                          <div className="text-[10px] font-mono text-cyan-400">{(worker.speed * 100).toFixed(0)}%</div>
                        </div>
                        <div className="bg-card rounded px-2 py-0.5 text-center">
                          <div className="text-[9px] text-muted-label">Bonus</div>
                          <div className="text-[10px] font-mono text-purple-400">+{(def.effects.speed * worker.level * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      {/* Assign to building */}
                      <div className="flex items-center gap-2">
                        <select
                          value={worker.assignedTo ?? ''}
                          onChange={e => assignWorker(worker.id, e.target.value || null)}
                          className="flex-1 bg-card border border-muted-label rounded px-2 py-1 text-[10px] text-subtle focus:border-cyan-500/50 focus:outline-none"
                        >
                          <option value="">Unassigned</option>
                          {buildings.filter(b => b.active).map(b => {
                            const bDef = BUILDING_DEFS[b.type];
                            return (
                              <option key={b.id} value={b.id}>
                                {bDef?.name} Lv.{b.level}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Worker Efficiency Radar Chart */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-sky-400">Efficiency Radar</h3>
            </div>

            {/* Worker type selector */}
            <div className="flex gap-1.5 mb-3">
              {workerTypes.map(type => {
                const def = WORKER_DEFS[type];
                const isActive = selectedWorkerType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedWorkerType(type)}
                    aria-label={`Select ${WORKER_DEFS[type].name}`}
                    className={`flex-1 text-[9px] px-1.5 py-1 rounded-md border transition-all ${
                      isActive
                        ? 'border-sky-500/50 bg-sky-900/20 text-sky-400'
                        : 'border-muted-label text-muted-label hover:border-muted-label'
                    }`}
                  >
                    <GameIcon icon={def.icon} size={16} />
                  </button>
                );
              })}
            </div>

            {/* Radar chart */}
            <RadarChart
              values={radarData.values}
              labels={radarData.labels}
              colors={radarData.colors}
              size={160}
            />

            {/* Stats under radar */}
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              {radarData.labels.map((label, i) => (
                <div key={label} className="bg-[#0a0e17] rounded px-2 py-1 text-center">
                  <div className="text-[8px] text-muted-label">{label}</div>
                  <div className="text-[10px] font-mono" style={{ color: radarData.colors[i] }}>
                    {(radarData.values[i] * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[9px] text-muted-label mt-2 text-center">
              Avg stats for {WORKER_DEFS[selectedWorkerType].name} workers
            </div>
          </div>

          {/* Worker Productivity Comparison */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-success" />
              <h3 className="text-sm font-semibold text-success">Productivity</h3>
            </div>

            {/* Coverage bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-muted-label">Building Coverage</span>
                <span className="text-[9px] font-mono text-success">{productivityComparison.coveragePct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-muted-label rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all"
                  style={{ width: `${productivityComparison.coveragePct}%` }}
                />
              </div>
              <div className="text-[8px] text-muted-label mt-0.5">
                {productivityComparison.buildingsWithWorkers}/{productivityComparison.activeBuildings} buildings staffed
              </div>
            </div>

            {/* Assigned vs Unassigned comparison */}
            <div className="space-y-2">
              <div className="bg-[#0a0e17] rounded-lg p-3 border border-success/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-success font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Assigned
                  </span>
                  <span className="text-[10px] font-mono text-subtle">{productivityComparison.assignedCount} workers</span>
                </div>
                <div className="text-[9px] text-muted-label">
                  +{(productivityComparison.assignedEff * 100).toFixed(0)}% efficiency boost
                </div>
                <div className="mt-1 h-1 bg-muted-label rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full"
                    style={{ width: `${Math.min(100, productivityComparison.assignedEff * 200)}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#0a0e17] rounded-lg p-3 border border-muted-label/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-subtle font-medium flex items-center gap-1">
                    <Users className="w-3 h-3" /> Unassigned
                  </span>
                  <span className="text-[10px] font-mono text-subtle">{productivityComparison.unassignedCount} workers</span>
                </div>
                <div className="text-[9px] text-muted-label">
                  +{(productivityComparison.unassignedEff * 100).toFixed(0)}% wasted efficiency
                </div>
                <div className="mt-1 h-1 bg-muted-label rounded-full overflow-hidden">
                  <div
                    className="h-full bg-muted-label rounded-full"
                    style={{ width: `${Math.min(100, productivityComparison.unassignedEff * 200)}%` }}
                  />
                </div>
              </div>
            </div>

            {productivityComparison.unassignedCount > 0 && (
              <div className="mt-2 text-[9px] text-warning/80 bg-yellow-900/10 rounded px-2 py-1 border border-yellow-900/20">
                <GameIcon icon="gi:hazard-sign" size={14} className="inline" /> {productivityComparison.unassignedCount} worker{productivityComparison.unassignedCount > 1 ? 's' : ''} not assigned — assign them to boost production!
              </div>
            )}
          </div>

          {/* Worker Summary */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-sky-400">Workforce Summary</h3>
            </div>
            <div className="space-y-2">
              {workerTypes.map(type => {
                const def = WORKER_DEFS[type];
                const workers = workersByType[type];
                const avgLevel = workers.length > 0 ? (workers.reduce((s, w) => s + w.level, 0) / workers.length).toFixed(1) : '-';
                const assigned = workers.filter(w => w.assignedTo).length;

                return (
                  <div key={type} className="bg-[#0a0e17] rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GameIcon icon={def.icon} size={14} className="inline-flex" />
                        <span className="text-xs text-subtle">{def.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-subtle font-mono">{workers.length}</span>
                        <span className="text-muted-label">|</span>
                        <span className="text-sky-400 font-mono">Avg Lv.{avgLevel}</span>
                        <span className="text-muted-label">|</span>
                        <span className="text-success font-mono">{assigned} assigned</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tips */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-subtle" />
              <h3 className="text-sm font-semibold text-subtle">Worker Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-muted-label">
              <p>• Workers level up automatically over time</p>
              <p>• Assign engineers to factories for production boost</p>
              <p>• Mechanics reduce maintenance costs</p>
              <p>• Transport managers optimize logistics speed</p>
              <p>• AI supervisors enhance automation systems</p>
              <p>• Research &quot;Worker Training&quot; for +25% efficiency</p>
              <p>• Use Auto-Assign to quickly staff all buildings</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
