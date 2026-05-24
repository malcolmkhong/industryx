'use client';

import { useMemo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { WORKER_DEFS, BUILDING_DEFS } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users, UserPlus, ArrowRight, Briefcase, Star,
  Wrench, Cpu, Route, Bot, Shield
} from 'lucide-react';
import { WorkerType } from '@/lib/game/types';

export function WorkerPanel() {
  const store = useGameStore();

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
                  <div key={type} className="bg-[#0a0e17] rounded-lg p-3 border border-gray-800">
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
                );
              })}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
