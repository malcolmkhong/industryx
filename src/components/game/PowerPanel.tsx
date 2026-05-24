'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Zap, ChevronUp, Power, PowerOff, Hammer,
  AlertTriangle, Flame, Sun, Wind, Atom, Sparkles,
  ArrowUpRight, ArrowDownRight, Shield,
  Gauge, Plug, Fuel, Activity,
  CircleAlert, Minus, Lock, Lightbulb, TrendingUp
} from 'lucide-react';
import { PowerPlantType, BuildingInstance } from '@/lib/game/types';

const POWER_PLANT_TYPES: PowerPlantType[] = ['coalGenerator', 'solarPanel', 'windTurbine', 'nuclearReactor', 'fusionReactor'];

const POWER_PLANT_META: Record<PowerPlantType, { icon: React.ReactNode; color: string; label: string; glowClass: string; emoji: string }> = {
  coalGenerator: { icon: <Flame className="w-4 h-4" />, color: '#ff6600', label: 'Coal', glowClass: 'text-orange-400', emoji: '🔥' },
  solarPanel: { icon: <Sun className="w-4 h-4" />, color: '#ffff00', label: 'Solar', glowClass: 'text-yellow-400', emoji: '☀️' },
  windTurbine: { icon: <Wind className="w-4 h-4" />, color: '#00ccff', label: 'Wind', glowClass: 'text-cyan-400', emoji: '💨' },
  nuclearReactor: { icon: <Atom className="w-4 h-4" />, color: '#00ff66', label: 'Nuclear', glowClass: 'text-green-400', emoji: '☢️' },
  fusionReactor: { icon: <Sparkles className="w-4 h-4" />, color: '#bf00ff', label: 'Fusion', glowClass: 'text-purple-400', emoji: '⚡' },
};

// --- Mini sparkline for power history ---
function PowerSparkline({ data, color, width = 200, height = 40 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: padding + (height - padding * 2) - ((v - min) / range) * (height - padding * 2),
  }));

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    path += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }
  const fillPath = `${path} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <defs>
        <linearGradient id="power-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#power-spark-grad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PowerPanel() {
  const store = useGameStore();
  const { powerGrid } = store;

  // Power plants from store
  const powerPlants = useMemo(() =>
    store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power'),
    [store.buildings]
  );

  const activePowerPlants = useMemo(() =>
    powerPlants.filter(b => b.active),
    [powerPlants]
  );

  // Power plants grouped by type
  const plantsByType = useMemo(() => {
    const grouped: Record<string, BuildingInstance[]> = {};
    POWER_PLANT_TYPES.forEach(type => {
      grouped[type] = powerPlants.filter(b => b.type === type);
    });
    return grouped;
  }, [powerPlants]);

  // Actual production per plant type (accounting for fuel, weather)
  const productionByType = useMemo(() => {
    const production: Record<string, number> = {};
    POWER_PLANT_TYPES.forEach(type => {
      const def = BUILDING_DEFS[type];
      if (!def) return;
      const instances = plantsByType[type];
      let totalType = 0;
      instances.forEach(b => {
        if (!b.active) return;
        let plantProduction = def.basePowerProduction * b.level * b.efficiency;
        if (def.fuel && def.fuelRate) {
          if (store.resources[def.fuel] < def.fuelRate * b.level) {
            plantProduction *= 0.1;
          }
        }
        if (type === 'solarPanel') {
          const dayFactor = 0.5 + 0.5 * Math.sin(store.gameTick * 0.01);
          plantProduction *= Math.max(0.2, dayFactor);
        }
        if (type === 'windTurbine') {
          const windFactor = 0.5 + 0.5 * Math.sin(store.gameTick * 0.007 + Math.PI / 3);
          plantProduction *= Math.max(0.3, windFactor);
        }
        totalType += plantProduction;
      });
      production[type] = totalType;
    });
    return production;
  }, [plantsByType, store.resources, store.gameTick]);

  // Total real production
  const totalRealProduction = useMemo(() =>
    Object.values(productionByType).reduce((sum, v) => sum + v, 0),
    [productionByType]
  );

  // Power balance
  const powerBalance = totalRealProduction - powerGrid.totalConsumption;
  const powerRatio = powerGrid.totalConsumption > 0
    ? Math.min(2, totalRealProduction / powerGrid.totalConsumption)
    : totalRealProduction > 0 ? 2 : 0;

  // Status determination
  const powerStatus = useMemo(() => {
    if (powerGrid.overload) return 'overloaded';
    if (powerRatio >= 1.3) return 'surplus';
    if (powerRatio >= 0.9) return 'balanced';
    return 'deficit';
  }, [powerGrid.overload, powerRatio]);

  // Coal fuel status
  const coalFuelStatus = useMemo(() => {
    const coalPlants = plantsByType['coalGenerator'] || [];
    const activeCoalPlants = coalPlants.filter(b => b.active);
    const totalFuelRate = activeCoalPlants.reduce((sum, b) => {
      const def = BUILDING_DEFS[b.type];
      return sum + (def.fuelRate || 0) * b.level;
    }, 0);
    const coalStock = store.resources['coal'];
    const ticksRemaining = totalFuelRate > 0 ? coalStock / totalFuelRate : Infinity;
    return {
      stock: coalStock,
      consumptionRate: totalFuelRate,
      ticksRemaining,
      isLow: ticksRemaining < 500 && activeCoalPlants.length > 0,
    };
  }, [plantsByType, store.resources]);

  // Efficiency tip
  const efficiencyTip = useMemo(() => {
    if (powerStatus === 'overloaded' || powerStatus === 'deficit') {
      return { icon: '⚠️', text: 'Build more power plants or deactivate some buildings!', color: 'text-red-400', bg: 'bg-red-900/20 border-red-800/40' };
    }
    if (powerStatus === 'balanced') {
      return { icon: '💡', text: 'Consider adding surplus capacity for expansion', color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800/40' };
    }
    return { icon: '✅', text: 'Great! You have room to expand production', color: 'text-green-400', bg: 'bg-green-900/20 border-green-800/40' };
  }, [powerStatus]);

  // Power production history from productionHistory
  const powerHistory = useMemo(() =>
    store.productionHistory.slice(-50).map(p => p.powerProduction),
    [store.productionHistory]
  );

  // Solar/wind current output factor
  const solarFactor = useMemo(() => {
    const factor = 0.5 + 0.5 * Math.sin(store.gameTick * 0.01);
    return Math.max(0.2, factor);
  }, [store.gameTick]);

  const windFactor = useMemo(() => {
    const factor = 0.5 + 0.5 * Math.sin(store.gameTick * 0.007 + Math.PI / 3);
    return Math.max(0.3, factor);
  }, [store.gameTick]);

  const handleBuild = (type: PowerPlantType) => {
    store.buildBuilding(type);
  };

  const handleUpgrade = (id: string) => {
    store.upgradeBuilding(id);
  };

  const handleToggle = (id: string) => {
    store.toggleBuilding(id);
  };

  // Flow line color
  const flowColor = powerStatus === 'surplus' ? '#39ff14' : powerStatus === 'balanced' ? '#ffff00' : '#ff0040';
  const flowColorClass = powerStatus === 'surplus' ? 'border-green-500/50' : powerStatus === 'balanced' ? 'border-yellow-500/50' : 'border-red-500/50';
  const flowGlowClass = powerStatus === 'surplus' ? 'shadow-[0_0_8px_#39ff14]' : powerStatus === 'balanced' ? 'shadow-[0_0_8px_#ffff00]' : 'shadow-[0_0_8px_#ff0040]';

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-yellow-400 tracking-wide flex items-center gap-2" style={{ textShadow: '0 0 7px #ffff00, 0 0 10px #ffff0040' }}>
            <Zap className="w-5 h-5" />
            Power Grid
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Generate and distribute electricity across your empire</p>
        </div>
        <div className="flex items-center gap-2">
          {powerGrid.overload && (
            <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-900/20 text-xs neon-pulse">
              <AlertTriangle className="w-3 h-3 mr-1" />
              OVERLOAD
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-xs ${
              powerStatus === 'surplus'
                ? 'border-green-500/50 text-green-400 bg-green-900/20'
                : powerStatus === 'balanced'
                  ? 'border-yellow-500/50 text-yellow-400 bg-yellow-900/20'
                  : 'border-red-500/50 text-red-400 bg-red-900/20'
            }`}
          >
            {powerStatus === 'surplus' && <><ArrowUpRight className="w-3 h-3 mr-1" />SURPLUS</>}
            {powerStatus === 'balanced' && <><Minus className="w-3 h-3 mr-1" />BALANCED</>}
            {powerStatus === 'overloaded' && <><ArrowDownRight className="w-3 h-3 mr-1" />OVERLOADED</>}
            {powerStatus === 'deficit' && <><ArrowDownRight className="w-3 h-3 mr-1" />DEFICIT</>}
          </Badge>
        </div>
      </div>

      {/* POWER GAUGE */}
      <div className={`game-card rounded-xl bg-[#111827] p-4 border ${
        powerStatus === 'surplus' ? 'border-green-900/40' :
        powerStatus === 'balanced' ? 'border-yellow-900/40' :
        'border-red-900/40'
      }`}>
        {/* Main gauge display */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{
                scale: powerStatus === 'overloaded' ? [1, 1.2, 1] : 1,
              }}
              transition={{ duration: 0.8, repeat: powerStatus === 'overloaded' ? Infinity : 0 }}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                powerStatus === 'surplus' ? 'bg-green-900/20' :
                powerStatus === 'balanced' ? 'bg-yellow-900/20' :
                'bg-red-900/20'
              }`}>
                <Zap className={`w-5 h-5 ${
                  powerStatus === 'surplus' ? 'text-green-400' :
                  powerStatus === 'balanced' ? 'text-yellow-400' :
                  'text-red-400'
                }`} />
              </div>
            </motion.div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200">Power Grid Status</h3>
              <p className={`text-xs font-medium ${
                powerStatus === 'surplus' ? 'text-green-400' :
                powerStatus === 'balanced' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {powerStatus === 'surplus' && 'All systems nominal — surplus power available'}
                {powerStatus === 'balanced' && 'Power output matches demand'}
                {powerStatus === 'overloaded' && 'WARNING: Power grid overloaded! Buildings at reduced efficiency'}
                {powerStatus === 'deficit' && 'Power deficit detected — increase production'}
              </p>
            </div>
          </div>
        </div>

        {/* Power balance bar */}
        <div className="relative mb-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 font-mono font-bold text-sm">{formatNumber(totalRealProduction)}</span>
              <span className="text-gray-500">MW production</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">demand</span>
              <span className="text-orange-400 font-mono font-bold text-sm">{formatNumber(powerGrid.totalConsumption)}</span>
              <ArrowDownRight className="w-3.5 h-3.5 text-orange-400" />
            </div>
          </div>

          <div className="h-6 bg-gray-800 rounded-full overflow-hidden relative">
            <div
              className="absolute inset-y-0 left-0 bg-orange-600/20 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (powerGrid.totalConsumption / Math.max(1, totalRealProduction)) * 100)}%` }}
            />
            <motion.div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                powerStatus === 'surplus'
                  ? 'bg-gradient-to-r from-green-700 via-green-500 to-green-400'
                  : powerStatus === 'balanced'
                    ? 'bg-gradient-to-r from-yellow-700 via-yellow-500 to-yellow-400'
                    : 'bg-gradient-to-r from-red-700 via-red-500 to-red-400'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, powerRatio * 50)}%` }}
              transition={{ duration: 0.7 }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            </motion.div>
            {powerStatus === 'overloaded' && (
              <motion.div
                className="absolute inset-0 bg-red-500/20 rounded-full"
                animate={{ opacity: [0, 0.4, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-mono text-white/70 font-medium">
                {powerBalance >= 0 ? '+' : ''}{formatNumber(powerBalance)} MW
              </span>
            </div>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[9px] text-gray-600">0%</span>
            <span className="text-[9px] text-gray-600">50%</span>
            <span className="text-[9px] text-green-700">100%</span>
            <span className="text-[9px] text-gray-600">150%</span>
            <span className="text-[9px] text-gray-600">200%</span>
          </div>
        </div>

        {/* Power stats grid */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Efficiency</div>
            <motion.div
              className={`text-sm font-bold font-mono ${
                powerGrid.efficiency >= 0.8 ? 'text-green-400' :
                powerGrid.efficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'
              }`}
              animate={powerGrid.efficiency < 0.5 ? { opacity: [1, 0.5, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              {(powerGrid.efficiency * 100).toFixed(1)}%
            </motion.div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Surplus</div>
            <div className={`text-sm font-bold font-mono ${
              powerBalance >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {powerBalance >= 0 ? '+' : ''}{formatNumber(powerBalance)}
            </div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Plants</div>
            <div className="text-sm font-bold font-mono text-yellow-400">{activePowerPlants.length}</div>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
            <div className="text-[10px] text-gray-500 mb-0.5">Capacity</div>
            <div className={`text-sm font-bold font-mono ${
              powerRatio >= 1.3 ? 'text-green-400' :
              powerRatio >= 1 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {(powerRatio * 100).toFixed(0)}%
            </div>
          </div>
        </div>

        {/* Efficiency Tip */}
        <div className={`mt-3 flex items-center gap-2 rounded-lg p-2.5 border ${efficiencyTip.bg}`}>
          <span className="text-sm flex-shrink-0">{efficiencyTip.icon}</span>
          <span className={`text-xs ${efficiencyTip.color}`}>{efficiencyTip.text}</span>
        </div>

        {/* Overload warning */}
        {powerGrid.overload && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-2 bg-red-900/20 border border-red-800/40 rounded-lg p-2.5"
          >
            <CircleAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-red-400 font-medium">Power Grid Overloaded!</p>
              <p className="text-[10px] text-red-400/70">All buildings operating at {(powerGrid.efficiency * 100).toFixed(0)}% efficiency. Build more power plants or disable buildings.</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* POWER FLOW VISUALIZATION */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-cyan-400">Power Flow Diagram</h3>
        </div>
        <div className="relative bg-[#0a0e17] rounded-lg p-4 overflow-hidden">
          {/* Grid lines background */}
          <div className="absolute inset-0 opacity-5">
            {[...Array(6)].map((_, i) => (
              <div key={`h-${i}`} className="absolute h-px bg-cyan-400" style={{ top: `${(i + 1) * 16.6}%`, left: '5%', right: '5%' }} />
            ))}
            {[...Array(8)].map((_, i) => (
              <div key={`v-${i}`} className="absolute w-px bg-cyan-400" style={{ left: `${(i + 1) * 12.5}%`, top: '5%', bottom: '5%' }} />
            ))}
          </div>

          <div className="relative grid grid-cols-3 gap-2 min-h-[120px]">
            {/* LEFT: Producers */}
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="text-[9px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Producers</div>
              {POWER_PLANT_TYPES.map(type => {
                const meta = POWER_PLANT_META[type];
                const output = productionByType[type] || 0;
                if (output <= 0) return null;
                return (
                  <div key={type} className="flex items-center gap-1">
                    <span className="text-xs">{meta.emoji}</span>
                    <span className={`text-[9px] font-mono ${meta.glowClass}`}>{formatNumber(output)}</span>
                  </div>
                );
              })}
              {totalRealProduction <= 0 && <span className="text-[9px] text-gray-600">No production</span>}
            </div>

            {/* CENTER: Grid with animated flow */}
            <div className="flex flex-col items-center justify-center relative">
              {/* Flow lines from left to center */}
              <motion.div
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-6 h-0.5 rounded ${flowColorClass}`}
                style={{ boxShadow: `0 0 6px ${flowColor}` }}
              >
                <motion.div
                  className="absolute inset-0 rounded"
                  style={{ backgroundColor: flowColor, opacity: 0.6 }}
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </motion.div>

              {/* Grid hub */}
              <motion.div
                className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${
                  powerStatus === 'surplus'
                    ? 'border-green-500/50 bg-green-900/20'
                    : powerStatus === 'balanced'
                      ? 'border-yellow-500/50 bg-yellow-900/20'
                      : 'border-red-500/50 bg-red-900/20'
                }`}
                animate={{
                  scale: powerStatus === 'overloaded' ? [1, 1.1, 1] : 1,
                  boxShadow: powerStatus === 'surplus'
                    ? '0 0 20px rgba(57, 255, 20, 0.3)'
                    : powerStatus === 'overloaded'
                      ? ['0 0 20px rgba(255, 0, 64, 0.3)', '0 0 40px rgba(255, 0, 64, 0.5)', '0 0 20px rgba(255, 0, 64, 0.3)']
                      : '0 0 10px rgba(255, 255, 0, 0.2)',
                }}
                transition={{
                  duration: powerStatus === 'overloaded' ? 1 : 2,
                  repeat: powerStatus === 'overloaded' ? Infinity : 0,
                }}
              >
                <Zap className={`w-7 h-7 ${
                  powerStatus === 'surplus' ? 'text-green-400' :
                  powerStatus === 'balanced' ? 'text-yellow-400' :
                  'text-red-400'
                }`} />
              </motion.div>

              <div className="text-[9px] text-gray-400 mt-1 font-mono">{formatNumber(totalRealProduction)} MW</div>

              {/* Flow lines from center to right */}
              <motion.div
                className={`absolute right-0 top-1/2 -translate-y-1/2 w-6 h-0.5 rounded ${flowColorClass}`}
                style={{ boxShadow: `0 0 6px ${flowColor}` }}
              >
                <motion.div
                  className="absolute inset-0 rounded"
                  style={{ backgroundColor: flowColor, opacity: 0.6 }}
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                />
              </motion.div>

              {/* Animated power flow particles */}
              {powerGrid.efficiency > 0 && (
                <>
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={`lp-${i}`}
                      className="absolute w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: flowColor,
                        boxShadow: `0 0 4px ${flowColor}`,
                        top: `${20 + i * 20}%`,
                      }}
                      animate={{ left: ['-15%', '30%'] }}
                      transition={{ duration: 1.5 + i * 0.2, repeat: Infinity, delay: i * 0.3, ease: 'linear' }}
                    />
                  ))}
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={`rp-${i}`}
                      className="absolute w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: flowColor,
                        boxShadow: `0 0 4px ${flowColor}`,
                        top: `${20 + i * 20}%`,
                      }}
                      animate={{ left: ['65%', '110%'] }}
                      transition={{ duration: 1.5 + i * 0.2, repeat: Infinity, delay: i * 0.3 + 0.5, ease: 'linear' }}
                    />
                  ))}
                </>
              )}
            </div>

            {/* RIGHT: Consumers */}
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="text-[9px] text-gray-500 mb-1 font-bold uppercase tracking-wider">Consumers</div>
              <div className="flex items-center gap-1">
                <span className="text-xs">🏭</span>
                <span className="text-[9px] font-mono text-orange-400">{formatNumber(powerGrid.totalConsumption)} MW</span>
              </div>
              <div className="text-[9px] text-gray-500">{store.buildings.filter(b => BUILDING_DEFS[b.type]?.category !== 'power' && b.active).length} buildings</div>
              <div className={`text-[8px] mt-1 px-1.5 py-0.5 rounded ${
                powerGrid.efficiency >= 0.8 ? 'bg-green-900/20 text-green-400' :
                powerGrid.efficiency >= 0.5 ? 'bg-yellow-900/20 text-yellow-400' :
                'bg-red-900/20 text-red-400'
              }`}>
                {(powerGrid.efficiency * 100).toFixed(0)}% eff
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GENERATOR STATUS CARDS + Power History */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {POWER_PLANT_TYPES.map(type => {
          const def = BUILDING_DEFS[type];
          if (!def) return null;
          const meta = POWER_PLANT_META[type];
          const instances = plantsByType[type] || [];
          const activeInstances = instances.filter(b => b.active);
          const output = productionByType[type] || 0;
          const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);

          // Individual output variation
          let variationLabel = '';
          let variationPct = 100;
          if (type === 'solarPanel') {
            variationPct = Math.round(solarFactor * 100);
            variationLabel = solarFactor > 0.7 ? 'Peak' : solarFactor > 0.4 ? 'Moderate' : 'Low light';
          } else if (type === 'windTurbine') {
            variationPct = Math.round(windFactor * 100);
            variationLabel = windFactor > 0.7 ? 'Strong' : windFactor > 0.4 ? 'Moderate' : 'Low wind';
          }

          // Coal fuel
          let fuelLabel = '';
          let fuelLow = false;
          if (type === 'coalGenerator' && activeInstances.length > 0) {
            const hoursRemaining = coalFuelStatus.ticksRemaining === Infinity ? '∞' : formatNumber(coalFuelStatus.ticksRemaining);
            fuelLabel = `${RESOURCE_META.coal.emoji} ${formatNumber(coalFuelStatus.stock)} (${hoursRemaining}t)`;
            fuelLow = coalFuelStatus.isLow;
          }

          return (
            <div
              key={type}
              className={`game-card rounded-xl bg-[#111827] p-3 border transition-all ${
                !unlocked ? 'border-gray-800 opacity-50' :
                output > 0 ? `border-[$meta.color]/30` : 'border-[#1e293b]'
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-[#0a0e17] ${
                  unlocked ? meta.glowClass : 'text-gray-600'
                }`}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-200 truncate">{def.name}</div>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs font-mono font-bold ${output > 0 ? meta.glowClass : 'text-gray-600'}`}>
                      {formatNumber(output)} MW
                    </span>
                  </div>
                </div>
              </div>

              {/* Count */}
              <div className="flex items-center justify-between mb-1.5 text-[9px]">
                <span className="text-gray-500">{activeInstances.length}/{instances.length} active</span>
                <span className="text-gray-500">{instances.length > 0 ? ((output / Math.max(0.001, instances.reduce((s, b) => s + def.basePowerProduction * b.level, 0))) * 100).toFixed(0) : 0}% output</span>
              </div>

              {/* Mini production bar */}
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-1.5">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: meta.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${totalRealProduction > 0 ? (output / totalRealProduction) * 100 : 0}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>

              {/* Variation indicator for solar/wind */}
              {(type === 'solarPanel' || type === 'windTurbine') && (
                <div className="flex items-center justify-between text-[9px] mb-1">
                  <span className="text-gray-500">{variationLabel}</span>
                  <div className="flex items-center gap-1">
                    <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          variationPct >= 70 ? 'bg-green-500' : variationPct >= 40 ? 'bg-yellow-500' : 'bg-cyan-500'
                        }`}
                        style={{ width: `${variationPct}%` }}
                      />
                    </div>
                    <span className="text-gray-400 font-mono">{variationPct}%</span>
                  </div>
                </div>
              )}

              {/* Fuel status for coal */}
              {type === 'coalGenerator' && activeInstances.length > 0 && (
                <div className={`flex items-center gap-1 text-[9px] ${fuelLow ? 'text-red-400' : 'text-gray-400'}`}>
                  <Fuel className="w-2.5 h-2.5 text-orange-500" />
                  <span className="font-mono truncate">{fuelLabel}</span>
                </div>
              )}

              {/* Build button */}
              {unlocked && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-6 text-[9px] mt-2 border-gray-700 text-gray-400 hover:text-yellow-400 hover:border-yellow-500/50"
                  onClick={() => handleBuild(type)}
                  disabled={store.money < getBuildingCost(type, instances.length)}
                >
                  <Hammer className="w-2.5 h-2.5 mr-1" />
                  Build (${formatNumber(getBuildingCost(type, instances.length))})
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Power History Mini-Chart */}
      {powerHistory.length > 1 && (
        <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <h3 className="text-sm font-semibold text-green-400">Power Production History</h3>
            <span className="text-[9px] text-gray-600 ml-auto">Last {powerHistory.length} snapshots</span>
          </div>
          <div className="h-16 bg-[#0a0e17] rounded-lg p-1">
            <PowerSparkline
              data={powerHistory}
              color={powerStatus === 'surplus' ? '#4ade80' : powerStatus === 'balanced' ? '#facc15' : '#f87171'}
              width={600}
              height={60}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Active Power Plants List */}
        <div className="lg:col-span-2">
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-semibold text-yellow-400">Active Power Plants</h3>
              </div>
              <span className="text-[10px] text-gray-500">
                {powerPlants.length} total • {activePowerPlants.length} running
              </span>
            </div>

            {powerPlants.length === 0 ? (
              <div className="text-center py-8">
                <Zap className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No power plants built yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Build your first power plant above to start generating electricity</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto game-scrollbar pr-1">
                {powerPlants.map(plant => {
                  const def = BUILDING_DEFS[plant.type];
                  if (!def) return null;
                  const meta = POWER_PLANT_META[plant.type as PowerPlantType];
                  const upgradeCost = getBuildingCost(plant.type, plant.level);
                  const canUpgrade = store.money >= upgradeCost;

                  let actualProduction = def.basePowerProduction * plant.level * plant.efficiency;
                  let productionNote = '';
                  let isDerated = false;

                  if (def.fuel && def.fuelRate) {
                    if (store.resources[def.fuel] < def.fuelRate * plant.level) {
                      actualProduction *= 0.1;
                      productionNote = 'Low fuel!';
                      isDerated = true;
                    }
                  }
                  if (plant.type === 'solarPanel') {
                    const factor = Math.max(0.2, 0.5 + 0.5 * Math.sin(store.gameTick * 0.01));
                    actualProduction *= factor;
                    productionNote = factor > 0.7 ? 'Peak sun' : factor > 0.4 ? 'Moderate' : 'Low light';
                  }
                  if (plant.type === 'windTurbine') {
                    const factor = Math.max(0.3, 0.5 + 0.5 * Math.sin(store.gameTick * 0.007 + Math.PI / 3));
                    actualProduction *= factor;
                    productionNote = factor > 0.7 ? 'Strong wind' : factor > 0.4 ? 'Moderate' : 'Low wind';
                  }

                  const maxProduction = def.basePowerProduction * plant.level;
                  const productionPct = maxProduction > 0 ? (actualProduction / maxProduction) * 100 : 0;

                  return (
                    <motion.div
                      key={plant.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-lg bg-[#0a0e17] p-3 border transition-all duration-200 ${
                        plant.active
                          ? isDerated ? 'border-red-900/40' : 'border-yellow-900/30'
                          : 'border-gray-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            onClick={() => handleToggle(plant.id)}
                            className={`text-xl transition-transform duration-200 hover:scale-110 ${
                              plant.active ? 'opacity-100' : 'grayscale opacity-50'
                            }`}
                            title={plant.active ? 'Click to disable' : 'Click to enable'}
                          >
                            {def.emoji}
                          </button>
                          <button
                            onClick={() => handleToggle(plant.id)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                              plant.active
                                ? 'border-green-500/50 bg-green-900/20 text-green-400'
                                : 'border-gray-700 bg-gray-800 text-gray-500'
                            }`}
                          >
                            {plant.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                          </button>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs text-gray-200 font-medium">{def.name}</span>
                            <Badge variant="outline" className="text-[9px] border-yellow-600/50 text-yellow-400 px-1.5 py-0">
                              Lv.{plant.level}
                            </Badge>
                            {!plant.active && (
                              <Badge variant="outline" className="text-[9px] border-gray-600 text-gray-500 px-1.5 py-0">
                                OFFLINE
                              </Badge>
                            )}
                            {isDerated && plant.active && (
                              <Badge variant="outline" className="text-[9px] border-red-600/50 text-red-400 px-1.5 py-0 neon-pulse">
                                LOW FUEL
                              </Badge>
                            )}
                          </div>

                          <div className="mb-1.5">
                            <div className="flex items-center justify-between text-[10px] mb-1">
                              <span className="text-gray-500">Output</span>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-mono font-bold ${plant.active ? meta.glowClass : 'text-gray-500'}`}>
                                  {formatNumber(actualProduction)} MW
                                </span>
                                <span className="text-gray-600">/ {formatNumber(maxProduction)} MW</span>
                              </div>
                            </div>
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
                              <motion.div
                                className={`h-full rounded-full ${
                                  isDerated ? 'bg-gradient-to-r from-red-700 to-red-500' :
                                  productionPct >= 80 ? 'bg-gradient-to-r from-green-700 to-green-400' :
                                  productionPct >= 50 ? 'bg-gradient-to-r from-yellow-700 to-yellow-400' :
                                  'bg-gradient-to-r from-cyan-700 to-cyan-400'
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${productionPct}%` }}
                                transition={{ duration: 0.5 }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                              </motion.div>
                              {plant.active && !isDerated && (
                                <div className="absolute inset-0 overflow-hidden rounded-full">
                                  <motion.div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                    animate={{ x: ['-100%', '100%'] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] ${isDerated ? 'text-red-400' : 'text-gray-500'}`}>
                              {productionNote}
                            </span>
                            {def.fuel && (
                              <div className="flex items-center gap-1">
                                <Fuel className="w-2.5 h-2.5 text-orange-500" />
                                <span className={`text-[9px] font-mono ${
                                  store.resources[def.fuel] < 50 ? 'text-red-400' : 'text-gray-400'
                                }`}>
                                  {RESOURCE_META[def.fuel].emoji} {formatNumber(store.resources[def.fuel])} ({formatNumber((def.fuelRate || 0) * plant.level)}/t)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-7 text-[10px] ${
                              canUpgrade
                                ? 'border-cyan-700/50 text-cyan-400 hover:bg-cyan-900/30 hover:border-cyan-500'
                                : 'border-gray-700 text-gray-500'
                            }`}
                            onClick={() => handleUpgrade(plant.id)}
                            disabled={!canUpgrade}
                          >
                            <ChevronUp className="w-3 h-3 mr-0.5" />
                            Upgrade
                          </Button>
                          <span className={`text-[9px] font-mono ${canUpgrade ? 'text-gray-400' : 'text-red-400'}`}>
                            ${formatNumber(upgradeCost)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Production Breakdown + Coal Fuel */}
        <div className="space-y-4">
          {/* PRODUCTION BREAKDOWN */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-semibold text-yellow-400">Production Breakdown</h3>
            </div>
            <div className="space-y-2.5">
              {POWER_PLANT_TYPES.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const meta = POWER_PLANT_META[type];
                const output = productionByType[type] || 0;
                const instances = plantsByType[type] || [];
                const activeInstances = instances.filter(b => b.active);
                const pct = totalRealProduction > 0 ? (output / totalRealProduction) * 100 : 0;
                const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);

                return (
                  <div key={type} className="bg-[#0a0e17] rounded-lg p-2.5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={meta.glowClass}>{meta.icon}</div>
                      <span className={`text-xs font-medium flex-1 ${unlocked ? 'text-gray-200' : 'text-gray-600'}`}>
                        {def.name}
                      </span>
                      <span className={`text-xs font-mono font-bold ${output > 0 ? meta.glowClass : 'text-gray-600'}`}>
                        {formatNumber(output)} MW
                      </span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-1">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: meta.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-gray-500">
                        {activeInstances.length}/{instances.length} running
                      </span>
                      <span className="text-[9px] text-gray-500 font-mono">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Total Production</span>
                <span className="text-sm font-mono font-bold text-green-400">{formatNumber(totalRealProduction)} MW</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Total Demand</span>
                <span className="text-sm font-mono font-bold text-orange-400">{formatNumber(powerGrid.totalConsumption)} MW</span>
              </div>
            </div>
          </div>

          {/* COAL FUEL STATUS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-orange-400" />
                <h3 className="text-sm font-semibold text-orange-400">Coal Fuel Status</h3>
              </div>
              {coalFuelStatus.isLow && (
                <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-900/20 text-[9px] neon-pulse">
                  LOW FUEL
                </Badge>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="bg-[#0a0e17] rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-400">Coal Stock</span>
                  <div className="flex items-center gap-1">
                    <span className="text-sm">{RESOURCE_META.coal.emoji}</span>
                    <span className={`text-xs font-mono font-bold ${
                      coalFuelStatus.stock < 50 ? 'text-red-400' : 'text-gray-200'
                    }`}>
                      {formatNumber(coalFuelStatus.stock)}
                    </span>
                  </div>
                </div>
                {/* Capacity bar for coal */}
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      coalFuelStatus.stock < 50 ? 'bg-red-500' :
                      coalFuelStatus.stock < store.resourceCapacity.coal * 0.5 ? 'bg-yellow-500' :
                      'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min(100, (coalFuelStatus.stock / store.resourceCapacity.coal) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="bg-[#0a0e17] rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Consumption</span>
                  <span className="text-xs font-mono text-orange-400">{formatNumber(coalFuelStatus.consumptionRate)}/t</span>
                </div>
              </div>

              <div className="bg-[#0a0e17] rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">Remaining</span>
                  <span className={`text-xs font-mono font-bold ${
                    coalFuelStatus.ticksRemaining < 500 ? 'text-red-400' : 'text-gray-200'
                  }`}>
                    {coalFuelStatus.ticksRemaining === Infinity ? '∞' : formatNumber(coalFuelStatus.ticksRemaining)} ticks
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
