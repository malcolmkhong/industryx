'use client';

import { useMemo, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { WORKER_DEFS, BUILDING_DEFS } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, UserPlus, Briefcase, Star,
  Wrench, Bot, Shield, X, BarChart3,
  Zap, TrendingUp
} from 'lucide-react';
import { WorkerType } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';

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
  const store = useGameStore();
  const [selectedWorkerType, setSelectedWorkerType] = useState<WorkerType>('engineer');

  const workerTypes: WorkerType[] = ['engineer', 'mechanic', 'transportManager', 'aiSupervisor'];

  const workersByType = useMemo(() => {
    const grouped: Record<WorkerType, typeof store.workers> = {
      engineer: [],
      mechanic: [],
      transportManager: [],
      aiSupervisor: [],
    };
    store.workers.forEach(w => grouped[w.type].push(w));
    return grouped;
  }, [store.workers]);

  const totalWorkerBonus = useMemo(() => {
    let efficiency = 0;
    let speed = 0;
    store.workers.forEach(w => {
      const def = WORKER_DEFS[w.type];
      efficiency += def.effects.efficiency * w.level;
      speed += def.effects.speed * w.level;
    });
    return { efficiency, speed };
  }, [store.workers]);

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
    const assignedWorkers = store.workers.filter(w => w.assignedTo);
    const unassignedWorkers = store.workers.filter(w => !w.assignedTo);

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
    const buildingsWithWorkers = store.buildings.filter(b =>
      b.active && store.workers.some(w => w.assignedTo === b.id)
    ).length;
    const activeBuildings = store.buildings.filter(b => b.active).length;

    return {
      assignedCount: assignedWorkers.length,
      unassignedCount: unassignedWorkers.length,
      assignedEff,
      unassignedEff,
      buildingsWithWorkers,
      activeBuildings,
      coveragePct: activeBuildings > 0 ? (buildingsWithWorkers / activeBuildings) * 100 : 0,
    };
  }, [store.workers, store.buildings]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-sky-400 neon-glow-cyan tracking-wide">Workforce</h2>
          <p className="text-xs text-gray-500 mt-0.5">Hire and assign workers to boost production</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-sky-500/50 text-sky-400 bg-sky-900/20 text-xs">
            <Users className="w-3 h-3 mr-1" />
            {store.workers.length} workers
          </Badge>
          <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-900/20 text-xs">
            <Star className="w-3 h-3 mr-1" />
            +{(totalWorkerBonus.efficiency * 100).toFixed(0)}% eff
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-sky-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Total Workers</div>
          <div className="text-lg font-bold font-mono text-sky-400">{store.workers.length}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-sky-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Assigned</div>
          <div className="text-lg font-bold font-mono text-green-400">{store.workers.filter(w => w.assignedTo).length}</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-sky-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Total Efficiency</div>
          <div className="text-lg font-bold font-mono text-cyan-400">+{(totalWorkerBonus.efficiency * 100).toFixed(0)}%</div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-sky-900/30">
          <div className="text-[10px] text-gray-500 mb-1">Total Speed</div>
          <div className="text-lg font-bold font-mono text-purple-400">+{(totalWorkerBonus.speed * 100).toFixed(0)}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hire Workers */}
        <div className="lg:col-span-2 space-y-4">
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-sky-400">Hire Workers</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {workerTypes.map(type => {
                const def = WORKER_DEFS[type];
                const canAfford = store.money >= def.baseHireCost;
                const count = workersByType[type].length;

                return (
                  <GameItemTooltip
                    key={type}
                    name={def.name}
                    emoji={def.emoji}
                    description={def.description}
                    category="Worker"
                    details={[
                      { label: 'Hire Cost', value: `$${formatNumber(def.baseHireCost)}`, color: canAfford ? 'text-green-400' : 'text-red-400' },
                      { label: 'Efficiency /lv', value: `+${(def.effects.efficiency * 100).toFixed(0)}%`, color: 'text-green-400' },
                      { label: 'Speed /lv', value: `+${(def.effects.speed * 100).toFixed(0)}%`, color: 'text-cyan-400' },
                      { label: 'Maintenance /lv', value: `-${(def.effects.maintenance * 100).toFixed(0)}%`, color: 'text-orange-400' },
                      { label: 'Hired', value: `${count}` },
                    ]}
                    side="bottom"
                  >
                  <div className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-sky-900/20 flex items-center justify-center text-xl">
                        {def.emoji}
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-medium text-gray-200">{def.name}</div>
                        <div className="text-[10px] text-gray-400">{def.description}</div>
                      </div>
                      <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400 px-1">
                        {count} hired
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 mb-2">
                      <div className="bg-[#111827] rounded px-2 py-1 text-center">
                        <div className="text-[9px] text-gray-500">Eff/lv</div>
                        <div className="text-[10px] font-mono text-green-400">+{(def.effects.efficiency * 100).toFixed(0)}%</div>
                      </div>
                      <div className="bg-[#111827] rounded px-2 py-1 text-center">
                        <div className="text-[9px] text-gray-500">Spd/lv</div>
                        <div className="text-[10px] font-mono text-cyan-400">+{(def.effects.speed * 100).toFixed(0)}%</div>
                      </div>
                      <div className="bg-[#111827] rounded px-2 py-1 text-center">
                        <div className="text-[9px] text-gray-500">Maint/lv</div>
                        <div className="text-[10px] font-mono text-orange-400">-{(def.effects.maintenance * 100).toFixed(0)}%</div>
                      </div>
                    </div>

                    <Button
                      onClick={() => store.hireWorker(type)}
                      disabled={!canAfford}
                      className={`w-full text-xs h-7 ${canAfford ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'bg-gray-800 text-gray-500'}`}
                      size="sm"
                    >
                      Hire for ${formatNumber(def.baseHireCost)}
                    </Button>
                  </div>
                  </GameItemTooltip>
                );
              })}
            </div>
          </div>

          {/* Worker Assignment Manager */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-sky-400 flex items-center gap-2">
                <Users className="w-4 h-4" /> Worker Assignments
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[10px] border-sky-800 text-sky-400 hover:bg-sky-900/30"
                onClick={() => {
                  // Auto-assign unassigned workers
                  const unassigned = store.workers.filter(w => !w.assignedTo);
                  const unassignedBuildings = store.buildings.filter(b =>
                    b.active && !store.workers.some(w => w.assignedTo === b.id)
                  );
                  unassigned.forEach((worker, i) => {
                    if (i < unassignedBuildings.length) {
                      store.assignWorker(worker.id, unassignedBuildings[i].id);
                    }
                  });
                }}
              >
                <Bot className="w-3 h-3 mr-1" /> Auto-Assign
              </Button>
            </div>

            {/* Building assignment list */}
            <div className="space-y-2 max-h-80 overflow-y-auto game-scrollbar">
              {store.buildings.filter(b => b.active).map(building => {
                const def = BUILDING_DEFS[building.type];
                if (!def) return null;
                const assignedWorker = store.workers.find(w => w.assignedTo === building.id);

                return (
                  <div key={building.id} className="flex items-center gap-3 bg-[#0a0e17] rounded-lg p-2.5 border border-gray-800/50">
                    <span className="text-lg">{def.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 font-medium truncate">{def.name}</div>
                      <div className="text-[9px] text-gray-500">Lv.{building.level} • {(building.efficiency * 100).toFixed(0)}% eff</div>
                    </div>
                    {assignedWorker ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[8px] border-green-700 text-green-400 px-1.5 py-0">
                          {assignedWorker.type.slice(0, 3).toUpperCase()} Lv.{assignedWorker.level}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-gray-500 hover:text-cyan-400"
                          onClick={() => store.assignWorker(assignedWorker.id, null)}
                        >
                          <X className="w-2.5 h-2.5" />
                        </Button>
                      </div>
                    ) : (
                      <select
                        className="h-6 text-[9px] bg-gray-800 border border-gray-700 rounded text-gray-300 px-1"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            store.assignWorker(e.target.value, building.id);
                          }
                        }}
                      >
                        <option value="">Assign...</option>
                        {store.workers.filter(w => !w.assignedTo).map(w => (
                          <option key={w.id} value={w.id}>
                            {w.type} Lv.{w.level}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}

              {store.buildings.filter(b => b.active).length === 0 && (
                <div className="text-center py-6 text-gray-500">
                  <p className="text-xs">No active buildings to assign workers to</p>
                </div>
              )}
            </div>
          </div>

          {/* Worker Roster */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-sky-400">Worker Roster</h3>
            </div>
            {store.workers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No workers hired yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Workers boost building efficiency and speed</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto game-scrollbar">
                {store.workers.map(worker => {
                  const def = WORKER_DEFS[worker.type];
                  const assignedBuilding = worker.assignedTo ? store.buildings.find(b => b.id === worker.assignedTo) : null;
                  const assignedDef = assignedBuilding ? BUILDING_DEFS[assignedBuilding.type] : null;
                  const xpNeeded = worker.level * 100;
                  const xpPercent = (worker.experience / xpNeeded) * 100;

                  return (
                    <div key={worker.id} className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{def.emoji}</span>
                        <span className="text-xs text-gray-200 font-medium">{def.name}</span>
                        <Badge variant="outline" className="text-[9px] border-sky-700 text-sky-400 px-1">
                          Lv.{worker.level}
                        </Badge>
                        <div className="ml-auto flex items-center gap-1">
                          {assignedDef ? (
                            <Badge className="text-[9px] bg-green-900/20 text-green-400 border-0">
                              {assignedDef.emoji} {assignedDef.name}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-500">
                              Unassigned
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* XP bar */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all"
                            style={{ width: `${xpPercent}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-500 font-mono">{worker.experience.toFixed(0)}/{xpNeeded} XP</span>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        <div className="bg-[#111827] rounded px-2 py-0.5 text-center">
                          <div className="text-[9px] text-gray-500">Efficiency</div>
                          <div className="text-[10px] font-mono text-green-400">{(worker.efficiency * 100).toFixed(0)}%</div>
                        </div>
                        <div className="bg-[#111827] rounded px-2 py-0.5 text-center">
                          <div className="text-[9px] text-gray-500">Speed</div>
                          <div className="text-[10px] font-mono text-cyan-400">{(worker.speed * 100).toFixed(0)}%</div>
                        </div>
                        <div className="bg-[#111827] rounded px-2 py-0.5 text-center">
                          <div className="text-[9px] text-gray-500">Bonus</div>
                          <div className="text-[10px] font-mono text-purple-400">+{(def.effects.speed * worker.level * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      {/* Assign to building */}
                      <div className="flex items-center gap-2">
                        <select
                          value={worker.assignedTo ?? ''}
                          onChange={e => store.assignWorker(worker.id, e.target.value || null)}
                          className="flex-1 bg-[#111827] border border-gray-800 rounded px-2 py-1 text-[10px] text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                        >
                          <option value="">Unassigned</option>
                          {store.buildings.filter(b => b.active).map(b => {
                            const bDef = BUILDING_DEFS[b.type];
                            return (
                              <option key={b.id} value={b.id}>
                                {bDef?.emoji} {bDef?.name} Lv.{b.level}
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
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
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
                    className={`flex-1 text-[9px] px-1.5 py-1 rounded-md border transition-all ${
                      isActive
                        ? 'border-sky-500/50 bg-sky-900/20 text-sky-400'
                        : 'border-gray-800 text-gray-500 hover:border-gray-600'
                    }`}
                  >
                    {def.emoji}
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
                  <div className="text-[8px] text-gray-500">{label}</div>
                  <div className="text-[10px] font-mono" style={{ color: radarData.colors[i] }}>
                    {(radarData.values[i] * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[9px] text-gray-600 mt-2 text-center">
              Avg stats for {WORKER_DEFS[selectedWorkerType].name} workers
            </div>
          </div>

          {/* Worker Productivity Comparison */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <h3 className="text-sm font-semibold text-green-400">Productivity</h3>
            </div>

            {/* Coverage bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-gray-500">Building Coverage</span>
                <span className="text-[9px] font-mono text-green-400">{productivityComparison.coveragePct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-600 to-green-400 rounded-full transition-all"
                  style={{ width: `${productivityComparison.coveragePct}%` }}
                />
              </div>
              <div className="text-[8px] text-gray-600 mt-0.5">
                {productivityComparison.buildingsWithWorkers}/{productivityComparison.activeBuildings} buildings staffed
              </div>
            </div>

            {/* Assigned vs Unassigned comparison */}
            <div className="space-y-2">
              <div className="bg-[#0a0e17] rounded-lg p-2.5 border border-green-900/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-green-400 font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Assigned
                  </span>
                  <span className="text-[10px] font-mono text-gray-300">{productivityComparison.assignedCount} workers</span>
                </div>
                <div className="text-[9px] text-gray-500">
                  +{(productivityComparison.assignedEff * 100).toFixed(0)}% efficiency boost
                </div>
                <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${Math.min(100, productivityComparison.assignedEff * 200)}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#0a0e17] rounded-lg p-2.5 border border-gray-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                    <Users className="w-3 h-3" /> Unassigned
                  </span>
                  <span className="text-[10px] font-mono text-gray-300">{productivityComparison.unassignedCount} workers</span>
                </div>
                <div className="text-[9px] text-gray-500">
                  +{(productivityComparison.unassignedEff * 100).toFixed(0)}% wasted efficiency
                </div>
                <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-500 rounded-full"
                    style={{ width: `${Math.min(100, productivityComparison.unassignedEff * 200)}%` }}
                  />
                </div>
              </div>
            </div>

            {productivityComparison.unassignedCount > 0 && (
              <div className="mt-2 text-[9px] text-yellow-500/80 bg-yellow-900/10 rounded px-2 py-1 border border-yellow-900/20">
                ⚠ {productivityComparison.unassignedCount} worker{productivityComparison.unassignedCount > 1 ? 's' : ''} not assigned — assign them to boost production!
              </div>
            )}
          </div>

          {/* Worker Summary */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
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
                        <span className="text-sm">{def.emoji}</span>
                        <span className="text-xs text-gray-300">{def.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-gray-400 font-mono">{workers.length}</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-sky-400 font-mono">Avg Lv.{avgLevel}</span>
                        <span className="text-gray-600">|</span>
                        <span className="text-green-400 font-mono">{assigned} assigned</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tips */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Wrench className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Worker Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
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
