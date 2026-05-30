'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Send, ShoppingBag, Bot, ToggleLeft, ToggleRight, Target,
  Rocket,
} from 'lucide-react';

// --- Helper: format tick duration ---
function formatDuration(ticks: number): string {
  if (ticks < 60) return `${ticks}s`;
  const mins = Math.floor(ticks / 60);
  const secs = ticks % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// --- Priority icon + color ---
const PRIORITY_CONFIG: Record<string, { icon: typeof DollarSign; label: string; color: string; bgColor: string }> = {
  profit: { icon: DollarSign, label: 'Max Profit', color: 'text-green-400', bgColor: 'bg-green-900/20' },
  speed: { icon: Clock, label: 'Fastest', color: 'text-yellow-400', bgColor: 'bg-yellow-900/20' },
  research: { icon: FlaskConical, label: 'Research', color: 'text-purple-400', bgColor: 'bg-purple-900/20' },
};

// --- Drone Status Badge ---
function DroneStatusBadge({ status, autoAssign }: { status: Drone['status']; autoAssign?: boolean }) {
  const config = {
    idle: { label: 'Idle', className: 'bg-emerald-900/40 text-emerald-400 border-emerald-500/30' },
    delivering: { label: 'Delivering', className: 'bg-sky-900/40 text-sky-400 border-sky-500/30 animate-pulse' },
  };
  const c = config[status];
  return (
    <div className="flex items-center gap-1">
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${c.className}`}>
        {c.label}
      </Badge>
      {autoAssign && (
        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-purple-900/30 text-purple-400 border-purple-500/30">
          <Bot className="w-2 h-2 mr-0.5" />
          AUTO
        </Badge>
      )}
    </div>
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
        autoAssign: d.autoAssign,
      };
    }).filter(Boolean) as { id: string; fromX: number; fromY: number; toX: number; toY: number; progress: number; autoAssign?: boolean }[];
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
                fill={d.autoAssign ? '#c084fc' : '#38bdf8'}
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
              <motion.circle
                cx={x}
                cy={y}
                r="4"
                fill="none"
                stroke={d.autoAssign ? 'rgba(192,132,252,0.3)' : 'rgba(56,189,248,0.3)'}
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
  const autoAssignDrones = fleet.filter(d => d.autoAssign);
  const missions = store.generateDroneMissions();

  const buyCost = 2000 * Math.max(1, fleet.length);

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚁</span>
          <h2 className="text-lg font-bold text-cyan-400 neon-glow-cyan">Drone Delivery Network</h2>
          <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400 bg-sky-900/20">
            {idleDrones.length} idle / {fleet.length} total
          </Badge>
          {autoAssignDrones.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 bg-purple-900/20">
              <Bot className="w-2.5 h-2.5 mr-0.5" />
              {autoAssignDrones.length} auto
            </Badge>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {drones.completedMissions} missions · ${formatNumber(drones.totalEarned)} earned
        </div>
      </div>

      {/* Visual Map */}
      <DroneVisualMap missions={missions} fleet={fleet} gameTick={gameTick} />

      {/* Auto-Assign Control Panel */}
      <div className="bg-[#111827] border border-purple-900/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-purple-400" />
            <h3 className="text-xs font-semibold text-purple-400">Auto-Assign</h3>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 border-purple-500/30 text-purple-400 hover:bg-purple-900/20"
            onClick={() => store.autoAssignAllDrones()}
            disabled={idleDrones.length === 0 && fleet.every(d => d.autoAssign)}
          >
            <Rocket className="w-2.5 h-2.5 mr-1" />
            Enable All & Assign
          </Button>
        </div>
        <p className="text-[9px] text-gray-500 mb-2">
          Auto-assigned drones will automatically pick the best available mission when idle.
          They re-assign every 10 game ticks.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#0a0e17] rounded-lg p-2 text-center border border-purple-900/20">
            <div className="text-sm font-bold text-purple-400 font-mono">{autoAssignDrones.length}</div>
            <div className="text-[8px] text-gray-500">Auto Drones</div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2 text-center border border-purple-900/20">
            <div className="text-sm font-bold text-cyan-400 font-mono">{idleDrones.filter(d => d.autoAssign).length}</div>
            <div className="text-[8px] text-gray-500">Waiting</div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2 text-center border border-purple-900/20">
            <div className="text-sm font-bold text-sky-400 font-mono">{deliveringDrones.filter(d => d.autoAssign).length}</div>
            <div className="text-[8px] text-gray-500">Delivering</div>
          </div>
        </div>
      </div>

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
            <TooltipContent side="left" className="bg-[#111827] border-cyan-900/30">
              <p className="text-xs">Purchase a new drone for your fleet</p>
              <p className="text-[10px] text-gray-400">Cost scales with fleet size: $2,000 × {fleet.length}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto game-scrollbar">
          <AnimatePresence>
            {fleet.map((drone, idx) => {
              const priorityConfig = PRIORITY_CONFIG[drone.autoAssignPriority ?? 'profit'];
              const PriorityIcon = priorityConfig.icon;

              return (
                <motion.div
                  key={drone.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  className={`bg-[#111827] border rounded-lg p-3 cursor-pointer transition-colors ${
                    drone.autoAssign
                      ? 'border-purple-500/30 shadow-[0_0_8px_rgba(192,132,252,0.1)]'
                      : drone.status === 'delivering'
                        ? 'border-sky-500/30 shadow-[0_0_8px_rgba(56,189,248,0.1)]'
                        : 'border-cyan-900/20 hover:border-cyan-900/40'
                  }`}
                  onClick={() => setExpandedDrone(expandedDrone === drone.id ? null : drone.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🚁</span>
                      <span className="text-xs font-medium text-gray-300">Drone #{idx + 1}</span>
                      <DroneStatusBadge status={drone.status} autoAssign={drone.autoAssign} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                      {/* Auto-assign quick toggle */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          store.toggleDroneAutoAssign(drone.id);
                        }}
                        className={`flex items-center gap-0.5 transition-colors ${
                          drone.autoAssign ? 'text-purple-400 hover:text-purple-300' : 'text-gray-600 hover:text-gray-400'
                        }`}
                        title={drone.autoAssign ? 'Auto-assign ON — click to disable' : 'Auto-assign OFF — click to enable'}
                      >
                        {drone.autoAssign ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5 cursor-default">
                            <Gauge className="w-3 h-3" /> {drone.speedLevel}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-[#111827] border-cyan-900/30">
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
                        <TooltipContent side="top" className="bg-[#111827] border-cyan-900/30">
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
                        <TooltipContent side="top" className="bg-[#111827] border-cyan-900/30">
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
                        <motion.div
                          className={`h-full rounded-full ${
                            drone.autoAssign
                              ? 'bg-gradient-to-r from-purple-500 to-purple-400'
                              : 'bg-gradient-to-r from-sky-500 to-cyan-400'
                          }`}
                          initial={{ width: '0%' }}
                          animate={{
                            width: drone.missionEndTick > 0
                              ? `${Math.max(0, Math.min(100, (1 - (drone.missionEndTick - gameTick) / Math.max(1, drone.missionEndTick)) * 100))}%`
                              : '0%'
                          }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expanded upgrade + auto-assign panel */}
                  <AnimatePresence>
                    {expandedDrone === drone.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-cyan-900/20 space-y-2">
                          {/* Auto-Assign Settings */}
                          <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            Auto-Assign Settings
                          </p>
                          <div className="flex items-center justify-between bg-[#0a0e17] rounded-lg p-2 border border-purple-900/20">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  store.toggleDroneAutoAssign(drone.id);
                                }}
                                className={`w-8 h-4 rounded-full transition-colors relative ${
                                  drone.autoAssign ? 'bg-purple-500' : 'bg-gray-700'
                                }`}
                              >
                                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                                  drone.autoAssign ? 'translate-x-4' : 'translate-x-0.5'
                                }`} />
                              </button>
                              <span className="text-[10px] text-gray-300">
                                {drone.autoAssign ? 'Auto-assign enabled' : 'Manual control'}
                              </span>
                            </div>
                          </div>
                          {drone.autoAssign && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-gray-500">Priority:</span>
                              {(['profit', 'speed', 'research'] as const).map(p => {
                                const pc = PRIORITY_CONFIG[p];
                                const PIcon = pc.icon;
                                const isActive = (drone.autoAssignPriority ?? 'profit') === p;
                                return (
                                  <button
                                    key={p}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      store.setDroneAutoAssignPriority(drone.id, p);
                                    }}
                                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                                      isActive
                                        ? `border-purple-500/50 ${pc.bgColor} ${pc.color}`
                                        : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                    }`}
                                  >
                                    <PIcon className="w-2.5 h-2.5" />
                                    {pc.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Upgrades */}
                          <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2 mt-3">Upgrades</p>

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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

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
          <div className="bg-[#111827] border border-cyan-900/20 rounded-lg p-4 text-center text-gray-500 text-xs">
            Build at least 2 different building types to unlock delivery missions
          </div>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto game-scrollbar">
            {missions.map(mission => {
              const isSelected = selectedMission === mission.id;
              const fuelCostForDrone = (drone: Drone) =>
                Math.ceil(mission.fuelCost / (1 + (drone.fuelEfficiencyLevel - 1) * 0.15));
              const ticksForDrone = (drone: Drone) =>
                Math.max(10, Math.floor(mission.baseTicks / (1 + (drone.speedLevel - 1) * 0.2)));

              return (
                <motion.div
                  key={mission.id}
                  layout
                  className={`bg-[#111827] border rounded-lg p-3 transition-colors cursor-pointer ${
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
                  <AnimatePresence>
                    {isSelected && idleDrones.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
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
                                  {drone.autoAssign && (
                                    <Badge variant="outline" className="text-[7px] px-1 py-0 ml-1 bg-purple-900/20 text-purple-400 border-purple-500/30">
                                      AUTO
                                    </Badge>
                                  )}
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
                      </motion.div>
                    )}
                    {isSelected && idleDrones.length === 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="mt-2 pt-2 border-t border-cyan-900/20 text-[10px] text-yellow-500">
                          No idle drones available. Wait for deliveries to complete or buy a new drone.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-[#111827] border border-cyan-900/20 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-sky-400">{fleet.length}</div>
          <div className="text-[10px] text-gray-500">Drones</div>
        </div>
        <div className="bg-[#111827] border border-cyan-900/20 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-green-400">{drones.completedMissions}</div>
          <div className="text-[10px] text-gray-500">Completed</div>
        </div>
        <div className="bg-[#111827] border border-cyan-900/20 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-cyan-400">${formatNumber(drones.totalEarned)}</div>
          <div className="text-[10px] text-gray-500">Total Earned</div>
        </div>
        <div className="bg-[#111827] border border-purple-900/20 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-purple-400">{autoAssignDrones.length}</div>
          <div className="text-[10px] text-gray-500">Auto-Assign</div>
        </div>
      </div>
    </div>
  );
}
