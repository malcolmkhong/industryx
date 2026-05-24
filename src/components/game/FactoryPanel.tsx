'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, PRODUCTION_CHAINS } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Factory, ChevronUp, Power, PowerOff, Hammer, ArrowRight,
  Zap, Lock, Layers, Cog, Flame,
  Brain, ArrowDownToLine,
  ArrowUpFromLine, ChevronDown, Package, Workflow,
  Gauge, Box
} from 'lucide-react';
import { FactoryType, ResourceType } from '@/lib/game/types';

// Factory types organized by tier
const TIER_1_FACTORIES: FactoryType[] = ['smelter', 'wireMill', 'chemicalPlant', 'glassFurnace', 'steelForge', 'carbonProcessor'];
const TIER_2_FACTORIES: FactoryType[] = ['gearFactory', 'circuitFactory', 'engineFactory', 'batteryFactory'];
const TIER_3_FACTORIES: FactoryType[] = ['aiLab', 'roboticsBay', 'quantumLab', 'alloyForge', 'nanoLab'];

const TIER_CONFIG = {
  1: { label: 'Tier 1 — Basic Processing', color: 'cyan', icon: <Flame className="w-4 h-4" />, borderColor: 'border-cyan-900/40' },
  2: { label: 'Tier 2 — Advanced Manufacturing', color: 'orange', icon: <Cog className="w-4 h-4" />, borderColor: 'border-orange-900/40' },
  3: { label: 'Tier 3 — High-Tech Fabrication', color: 'purple', icon: <Brain className="w-4 h-4" />, borderColor: 'border-purple-900/40' },
};

type TierColor = 'cyan' | 'orange' | 'purple';

function getTierColorClasses(color: TierColor) {
  const map = {
    cyan: {
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bg: 'bg-cyan-900/20',
      hoverBorder: 'hover:border-cyan-500/50',
      glow: 'hover:shadow-[0_0_15px_rgba(0,255,242,0.1)]',
      buttonBorder: 'border-cyan-700/50',
      buttonText: 'text-cyan-400',
      buttonHover: 'hover:bg-cyan-900/30 hover:border-cyan-500',
      badge: 'border-cyan-600/50',
    },
    orange: {
      text: 'text-orange-400',
      border: 'border-orange-500/30',
      bg: 'bg-orange-900/20',
      hoverBorder: 'hover:border-orange-500/50',
      glow: 'hover:shadow-[0_0_15px_rgba(255,102,0,0.1)]',
      buttonBorder: 'border-orange-700/50',
      buttonText: 'text-orange-400',
      buttonHover: 'hover:bg-orange-900/30 hover:border-orange-500',
      badge: 'border-orange-600/50',
    },
    purple: {
      text: 'text-purple-400',
      border: 'border-purple-500/30',
      bg: 'bg-purple-900/20',
      hoverBorder: 'hover:border-purple-500/50',
      glow: 'hover:shadow-[0_0_15px_rgba(191,0,255,0.1)]',
      buttonBorder: 'border-purple-700/50',
      buttonText: 'text-purple-400',
      buttonHover: 'hover:bg-purple-900/30 hover:border-purple-500',
      badge: 'border-purple-600/50',
    },
  };
  return map[color];
}

export function FactoryPanel() {
  const store = useGameStore();
  const [expandedTier, setExpandedTier] = useState<number | null>(1);
  const [selectedChain, setSelectedChain] = useState<number>(0);

  // Track recently built/upgraded buildings for CSS animation classes
  const [recentlyBuilt, setRecentlyBuilt] = useState<Set<string>>(new Set());
  const [recentlyUpgraded, setRecentlyUpgraded] = useState<Set<string>>(new Set());

  // Factory buildings from store
  const factoryBuildings = useMemo(() =>
    store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory'),
    [store.buildings]
  );

  // Factories grouped by tier
  const factoriesByTier = useMemo(() => ({
    1: factoryBuildings.filter(b => TIER_1_FACTORIES.includes(b.type as FactoryType)),
    2: factoryBuildings.filter(b => TIER_2_FACTORIES.includes(b.type as FactoryType)),
    3: factoryBuildings.filter(b => TIER_3_FACTORIES.includes(b.type as FactoryType)),
  }), [factoryBuildings]);

  // Production rates for factories
  const factoryProductionRates = useMemo(() => {
    const rates: Record<string, number> = {};
    factoryBuildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def || !def.outputs) return;
      def.outputs.forEach(o => {
        rates[o.resource] = (rates[o.resource] || 0) + o.amount * b.level * b.efficiency * store.powerGrid.efficiency;
      });
    });
    return rates;
  }, [factoryBuildings, store.powerGrid.efficiency]);

  // Consumption rates for factories
  const factoryConsumptionRates = useMemo(() => {
    const rates: Record<string, number> = {};
    factoryBuildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def || !def.inputs) return;
      def.inputs.forEach(input => {
        rates[input.resource] = (rates[input.resource] || 0) + input.amount * b.level * b.efficiency * store.powerGrid.efficiency;
      });
    });
    return rates;
  }, [factoryBuildings, store.powerGrid.efficiency]);

  // Factory overview stats
  const totalFactories = factoryBuildings.length;
  const activeFactories = factoryBuildings.filter(b => b.active).length;
  const totalPowerConsumption = factoryBuildings
    .filter(b => b.active)
    .reduce((sum, b) => sum + BUILDING_DEFS[b.type].basePowerConsumption * b.level, 0);
  const avgEfficiency = activeFactories > 0
    ? factoryBuildings.filter(b => b.active).reduce((sum, b) => sum + b.efficiency, 0) / activeFactories
    : 0;

  const handleBuild = useCallback((type: FactoryType) => {
    const prevCount = store.buildings.filter(b => b.type === type).length;
    store.buildBuilding(type);
    // After building, find the newly added building and mark it for animation
    setTimeout(() => {
      const newBuildings = store.buildings.filter(b => b.type === type);
      if (newBuildings.length > prevCount) {
        const newBuilding = newBuildings[newBuildings.length - 1];
        if (newBuilding) {
          setRecentlyBuilt(prev => {
            const next = new Set(prev);
            next.add(newBuilding.id);
            return next;
          });
          setTimeout(() => {
            setRecentlyBuilt(prev => {
              const next = new Set(prev);
              next.delete(newBuilding.id);
              return next;
            });
          }, 1000);
        }
      }
    }, 50);
  }, [store]);

  const handleUpgrade = useCallback((id: string) => {
    store.upgradeBuilding(id);
    setRecentlyUpgraded(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setRecentlyUpgraded(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 1000);
  }, [store]);

  const handleToggle = (id: string) => {
    store.toggleBuilding(id);
  };

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 neon-glow-cyan tracking-wide flex items-center gap-2">
            <Factory className="w-5 h-5" />
            Processing Factories
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Transform raw materials into advanced components</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <Factory className="w-3 h-3 mr-1" />
            {activeFactories}/{totalFactories} Active
          </Badge>
          <Badge variant="outline" className="border-yellow-500/50 text-yellow-400 bg-yellow-900/20 text-xs">
            <Zap className="w-3 h-3 mr-1" />
            {formatNumber(totalPowerConsumption)} MW
          </Badge>
        </div>
      </div>

      {/* OVERVIEW STATS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FactoryStatCard
          icon={<Factory className="w-4 h-4" />}
          label="Total Factories"
          value={totalFactories.toString()}
          subtext={`${activeFactories} running`}
          color="cyan"
        />
        <FactoryStatCard
          icon={<Zap className="w-4 h-4" />}
          label="Power Draw"
          value={`${formatNumber(totalPowerConsumption)}`}
          subtext="MW consumed"
          color="yellow"
        />
        <FactoryStatCard
          icon={<Gauge className="w-4 h-4" />}
          label="Avg Efficiency"
          value={`${(avgEfficiency * 100).toFixed(0)}%`}
          subtext={store.powerGrid.overload ? 'Grid overloaded!' : 'Nominal'}
          color={avgEfficiency >= 0.8 ? 'green' : avgEfficiency >= 0.5 ? 'orange' : 'red'}
        />
        <FactoryStatCard
          icon={<Package className="w-4 h-4" />}
          label="Products"
          value={Object.keys(factoryProductionRates).length.toString()}
          subtext="resource types"
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Factory Building Cards */}
        <div className="lg:col-span-2 space-y-3">
          {/* TIER SECTIONS */}
          {([1, 2, 3] as const).map(tier => {
            const config = TIER_CONFIG[tier];
            const factories = tier === 1 ? TIER_1_FACTORIES : tier === 2 ? TIER_2_FACTORIES : TIER_3_FACTORIES;
            const tierBuildings = factoriesByTier[tier];
            const colorClasses = getTierColorClasses(config.color as TierColor);
            const isExpanded = expandedTier === tier;

            return (
              <div key={tier} className={`game-card rounded-xl bg-[#111827] border ${config.borderColor} overflow-hidden`}>
                {/* Tier Header */}
                <button
                  className="w-full p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedTier(isExpanded ? null : tier)}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg ${colorClasses.bg} flex items-center justify-center ${colorClasses.text}`}>
                      {config.icon}
                    </div>
                    <div className="text-left">
                      <h3 className={`text-sm font-semibold ${colorClasses.text}`}>{config.label}</h3>
                      <p className="text-[10px] text-gray-500">{tierBuildings.length} built • {tierBuildings.filter(b => b.active).length} active</p>
                    </div>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className={`w-4 h-4 ${colorClasses.text}`} />
                  </motion.div>
                </button>

                {/* Tier Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4">
                        {/* Build Factory Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          {factories.map(type => {
                            const def = BUILDING_DEFS[type];
                            if (!def) return null;
                            const existingCount = store.buildings.filter(b => b.type === type).length;
                            const cost = getBuildingCost(type, existingCount);
                            const canAfford = store.money >= cost;
                            const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);

                            return (
                              <div
                                key={type}
                                className={`relative rounded-lg p-3 border bg-[#0a0e17] transition-all duration-200 ${
                                  !unlocked
                                    ? 'border-gray-800 opacity-60'
                                    : canAfford
                                      ? `${colorClasses.hoverBorder} ${colorClasses.glow}`
                                      : 'border-gray-800'
                                }`}
                              >
                                {!unlocked && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg z-10">
                                    <Lock className="w-5 h-5 text-gray-600" />
                                  </div>
                                )}
                                <div className="text-center">
                                  <span className="text-2xl block mb-1">{def.emoji}</span>
                                  <p className="text-xs text-gray-200 font-medium mb-0.5">{def.name}</p>
                                  <p className="text-[9px] text-gray-500 mb-2 line-clamp-2 min-h-[2em]">{def.description}</p>

                                  {/* Cost */}
                                  <div className="flex items-center justify-center gap-1 mb-1.5">
                                    <span className="text-[10px] text-gray-500">Cost:</span>
                                    <span className={`text-xs font-mono font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                                      ${formatNumber(cost)}
                                    </span>
                                  </div>

                                  {/* Power consumption */}
                                  <div className="flex items-center justify-center gap-1 mb-1.5">
                                    <Zap className="w-2.5 h-2.5 text-yellow-500" />
                                    <span className="text-[10px] text-gray-500">{def.basePowerConsumption} MW</span>
                                  </div>

                                  {/* Inputs → Outputs */}
                                  <div className="mb-3">
                                    {def.inputs && def.inputs.length > 0 && (
                                      <div className="flex flex-wrap items-center justify-center gap-0.5 mb-1">
                                        {def.inputs.map((inp, i) => (
                                          <span key={i} className="text-[9px] text-red-300/80 bg-red-900/20 rounded px-1 py-0.5">
                                            {RESOURCE_META[inp.resource].emoji}{inp.amount}
                                          </span>
                                        ))}
                                        <ArrowRight className="w-2.5 h-2.5 text-gray-600 mx-0.5" />
                                      </div>
                                    )}
                                    {def.outputs && (
                                      <div className="flex flex-wrap items-center justify-center gap-0.5">
                                        {def.outputs.map((out, i) => (
                                          <span key={i} className="text-[9px] text-green-300/80 bg-green-900/20 rounded px-1 py-0.5">
                                            {RESOURCE_META[out.resource].emoji}{out.amount}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`w-full h-7 text-[10px] ${
                                      !unlocked ? 'hidden' :
                                      canAfford
                                        ? `${colorClasses.buttonBorder} ${colorClasses.buttonText} ${colorClasses.buttonHover}`
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
                                        {store.buildings.filter(b => b.type === type && b.active).length}/{existingCount} active
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Active Factories for this Tier */}
                        {tierBuildings.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Layers className={`w-3.5 h-3.5 ${colorClasses.text}`} />
                              <h4 className={`text-xs font-semibold ${colorClasses.text}`}>Active Factories</h4>
                            </div>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto game-scrollbar pr-1">
                              {tierBuildings.map(building => {
                                const def = BUILDING_DEFS[building.type];
                                if (!def) return null;
                                const upgradeCost = getBuildingCost(building.type, building.level);
                                const canUpgrade = store.money >= upgradeCost;
                                const effectiveOutputs = def.outputs
                                  ? def.outputs.map(o => ({
                                      resource: o.resource,
                                      rate: o.amount * building.level * building.efficiency * store.powerGrid.efficiency,
                                      meta: RESOURCE_META[o.resource],
                                    }))
                                  : [];
                                const effectiveInputs = def.inputs
                                  ? def.inputs.map(inp => ({
                                      resource: inp.resource,
                                      rate: inp.amount * building.level * building.efficiency * store.powerGrid.efficiency,
                                      meta: RESOURCE_META[inp.resource],
                                      hasEnough: store.resources[inp.resource] >= inp.amount * building.level * building.efficiency * store.powerGrid.efficiency,
                                    }))
                                  : [];
                                const eff = building.efficiency * store.powerGrid.efficiency;

                                return (
                                  <motion.div
                                    key={building.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`rounded-lg bg-[#0a0e17] p-3 border transition-all duration-200 ${
                                      recentlyBuilt.has(building.id) ? 'build-construct' : ''
                                    } ${
                                      recentlyUpgraded.has(building.id) ? 'upgrade-flash' : ''
                                    } ${
                                      building.active
                                        ? `${colorClasses.border}`
                                        : 'border-gray-800 opacity-60'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      {/* Emoji + toggle */}
                                      <div className="flex flex-col items-center gap-1.5">
                                        <button
                                          onClick={() => handleToggle(building.id)}
                                          className={`text-xl transition-transform duration-200 hover:scale-110 ${
                                            building.active ? 'opacity-100' : 'grayscale opacity-50'
                                          }`}
                                          title={building.active ? 'Click to disable' : 'Click to enable'}
                                        >
                                          {def.emoji}
                                        </button>
                                        <button
                                          onClick={() => handleToggle(building.id)}
                                          className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                            building.active
                                              ? 'border-green-500/50 bg-green-900/20 text-green-400'
                                              : 'border-gray-700 bg-gray-800 text-gray-500'
                                          }`}
                                        >
                                          {building.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                                        </button>
                                      </div>

                                      {/* Info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                          <span className="text-xs text-gray-200 font-medium">{def.name}</span>
                                          <Badge variant="outline" className={`text-[9px] ${colorClasses.badge} ${colorClasses.text} px-1.5 py-0`}>
                                            Lv.{building.level}
                                          </Badge>
                                          {!building.active && (
                                            <Badge variant="outline" className="text-[9px] border-gray-600 text-gray-500 px-1.5 py-0">
                                              OFFLINE
                                            </Badge>
                                          )}
                                        </div>

                                        {/* Input → Output flow */}
                                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                          {effectiveInputs.map(({ resource, rate, meta, hasEnough }, i) => (
                                            <div key={i} className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 ${
                                              hasEnough ? 'bg-red-900/15' : 'bg-red-900/30 border border-red-800/50'
                                            }`}>
                                              <span className="text-xs">{meta.emoji}</span>
                                              <span className={`text-[10px] font-mono ${building.active ? (hasEnough ? 'text-red-300/80' : 'text-red-400') : 'text-gray-500'}`}>
                                                -{formatNumber(rate)}
                                              </span>
                                            </div>
                                          ))}
                                          {effectiveInputs.length > 0 && (
                                            <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                                          )}
                                          {effectiveOutputs.map(({ resource, rate, meta }, i) => (
                                            <div key={i} className="flex items-center gap-0.5 bg-green-900/15 rounded px-1.5 py-0.5">
                                              <span className="text-xs">{meta.emoji}</span>
                                              <span className={`text-[10px] font-mono ${building.active ? 'text-green-400' : 'text-gray-500'}`}>
                                                +{formatNumber(rate)}
                                              </span>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Efficiency bar */}
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] text-gray-500">Eff</span>
                                          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                            <motion.div
                                              className={`h-full rounded-full ${
                                                eff >= 0.8 ? 'bg-gradient-to-r from-green-600 to-green-400' :
                                                eff >= 0.5 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                                                'bg-gradient-to-r from-red-600 to-red-400'
                                              }`}
                                              initial={{ width: 0 }}
                                              animate={{ width: `${eff * 100}%` }}
                                              transition={{ duration: 0.5 }}
                                            />
                                          </div>
                                          <span className={`text-[9px] font-mono ${
                                            eff >= 0.8 ? 'text-green-400' : eff >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                                          }`}>
                                            {(eff * 100).toFixed(0)}%
                                          </span>
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
                                          onClick={() => handleUpgrade(building.id)}
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
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* RIGHT: Production Chains & Stats */}
        <div className="space-y-4">
          {/* PRODUCTION CHAIN VISUALIZATION */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Workflow className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Production Chains</h3>
              </div>
              <span className="text-[10px] text-gray-500">{PRODUCTION_CHAINS.length} chains</span>
            </div>

            {/* Chain selector tabs */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PRODUCTION_CHAINS.map((chain, idx) => (
                <button
                  key={chain.name}
                  onClick={() => setSelectedChain(idx)}
                  className={`text-[9px] px-2 py-1 rounded-md border transition-all ${
                    selectedChain === idx
                      ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-400'
                      : 'border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300'
                  }`}
                >
                  {chain.name}
                </button>
              ))}
            </div>

            {/* Selected chain visualization */}
            {PRODUCTION_CHAINS[selectedChain] && (
              <div className="bg-[#0a0e17] rounded-lg p-3">
                <div className="flex items-center gap-1 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PRODUCTION_CHAINS[selectedChain].color }} />
                  <span className="text-xs text-gray-300 font-medium">{PRODUCTION_CHAINS[selectedChain].name}</span>
                </div>

                {/* Chain steps with animated flow */}
                <div className="space-y-1">
                  {PRODUCTION_CHAINS[selectedChain].steps.map((resource, idx) => {
                    const meta = RESOURCE_META[resource as ResourceType];
                    const production = factoryProductionRates[resource] || 0;
                    const consumption = factoryConsumptionRates[resource] || 0;
                    const net = production - consumption;
                    const stock = store.resources[resource as ResourceType];
                    const capacity = store.resourceCapacity[resource as ResourceType];
                    const fillPct = capacity > 0 ? (stock / capacity) * 100 : 0;

                    return (
                      <div key={resource}>
                        <div className="flex items-center gap-2">
                          {/* Step node */}
                          <div
                            className="flex items-center gap-2 flex-1 rounded-lg p-2 border transition-all"
                            style={{
                              borderColor: `${meta.color}33`,
                              backgroundColor: `${meta.color}0a`,
                            }}
                          >
                            <span className="text-sm">{meta.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-200 font-medium">{meta.name}</span>
                                <span className={`text-[9px] font-mono ${
                                  net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : 'text-gray-500'
                                }`}>
                                  {net > 0 ? '+' : ''}{formatNumber(net)}/t
                                </span>
                              </div>
                              {/* Stock bar */}
                              <div className="h-1 bg-gray-800 rounded-full overflow-hidden mt-1">
                                <motion.div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: meta.color }}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.min(100, fillPct)}%` }}
                                  transition={{ duration: 0.5 }}
                                />
                              </div>
                              <div className="flex justify-between mt-0.5">
                                <span className="text-[8px] text-gray-500 font-mono">{formatNumber(stock)}</span>
                                <span className="text-[8px] text-gray-600 font-mono">{formatNumber(capacity)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Animated arrow between steps */}
                        {idx < PRODUCTION_CHAINS[selectedChain].steps.length - 1 && (
                          <div className="flex items-center justify-center py-1">
                            <div className="flex flex-col items-center">
                              <motion.div
                                animate={{ y: [0, 3, 0] }}
                                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                              >
                                <ArrowRight
                                  className="w-3.5 h-3.5 rotate-90"
                                  style={{ color: PRODUCTION_CHAINS[selectedChain].color }}
                                />
                              </motion.div>
                              {/* Neon flow line */}
                              <div className="w-px h-2 relative overflow-hidden">
                                <motion.div
                                  className="w-full h-full"
                                  style={{ backgroundColor: PRODUCTION_CHAINS[selectedChain].color }}
                                  animate={{ opacity: [0.3, 1, 0.3] }}
                                  transition={{ duration: 1.5, repeat: Infinity }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* FACTORY OVERVIEW STATS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-orange-400">Factory Overview</h3>
            </div>
            <div className="space-y-2.5">
              <OverviewRow label="Total Factories" value={totalFactories.toString()} color="text-gray-200" />
              <OverviewRow label="Active" value={`${activeFactories}/${totalFactories}`} color="text-green-400" />
              <OverviewRow label="Power Draw" value={`${formatNumber(totalPowerConsumption)} MW`} color="text-yellow-400" />
              <OverviewRow label="Avg Efficiency" value={`${(avgEfficiency * 100).toFixed(1)}%`} color={
                avgEfficiency >= 0.8 ? 'text-green-400' : avgEfficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'
              } />
              <OverviewRow label="Product Types" value={Object.keys(factoryProductionRates).length.toString()} color="text-cyan-400" />
              <OverviewRow label="Factories Built" value={store.stats.factoriesBuilt.toString()} color="text-gray-300" />
            </div>
          </div>

          {/* TOP PRODUCING FACTORIES */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Top Production</h3>
              </div>
              <span className="text-[10px] text-gray-500">per tick</span>
            </div>
            {Object.keys(factoryProductionRates).length === 0 ? (
              <div className="text-center py-6">
                <Cog className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No active production</p>
                <p className="text-[10px] text-gray-600 mt-1">Build and activate factories to start producing</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(Object.entries(factoryProductionRates) as [ResourceType, number][])
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([resource, rate]) => {
                    const meta = RESOURCE_META[resource];
                    return (
                      <div key={resource} className="flex items-center justify-between bg-[#0a0e17] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{meta.emoji}</span>
                          <span className="text-xs text-gray-300">{meta.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowUpFromLine className="w-3 h-3 text-green-400" />
                          <span className="text-xs text-green-400 font-mono font-bold">+{formatNumber(rate)}</span>
                          <span className="text-[10px] text-gray-500">/t</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* INPUT REQUIREMENTS */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-red-400">Input Demand</h3>
              </div>
              <span className="text-[10px] text-gray-500">per tick</span>
            </div>
            {Object.keys(factoryConsumptionRates).length === 0 ? (
              <div className="text-center py-6">
                <Box className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No input demand</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(Object.entries(factoryConsumptionRates) as [ResourceType, number][])
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([resource, rate]) => {
                    const meta = RESOURCE_META[resource];
                    const production = factoryProductionRates[resource] || 0;
                    const net = production - rate;
                    const stock = store.resources[resource];
                    return (
                      <div key={resource} className="bg-[#0a0e17] rounded-lg p-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{meta.emoji}</span>
                            <span className="text-xs text-gray-300">{meta.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ArrowDownToLine className="w-3 h-3 text-red-400" />
                            <span className="text-[10px] text-red-400 font-mono">-{formatNumber(rate)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-gray-500">Stock: {formatNumber(stock)}</span>
                          <span className={`text-[9px] font-mono ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {net >= 0 ? '+' : ''}{formatNumber(net)}/t net
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function FactoryStatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  color: 'cyan' | 'green' | 'orange' | 'red' | 'purple' | 'yellow';
}) {
  const colorMap = {
    cyan: { icon: 'text-cyan-400', value: 'text-cyan-400', border: 'border-cyan-900/30', bg: 'bg-cyan-900/10' },
    green: { icon: 'text-green-400', value: 'text-green-400', border: 'border-green-900/30', bg: 'bg-green-900/10' },
    orange: { icon: 'text-orange-400', value: 'text-orange-400', border: 'border-orange-900/30', bg: 'bg-orange-900/10' },
    red: { icon: 'text-red-400', value: 'text-red-400', border: 'border-red-900/30', bg: 'bg-red-900/10' },
    purple: { icon: 'text-purple-400', value: 'text-purple-400', border: 'border-purple-900/30', bg: 'bg-purple-900/10' },
    yellow: { icon: 'text-yellow-400', value: 'text-yellow-400', border: 'border-yellow-900/30', bg: 'bg-yellow-900/10' },
  };
  const c = colorMap[color];

  return (
    <div className={`game-card rounded-xl bg-[#111827] p-3 border ${c.border}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
          <div className={c.icon}>{icon}</div>
        </div>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold font-mono ${c.value}`}>{value}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{subtext}</div>
    </div>
  );
}

function OverviewRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-mono font-medium ${color}`}>{value}</span>
    </div>
  );
}
