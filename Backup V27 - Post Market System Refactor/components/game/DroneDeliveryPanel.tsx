'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { Drone, DroneMission, ResourceType } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Plane, Package, Gauge, Fuel, ArrowRight, Zap, Trophy,
  Clock, DollarSign, FlaskConical, ChevronDown, ChevronUp,
  Send, ShoppingBag,
} from 'lucide-react';
import { GameIcon } from '@/components/game/shared/GameIcon';

// --- Helper: format tick duration ---
function formatDuration(ticks: number): string {
  if (ticks < 60) return `${ticks}s`;
  const mins = Math.floor(ticks / 60);
  const secs = ticks % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// --- Drone Status Badge ---
function DroneStatusBadge({ status }: { status: Drone['status'] }) {
  const config = {
    idle: { label: 'Idle', className: 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30' },
    delivering: { label: 'Delivering', className: 'bg-sky-900/40 text-sky-400 border-sky-500/30 animate-pulse' },
  };
  const c = config[status];
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${c.className}`}>
      {c.label}
    </Badge>
  );
}

// --- Upgrade Level Display ---
function UpgradeBar({ level, maxLevel = 5 }: { level: number; maxLevel?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: maxLevel }).map((_, i) => (
        <div
          key={i}
          className={`w-3 h-1.5 rounded-sm ${
            i < level ? 'bg-cyan-400 shadow-[0_0_4px_rgba(0,255,242,0.4)]' : 'bg-gray-700'
          }`}
        />
      ))}
    </div>
  );
}

// --- Visual Map: Buildings + Animated Drones ---
function DroneVisualMap({ missions, fleet, gameTick }: {
  missions: DroneMission[];
  fleet: Drone[];
  gameTick: number;
}) {
  // Create building positions in a grid
  const buildings = useMemo(() => {
    const seen = new Set<string>();
    const result: { name: string; x: number; y: number }[] = [];
    missions.forEach((m, i) => {
      if (!seen.has(m.fromBuilding)) {
        seen.add(m.fromBuilding);
        result.push({ name: m.fromBuilding, x: 10 + (result.length % 4) * 25, y: 10 + Math.floor(result.length / 4) * 35 });
      }
      if (!seen.has(m.toBuilding)) {
        seen.add(m.toBuilding);
        result.push({ name: m.toBuilding, x: 10 + (result.length % 4) * 25, y: 10 + Math.floor(result.length / 4) * 35 });
      }
    });
    return result;
  }, [missions]);

  // Get active drone animations
  const activeDrones = fleet.filter(d => d.status === 'delivering');
  const droneAnimations = useMemo(() => {
    return activeDrones.map(d => {
      const mission = missions.find(m => m.id === d.missionId);
      if (!mission) return null;
      const from = buildings.find(b => b.name === mission.fromBuilding);
      const to = buildings.find(b => b.name === mission.toBuilding);
      if (!from || !to) return null;

      const totalTicks = d.missionEndTick - (gameTick - Math.floor((d.missionEndTick - gameTick)));
      const elapsed = totalTicks > 0 ? Math.max(0, Math.min(1, 1 - (d.missionEndTick - gameTick) / totalTicks)) : 1;

      return {
        id: d.id,
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        progress: elapsed,
      };
    }).filter(Boolean) as { id: string; fromX: number; fromY: number; toX: number; toY: number; progress: number }[];
  }, [activeDrones, missions, buildings, gameTick]);

  if (buildings.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-gray-500 text-xs border border-cyan-900/20 rounded-lg bg-[#0a0e17]">
        Build more buildings to unlock delivery routes
      </div>
    );
  }

  return (
    <div className="relative h-40 border border-cyan-900/20 rounded-lg bg-[#0a0e17] overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 20} x2="100" y2={i * 20} stroke="rgba(0,255,242,0.05)" strokeWidth="0.3" />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 25} y1="0" x2={i * 25} y2="80" stroke="rgba(0,255,242,0.05)" strokeWidth="0.3" />
        ))}

        {/* Route lines */}
        {missions.map(m => {
          const from = buildings.find(b => b.name === m.fromBuilding);
          const to = buildings.find(b => b.name === m.toBuilding);
          if (!from || !to) return null;
          return (
            <line
              key={m.id}
              x1={from.x + 3} y1={from.y + 3}
              x2={to.x + 3} y2={to.y + 3}
              stroke="rgba(0,255,242,0.15)"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
          );
        })}

        {/* Building dots */}
        {buildings.map((b, i) => (
          <g key={i}>
            <circle cx={b.x + 3} cy={b.y + 3} r="3" fill="#111827" stroke="rgba(0,255,242,0.5)" strokeWidth="0.5" />
            <circle cx={b.x + 3} cy={b.y + 3} r="1.5" fill="rgba(0,255,242,0.6)" />
            <text x={b.x + 3} y={b.y + 8} textAnchor="middle" fill="rgba(0,255,242,0.4)" fontSize="2.5" fontFamily="monospace">
              {b.name.length > 8 ? b.name.substring(0, 8) + '…' : b.name}
            </text>
          </g>
        ))}

        {/* Animated drones */}
        {droneAnimations.map(d => {
          const x = d.fromX + 3 + (d.toX - d.fromX) * d.progress;
          const y = d.fromY + 3 + (d.toY - d.fromY) * d.progress - Math.sin(d.progress * Math.PI) * 5;
          return (
            <g key={d.id}>
              <motion.circle
                cx={x}
                cy={y}
                r="2"
                fill="#38bdf8"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
              <motion.circle
                cx={x}
                cy={y}
                r="4"
                fill="none"
                stroke="rgba(56,189,248,0.3)"
                animate={{ r: [4, 6, 4], opacity: [0.3, 0.1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- Main Component ---
export default function DroneDeliveryPanel() {
  const store = useGameStore();
  const [expandedDrone, setExpandedDrone] = useState<string | null>(null);
  const [selectedMission, setSelectedMission] = useState<string | null>(null);

  const { drones, gameTick, money } = store;
  const fleet = drones.fleet;
  const idleDrones = fleet.filter(d => d.status === 'idle');
  const deliveringDrones = fleet.filter(d => d.status === 'delivering');
  const missions = store.generateDroneMissions();

  const buyCost = 2000 * fleet.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GameIcon icon="gi:helicopter" size={20} className="inline-flex" />
          <h2 className="text-xl font-bold text-cyan-400 neon-glow-cyan">Drone Delivery Network</h2>
          <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-900/20">
            {idleDrones.length} idle / {fleet.length} total
          </Badge>
        </div>
        <div className="text-xs text-gray-500">
          {drones.completedMissions} missions completed · ${formatNumber(drones.totalEarned)} earned
        </div>
      </div>

      {/* Visual Map */}
      <DroneVisualMap missions={missions} fleet={fleet} gameTick={gameTick} />

      {/* Drone Fleet */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
            <Plane className="w-3.5 h-3.5 text-sky-400" />
            Drone Fleet
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-sky-500/30 text-sky-400 hover:bg-sky-900/20 hover:text-sky-300"
                onClick={store.buyDrone}
                disabled={money < buyCost}
              >
                <ShoppingBag className="w-3 h-3 mr-1" />
                Buy Drone (${formatNumber(buyCost)})
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="bg-card border-cyan-900/30">
              <p className="text-xs">Purchase a new drone for your fleet</p>
              <p className="text-[10px] text-gray-400">Cost scales with fleet size: $2,000 × {fleet.length}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="space-y-1.5 max-h-80 overflow-y-auto game-scrollbar">
              {fleet.map((drone, idx) => (
              <div
                key={drone.id}
                className={`bg-card border rounded-lg p-3 cursor-pointer ${
                  drone.status === 'delivering'
                    ? 'border-sky-500/30 shadow-[0_0_8px_rgba(56,189,248,0.1)]'
                    : 'border-cyan-900/20 hover:border-cyan-900/40'
                }`}
                onClick={() => setExpandedDrone(expandedDrone === drone.id ? null : drone.id)}
                aria-expanded={expandedDrone === drone.id}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GameIcon icon="gi:helicopter" size={14} className="inline-flex" />
                    <span className="text-xs font-medium text-gray-300">Drone #{idx + 1}</span>
                    <DroneStatusBadge status={drone.status} />
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 cursor-default">
                          <Gauge className="w-3 h-3" /> {drone.speedLevel}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-card border-cyan-900/30">
                        <p className="text-xs">Speed Level {drone.speedLevel}/5</p>
                        <p className="text-[10px] text-gray-400">Reduces delivery time by {(drone.speedLevel - 1) * 20}%</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 cursor-default">
                          <Package className="w-3 h-3" /> {drone.capacityLevel}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-card border-cyan-900/30">
                        <p className="text-xs">Capacity Level {drone.capacityLevel}/5</p>
                        <p className="text-[10px] text-gray-400">Increases reward by {(drone.capacityLevel - 1) * 25}%</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 cursor-default">
                          <Fuel className="w-3 h-3" /> {drone.fuelEfficiencyLevel}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-card border-cyan-900/30">
                        <p className="text-xs">Fuel Efficiency Level {drone.fuelEfficiencyLevel}/5</p>
                        <p className="text-[10px] text-gray-400">Reduces fuel cost by {(drone.fuelEfficiencyLevel - 1) * 15}%</p>
                      </TooltipContent>
                    </Tooltip>
                    {expandedDrone === drone.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </div>
                </div>

                {/* Delivering progress */}
                {drone.status === 'delivering' && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                      <span>Delivering...</span>
                      <span>{Math.max(0, drone.missionEndTick - gameTick)} ticks remaining</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full"
                        style={{
                          width: drone.missionEndTick > 0
                            ? `${Math.max(0, Math.min(100, (1 - (drone.missionEndTick - gameTick) / Math.max(1, drone.missionEndTick)) * 100))}%`
                            : '0%'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Expanded upgrade panel */}
                  {expandedDrone === drone.id && (
                    <div
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-cyan-900/20 space-y-2">
                        <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Upgrades</p>

                        {/* Speed Upgrade */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Gauge className="w-3.5 h-3.5 text-yellow-400" />
                            <div>
                              <p className="text-xs text-gray-300">Speed</p>
                              <UpgradeBar level={drone.speedLevel} />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 border-yellow-500/30 text-yellow-400 hover:bg-yellow-900/20"
                            disabled={drone.speedLevel >= 5 || money < 500 * drone.speedLevel}
                            onClick={(e) => {
                              e.stopPropagation();
                              store.upgradeDrone(drone.id, 'speed');
                            }}
                          >
                            {drone.speedLevel >= 5 ? 'MAX' : `$${formatNumber(500 * drone.speedLevel)}`}
                          </Button>
                        </div>

                        {/* Capacity Upgrade */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="w-3.5 h-3.5 text-emerald-400" />
                            <div>
                              <p className="text-xs text-gray-300">Capacity</p>
                              <UpgradeBar level={drone.capacityLevel} />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/20"
                            disabled={drone.capacityLevel >= 5 || money < 800 * drone.capacityLevel}
                            onClick={(e) => {
                              e.stopPropagation();
                              store.upgradeDrone(drone.id, 'capacity');
                            }}
                          >
                            {drone.capacityLevel >= 5 ? 'MAX' : `$${formatNumber(800 * drone.capacityLevel)}`}
                          </Button>
                        </div>

                        {/* Fuel Efficiency Upgrade */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Fuel className="w-3.5 h-3.5 text-orange-400" />
                            <div>
                              <p className="text-xs text-gray-300">Fuel Efficiency</p>
                              <UpgradeBar level={drone.fuelEfficiencyLevel} />
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 border-orange-500/30 text-orange-400 hover:bg-orange-900/20"
                            disabled={drone.fuelEfficiencyLevel >= 5 || money < 600 * drone.fuelEfficiencyLevel}
                            onClick={(e) => {
                              e.stopPropagation();
                              store.upgradeDrone(drone.id, 'fuelEfficiency');
                            }}
                          >
                            {drone.fuelEfficiencyLevel >= 5 ? 'MAX' : `$${formatNumber(600 * drone.fuelEfficiencyLevel)}`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ))}

          {fleet.length === 0 && (
            <div className="text-center text-gray-500 text-xs py-6">
              No drones yet. Buy your first one!
            </div>
          )}
        </div>
      </div>

      {/* Available Missions */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5 text-cyan-400" />
          Available Missions
          <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 bg-cyan-900/20 ml-1">
            {missions.length}
          </Badge>
        </h3>

        {missions.length === 0 ? (
          <div className="bg-card border border-cyan-900/20 rounded-lg p-4 text-center text-gray-500 text-xs">
            Build at least 2 different building types to unlock delivery missions
          </div>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto game-scrollbar">
            {missions.map(mission => {
              const isSelected = selectedMission === mission.id;
              const fuelCostForDrone = (drone: Drone) =>
                Math.ceil(mission.fuelCost / (1 + (drone.fuelEfficiencyLevel - 1) * 0.15));
              const ticksForDrone = (drone: Drone) =>
                Math.max(10, Math.floor(mission.baseTicks / (1 + (drone.speedLevel - 1) * 0.2)));

              return (
                <div
                  key={mission.id}
                  className={`bg-card border rounded-lg p-3 cursor-pointer ${
                    isSelected ? 'border-cyan-500/40 shadow-[0_0_8px_rgba(0,255,242,0.1)]' : 'border-cyan-900/20 hover:border-cyan-900/40'
                  }`}
                  onClick={() => setSelectedMission(isSelected ? null : mission.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-cyan-400 font-medium">{mission.fromBuilding}</span>
                      <ArrowRight className="w-3 h-3 text-gray-500" />
                      <span className="text-sky-400 font-medium">{mission.toBuilding}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-green-400 flex items-center gap-0.5">
                        <DollarSign className="w-2.5 h-2.5" />
                        {formatNumber(mission.reward.money)}
                      </span>
                      {mission.reward.researchPoints && (
                        <span className="text-purple-400 flex items-center gap-0.5">
                          <FlaskConical className="w-2.5 h-2.5" />
                          {mission.reward.researchPoints}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> {formatDuration(mission.baseTicks)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Fuel className="w-2.5 h-2.5" /> ${formatNumber(mission.fuelCost)}
                    </span>
                  </div>

                  {/* Expanded: select drone to send */}
                    {isSelected && idleDrones.length > 0 && (
                      <div
                        className="overflow-hidden"
                      >
                        <div className="mt-2 pt-2 border-t border-cyan-900/20 space-y-1.5">
                          <p className="text-[10px] text-gray-500 mb-1">Select drone to send:</p>
                          {idleDrones.map((drone, idx) => {
                            const droneIdx = fleet.indexOf(drone);
                            const fuel = fuelCostForDrone(drone);
                            const ticks = ticksForDrone(drone);
                            return (
                              <div key={drone.id} className="flex items-center justify-between bg-[#0a0e17] rounded-md px-2 py-1.5">
                                <div className="text-[10px]">
                                  <span className="text-gray-300">Drone #{droneIdx + 1}</span>
                                  <span className="text-gray-600 ml-2">
                                    {formatDuration(ticks)} · ${formatNumber(fuel)} fuel
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[10px] px-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/20"
                                  disabled={money < fuel}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    store.sendDrone(mission.id, drone.id);
                                    setSelectedMission(null);
                                  }}
                                >
                                  <Zap className="w-2.5 h-2.5 mr-1" />
                                  Send
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {isSelected && idleDrones.length === 0 && (
                      <div
                        className="overflow-hidden"
                      >
                        <p className="mt-2 pt-2 border-t border-cyan-900/20 text-[10px] text-yellow-500">
                          No idle drones available. Wait for deliveries to complete or buy a new drone.
                        </p>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-card border border-cyan-900/20 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-sky-400">{fleet.length}</div>
          <div className="text-[10px] text-gray-500">Drones</div>
        </div>
        <div className="bg-card border border-cyan-900/20 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-green-400">{drones.completedMissions}</div>
          <div className="text-[10px] text-gray-500">Completed</div>
        </div>
        <div className="bg-card border border-cyan-900/20 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-cyan-400">${formatNumber(drones.totalEarned)}</div>
          <div className="text-[10px] text-gray-500">Total Earned</div>
        </div>
      </div>
    </div>
  );
}
