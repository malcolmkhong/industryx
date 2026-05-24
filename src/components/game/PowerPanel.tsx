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
  CircleAlert, Minus, Lock
} from 'lucide-react';
import { PowerPlantType, BuildingInstance } from '@/lib/game/types';

const POWER_PLANT_TYPES: PowerPlantType[] = ['coalGenerator', 'solarPanel', 'windTurbine', 'nuclearReactor', 'fusionReactor'];

const POWER_PLANT_META: Record<PowerPlantType, { icon: React.ReactNode; color: string; label: string; glowClass: string }> = {
  coalGenerator: { icon: <Flame className="w-4 h-4" />, color: '#ff6600', label: 'Coal', glowClass: 'text-orange-400' },
  solarPanel: { icon: <Sun className="w-4 h-4" />, color: '#ffff00', label: 'Solar', glowClass: 'text-yellow-400' },
  windTurbine: { icon: <Wind className="w-4 h-4" />, color: '#00ccff', label: 'Wind', glowClass: 'text-cyan-400' },
  nuclearReactor: { icon: <Atom className="w-4 h-4" />, color: '#00ff66', label: 'Nuclear', glowClass: 'text-green-400' },
  fusionReactor: { icon: <Sparkles className="w-4 h-4" />, color: '#bf00ff', label: 'Fusion', glowClass: 'text-purple-400' },
};

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

  const handleBuild = (type: PowerPlantType) => {
    store.buildBuilding(type);
  };

  const handleUpgrade = (id: string) => {
    store.upgradeBuilding(id);
  };

  const handleToggle = (id: string) => {
    store.toggleBuilding(id);
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
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

      {/* POWER GAUGE - Dramatic visualization */}
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

        {/* Power balance bar - The dramatic gauge */}
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

          {/* Main power bar */}
          <div className="h-6 bg-gray-800 rounded-full overflow-hidden relative">
            {/* Consumption background fill */}
            <div
              className="absolute inset-y-0 left-0 bg-orange-600/20 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, (powerGrid.totalConsumption / Math.max(1, totalRealProduction)) * 100)}%` }}
            />

            {/* Production fill */}
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
              {/* Animated flow shimmer */}
              <div className="absolute inset-0 overflow-hidden rounded-full">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                  animate={{ x: ['-100%', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                />
              </div>
            </motion.div>

            {/* Overload flash overlay */}
            {powerStatus === 'overloaded' && (
              <motion.div
                className="absolute inset-0 bg-red-500/20 rounded-full"
                animate={{ opacity: [0, 0.4, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}

            {/* Center text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-mono text-white/70 font-medium">
                {powerBalance >= 0 ? '+' : ''}{formatNumber(powerBalance)} MW
              </span>
            </div>
          </div>

          {/* Scale markers */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Build Power Plants */}
        <div className="lg:col-span-2 space-y-4">
          {/* BUILD POWER PLANTS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Hammer className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-semibold text-yellow-400">Build Power Plant</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {POWER_PLANT_TYPES.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const meta = POWER_PLANT_META[type];
                const existingCount = store.buildings.filter(b => b.type === type).length;
                const cost = getBuildingCost(type, existingCount);
                const canAfford = store.money >= cost;
                const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);
                const activeCount = store.buildings.filter(b => b.type === type && b.active).length;
                const currentOutput = productionByType[type] || 0;

                return (
                  <div
                    key={type}
                    className={`relative rounded-lg p-3 border bg-[#0a0e17] transition-all duration-200 ${
                      !unlocked
                        ? 'border-gray-800 opacity-60'
                        : canAfford
                          ? 'border-yellow-900/30 hover:border-yellow-500/50 hover:shadow-[0_0_15px_rgba(255,255,0,0.08)]'
                          : 'border-gray-800'
                    }`}
                  >
                    {!unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg z-10">
                        <Lock className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                    <div className="text-center">
                      {/* Plant icon with glow */}
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-2 ${
                        unlocked ? 'bg-gray-800/50' : 'bg-gray-800/30'
                      }`}>
                        <div className={meta.glowClass}>
                          {meta.icon}
                        </div>
                      </div>

                      <p className="text-xs text-gray-200 font-medium mb-0.5">{def.name}</p>
                      <p className="text-[9px] text-gray-500 mb-2 line-clamp-2 min-h-[2em]">{def.description}</p>

                      {/* Output */}
                      <div className="flex items-center justify-center gap-1 mb-1.5">
                        <Zap className="w-2.5 h-2.5 text-yellow-500" />
                        <span className="text-[10px] text-yellow-400 font-mono">{def.basePowerProduction} MW</span>
                      </div>

                      {/* Fuel info for coal */}
                      {def.fuel && (
                        <div className="flex items-center justify-center gap-1 mb-1.5">
                          <Flame className="w-2.5 h-2.5 text-orange-500" />
                          <span className="text-[10px] text-orange-400">
                            Uses {RESOURCE_META[def.fuel].emoji} {def.fuelRate}/t
                          </span>
                        </div>
                      )}

                      {/* Current output if any */}
                      {existingCount > 0 && (
                        <div className="flex items-center justify-center gap-1 mb-1.5">
                          <Activity className="w-2.5 h-2.5 text-green-500" />
                          <span className="text-[10px] text-green-400 font-mono">{formatNumber(currentOutput)} MW active</span>
                        </div>
                      )}

                      {/* Cost */}
                      <div className="flex items-center justify-center gap-1 mb-2">
                        <span className="text-[10px] text-gray-500">Cost:</span>
                        <span className={`text-xs font-mono font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                          ${formatNumber(cost)}
                        </span>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className={`w-full h-7 text-[10px] ${
                          !unlocked ? 'hidden' :
                          canAfford
                            ? 'border-yellow-700/50 text-yellow-400 hover:bg-yellow-900/30 hover:border-yellow-500'
                            : 'border-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                        onClick={() => handleBuild(type)}
                        disabled={!canAfford || !unlocked}
                      >
                        <Hammer className="w-3 h-3 mr-1" />
                        Build
                      </Button>

                      {existingCount > 0 && (
                        <div className="mt-1.5 text-center">
                          <span className="text-[9px] text-gray-500">
                            {activeCount}/{existingCount} active
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTIVE POWER PLANTS LIST */}
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

                  // Calculate actual production for this plant
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
                    const dayFactor = 0.5 + 0.5 * Math.sin(store.gameTick * 0.01);
                    const factor = Math.max(0.2, dayFactor);
                    actualProduction *= factor;
                    productionNote = factor > 0.7 ? 'Peak sun' : factor > 0.4 ? 'Moderate' : 'Low light';
                  }
                  if (plant.type === 'windTurbine') {
                    const windFactor = 0.5 + 0.5 * Math.sin(store.gameTick * 0.007 + Math.PI / 3);
                    const factor = Math.max(0.3, windFactor);
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
                        {/* Plant icon + toggle */}
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

                        {/* Info */}
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

                          {/* Production bar */}
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
                              {/* Animated power flow */}
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

                          {/* Production note & fuel info */}
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] ${
                              isDerated ? 'text-red-400' : 'text-gray-500'
                            }`}>
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

                        {/* Upgrade button */}
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

        {/* RIGHT: Power Stats & Fuel */}
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
                      <div className={`${meta.glowClass}`}>{meta.icon}</div>
                      <span className={`text-xs font-medium flex-1 ${unlocked ? 'text-gray-200' : 'text-gray-600'}`}>
                        {def.name}
                      </span>
                      <span className={`text-xs font-mono font-bold ${output > 0 ? meta.glowClass : 'text-gray-600'}`}>
                        {formatNumber(output)} MW
                      </span>
                    </div>
                    {/* Production bar */}
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

            {/* Total production visual */}
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

          {/* ANIMATED POWER FLOW VISUALIZATION */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Power Flow</h3>
            </div>
            <div className="relative h-32 bg-[#0a0e17] rounded-lg overflow-hidden">
              {/* Grid lines */}
              <div className="absolute inset-0 opacity-10">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="absolute h-px bg-cyan-400" style={{
                    top: `${(i + 1) * 12.5}%`,
                    left: '5%',
                    right: '5%',
                  }} />
                ))}
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="absolute w-px bg-cyan-400" style={{
                    left: `${(i + 1) * 16.6}%`,
                    top: '5%',
                    bottom: '5%',
                  }} />
                ))}
              </div>

              {/* Power flow particles */}
              {powerGrid.efficiency > 0 && (
                <>
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={`particle-${i}`}
                      className="absolute w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor: powerStatus === 'surplus' ? '#39ff14' : powerStatus === 'balanced' ? '#ffff00' : '#ff0040',
                        boxShadow: `0 0 6px ${powerStatus === 'surplus' ? '#39ff14' : powerStatus === 'balanced' ? '#ffff00' : '#ff0040'}`,
                      }}
                      animate={{
                        x: ['-10%', '110%'],
                        y: [`${15 + i * 14}%`],
                      }}
                      transition={{
                        duration: 2 + i * 0.3,
                        repeat: Infinity,
                        delay: i * 0.4,
                        ease: 'linear',
                      }}
                    />
                  ))}
                </>
              )}

              {/* Center status indicator */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  className={`w-14 h-14 rounded-full border-2 flex items-center justify-center ${
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
                  <Zap className={`w-6 h-6 ${
                    powerStatus === 'surplus' ? 'text-green-400' :
                    powerStatus === 'balanced' ? 'text-yellow-400' :
                    'text-red-400'
                  }`} />
                </motion.div>
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
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${
                      coalFuelStatus.stock < 50 ? 'bg-gradient-to-r from-red-700 to-red-500' :
                      coalFuelStatus.stock < 200 ? 'bg-gradient-to-r from-orange-700 to-orange-400' :
                      'bg-gradient-to-r from-gray-600 to-gray-400'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (coalFuelStatus.stock / store.resourceCapacity.coal) * 100)}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500 mb-0.5">Burn Rate</div>
                  <div className="text-xs font-mono font-bold text-orange-400">
                    {formatNumber(coalFuelStatus.consumptionRate)}/t
                  </div>
                </div>
                <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
                  <div className="text-[10px] text-gray-500 mb-0.5">Remaining</div>
                  <div className={`text-xs font-mono font-bold ${
                    coalFuelStatus.ticksRemaining < 500 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {coalFuelStatus.ticksRemaining === Infinity ? '∞' : formatNumber(coalFuelStatus.ticksRemaining) + 't'}
                  </div>
                </div>
              </div>

              {coalFuelStatus.isLow && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 bg-red-900/15 border border-red-800/30 rounded-lg p-2"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  <p className="text-[10px] text-red-400/80">Coal reserves critically low! Build mining drills or purchase coal from the market.</p>
                </motion.div>
              )}
            </div>
          </div>

          {/* POWER TIPS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Power Management</h3>
            </div>
            <div className="space-y-2">
              <TipRow label="Always maintain 20%+ power surplus for stability" />
              <TipRow label="Solar panels vary with day/night cycles" />
              <TipRow label="Wind turbines have variable output" />
              <TipRow label="Coal generators need steady fuel supply" />
              <TipRow label="Nuclear provides massive stable output" />
              <TipRow label="Fusion reactors are the ultimate power source" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function TipRow({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-1 h-1 rounded-full bg-cyan-600 mt-1.5 flex-shrink-0" />
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  );
}
