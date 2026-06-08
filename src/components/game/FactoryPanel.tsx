'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, PRODUCTION_CHAINS, RESEARCH_TREE } from '@/lib/game/configCache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Factory, ChevronUp, Power, PowerOff, Hammer, ArrowRight,
  Zap, Lock, Layers, Cog, Flame,
  Brain, ArrowDownToLine,
  ArrowUpFromLine, Package, Workflow,
  Gauge, Box,
  Pickaxe, Sparkles, X, Search,
} from 'lucide-react';
import { FactoryType, ResourceType } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { getTierColorClasses, type TierColor } from '@/components/game/shared/tierColors';
import { GameIcon } from '@/components/game/shared/GameIcon';

// Factory types organized by tier
const TIER_1_FACTORIES: FactoryType[] = ['smelter', 'wireMill', 'chemicalPlant', 'glassFurnace', 'carbonProcessor', 'brickFactory', 'concreteFactory', 'fertilizerFactory', 'steelForge', 'oilRefinery'];
const TIER_2_FACTORIES: FactoryType[] = ['gearFactory', 'circuitFactory', 'engineFactory', 'batteryFactory', 'siliconRefinery', 'aluminiumFactory', 'insecticideFactory', 'copperRefinery', 'titaniumRefinery', 'coolantPlant', 'opticsLab', 'solarCellFactory', 'displayFactory', 'hydrogenPlant', 'reinforcedConcretePlant', 'powerCellPlant', 'silverRefinery', 'goldRefinery'];
const TIER_3_FACTORIES: FactoryType[] = ['aiLab', 'roboticsBay', 'quantumLab', 'alloyForge', 'nanoLab', 'electronicsFactory', 'medicalTechLab', 'jewelleryForge', 'tungstenSmelter', 'armsFactory', 'droneShipyard', 'detectorFactory', 'neuralLab', 'quantumAssembler', 'opticalComputingLab', 'carbonCompositePlant', 'structuralFrameFactory', 'fusionReactor', 'solarPanelFactory', 'creditMint'];
const TIER_4_FACTORIES: FactoryType[] = ['singularityForge', 'darkMatterLab', 'warpDriveFactory', 'antimatterReactor', 'chronoLab', 'plasmaForge', 'megaStructureFactory', 'voidCrystallizer', 'quantumResonanceLab', 'arcologyBuilder', 'habitatModuleFactory', 'dysonCollector', 'luxuryGoodsFactory', 'tradeHub', 'teleporterGate', 'quantumTeleporter', 'dimensionalGateway', 'timeDistorter', 'galacticForge'];

const TIER_CONFIG = {
  1: { label: 'T1 — Processing', shortLabel: 'T1', color: 'cyan', icon: 'gi:flame-tunnel', borderColor: 'border-cyan-900/40', hex: '#22d3ee' },
  2: { label: 'T2 — Manufacturing', shortLabel: 'T2', color: 'orange', icon: 'gi:big-gear', borderColor: 'border-orange-900/40', hex: '#f97316' },
  3: { label: 'T3 — High-Tech', shortLabel: 'T3', color: 'purple', icon: 'gi:brain', borderColor: 'border-purple-900/40', hex: '#a855f7' },
  4: { label: 'T4 — Singularity', shortLabel: 'T4', color: 'emerald', icon: 'gi:sparkles', borderColor: 'border-emerald-900/40', hex: '#00ffcc' },
};



// Flow diagram tier nodes
const FLOW_TIERS = [
  { key: 'raw', label: 'Raw Materials', icon: <Pickaxe className="w-4 h-4" />, color: '#6b7280', bgClass: 'bg-gray-900/30', borderClass: 'border-gray-700/40', textClass: 'text-gray-300' },
  { key: 't1', label: 'T1 Processing', icon: <Flame className="w-4 h-4" />, color: '#22d3ee', bgClass: 'bg-cyan-900/20', borderClass: 'border-cyan-700/40', textClass: 'text-cyan-400' },
  { key: 't2', label: 'T2 Manufacturing', icon: <Cog className="w-4 h-4" />, color: '#f97316', bgClass: 'bg-orange-900/20', borderClass: 'border-orange-700/40', textClass: 'text-orange-400' },
  { key: 't3', label: 'T3 High-Tech', icon: <Sparkles className="w-4 h-4" />, color: '#a855f7', bgClass: 'bg-purple-900/20', borderClass: 'border-purple-700/40', textClass: 'text-purple-400' },
  { key: 't4', label: 'T4 Singularity', icon: <Sparkles className="w-4 h-4" />, color: '#00ffcc', bgClass: 'bg-emerald-900/20', borderClass: 'border-emerald-700/40', textClass: 'text-emerald-400' },
] as const;

// Resource tier mapping for flow diagram
function getResourceTier(res: ResourceType): number {
  return RESOURCE_META[res]?.tier ?? 0;
}

export function FactoryPanel() {
  const store = useGameStore();
  const [selectedTier, setSelectedTier] = useState<number>(1);
  const [selectedChain, setSelectedChain] = useState<number>(0);
  const [selectedFlowNode, setSelectedFlowNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
    4: factoryBuildings.filter(b => TIER_4_FACTORIES.includes(b.type as FactoryType)),
  }), [factoryBuildings]);

  // Production rates for factories — aggregated from productionSnapshot (single source of truth)
  const factoryProductionRates = useMemo(() => {
    const rates: Record<string, number> = {};
    factoryBuildings.forEach(b => {
      if (!b.active) return;
      const snap = store.productionSnapshot.buildings[b.id];
      if (!snap) return;
      snap.outputs.forEach(o => {
        rates[o.resource] = (rates[o.resource] || 0) + o.amount;
      });
    });
    return rates;
  }, [factoryBuildings, store.productionSnapshot.buildings]);

  // Production rates from ALL buildings — read from snapshot which includes all bonuses
  // (mega project, prestige, research, worker, event, weather, etc.)
  const allProductionRates = store.productionSnapshot.production;

  // Consumption rates — actual consumption for net rate display, demand for input demand display
  const allActualConsumptionRates = store.productionSnapshot.actualConsumption;
  const allDemandRates = store.productionSnapshot.consumption;

  // Consumption rates for factories — aggregated from productionSnapshot
  const factoryConsumptionRates = useMemo(() => {
    const rates: Record<string, number> = {};
    factoryBuildings.forEach(b => {
      if (!b.active) return;
      const snap = store.productionSnapshot.buildings[b.id];
      if (!snap) return;
      snap.inputs.forEach(inp => {
        rates[inp.resource] = (rates[inp.resource] || 0) + inp.amount;
      });
    });
    return rates;
  }, [factoryBuildings, store.productionSnapshot.buildings]);

  // Aggregate rates by tier for flow diagram (includes all buildings for accurate tier 0/raw rates)
  const tierProductionSummary = useMemo(() => {
    const summary: Record<number, { production: number; consumption: number; resources: Set<string> }> = {
      0: { production: 0, consumption: 0, resources: new Set<string>() },
      1: { production: 0, consumption: 0, resources: new Set<string>() },
      2: { production: 0, consumption: 0, resources: new Set<string>() },
      3: { production: 0, consumption: 0, resources: new Set<string>() },
      4: { production: 0, consumption: 0, resources: new Set<string>() },
    };
    Object.entries(store.productionSnapshot.production).forEach(([res, rate]) => {
      const tier = getResourceTier(res as ResourceType);
      if (summary[tier]) {
        summary[tier].production += rate;
        summary[tier].resources.add(res);
      }
    });
    Object.entries(store.productionSnapshot.actualConsumption).forEach(([res, rate]) => {
      const tier = getResourceTier(res as ResourceType);
      if (summary[tier]) {
        summary[tier].consumption += rate;
        summary[tier].resources.add(res);
      }
    });
    return summary;
  }, [store.productionSnapshot.production, store.productionSnapshot.actualConsumption]);

  // Factory overview stats
  const totalFactories = factoryBuildings.length;
  const activeFactories = factoryBuildings.filter(b => b.active).length;
  const totalPowerConsumption = factoryBuildings
    .filter(b => b.active)
    .reduce((sum, b) => sum + BUILDING_DEFS[b.type].basePowerConsumption * b.level, 0);
  const avgEfficiency = activeFactories > 0
    ? factoryBuildings.filter(b => b.active).reduce((sum, b) => sum + b.efficiency, 0) / activeFactories
    : 0;

  // Current tier data
  const currentTierConfig = TIER_CONFIG[selectedTier as 1 | 2 | 3 | 4];
  const currentFactories = selectedTier === 1 ? TIER_1_FACTORIES : selectedTier === 2 ? TIER_2_FACTORIES : selectedTier === 3 ? TIER_3_FACTORIES : TIER_4_FACTORIES;
  const filteredFactories = useMemo(() => {
    if (!searchQuery.trim()) return currentFactories;
    const q = searchQuery.toLowerCase().trim();
    return currentFactories.filter(type => {
      const def = BUILDING_DEFS[type];
      if (!def) return false;
      return def.name.toLowerCase().includes(q);
    });
  }, [currentFactories, searchQuery]);
  const currentTierBuildings = factoriesByTier[selectedTier as 1 | 2 | 3 | 4] ?? [];
  const currentColorClasses = getTierColorClasses(currentTierConfig.color as TierColor);

  // Find which production chains a factory belongs to
  const getFactoryChains = useCallback((type: FactoryType) => {
    const def = BUILDING_DEFS[type];
    if (!def) return [];
    const allResources = [
      ...(def.inputs?.map(i => i.resource) ?? []),
      ...(def.outputs?.map(o => o.resource) ?? []),
    ];
    return PRODUCTION_CHAINS.filter(chain =>
      chain.steps.some(step => allResources.includes(step as ResourceType))
    );
  }, []);

  const handleBuild = useCallback((type: FactoryType) => {
    const prevCount = store.buildings.filter(b => b.type === type).length;
    store.buildBuilding(type);
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
        <PanelStatCard
          icon={<Factory className="w-4 h-4" />}
          label="Total Factories"
          value={totalFactories.toString()}
          subtext={`${activeFactories} running`}
          color="cyan"
        />
        <PanelStatCard
          icon={<Zap className="w-4 h-4" />}
          label="Power Draw"
          value={`${formatNumber(totalPowerConsumption)}`}
          subtext="MW consumed"
          color="yellow"
        />
        <PanelStatCard
          icon={<Gauge className="w-4 h-4" />}
          label="Avg Efficiency"
          value={`${(avgEfficiency * 100).toFixed(0)}%`}
          subtext={store.powerGrid.overload ? 'Grid overloaded!' : 'Nominal'}
          color={avgEfficiency >= 0.8 ? 'green' : avgEfficiency >= 0.5 ? 'orange' : 'red'}
        />
        <PanelStatCard
          icon={<Package className="w-4 h-4" />}
          label="Products"
          value={Object.keys(factoryProductionRates).length.toString()}
          subtext="resource types"
          color="purple"
        />
      </div>

      {/* PRODUCTION FLOW DIAGRAM - HERO SECTION */}
      <div className="game-card rounded-xl bg-card p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-cyan-400">Production Pipeline</h3>
          </div>
          <span className="text-[10px] text-gray-500">Click a tier node for details</span>
        </div>

        {/* SVG Flow Diagram */}
        <div className="relative bg-[#0a0e17] rounded-lg p-2 overflow-x-auto">
          <svg viewBox="0 0 1200 160" className="w-full h-auto min-w-[500px]" style={{ maxHeight: '180px' }}>
            {/* Background grid pattern */}
            <defs>
              <pattern id="flowGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="0.5" fill="#1e293b" />
              </pattern>
              {/* Animated particle gradients */}
              {FLOW_TIERS.map((tier, i) => (
                <linearGradient key={tier.key} id={`flowGrad${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={tier.color} stopOpacity="0.8" />
                  <stop offset="100%" stopColor={tier.color} stopOpacity="0.2" />
                </linearGradient>
              ))}
              {/* Particle animation */}
              {FLOW_TIERS.map((_, i) => (
                i < FLOW_TIERS.length - 1 ? (
                  <circle key={`particle${i}`} id={`flowParticle${i}`} r="3" fill={FLOW_TIERS[i + 1].color} opacity="0.8">
                    <animateMotion
                      dur="2s"
                      repeatCount="indefinite"
                      path={`M${150 + i * 220},80 L${195 + i * 220},80`}
                    />
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                ) : null
              ))}
            </defs>
            <rect width="1200" height="160" fill="url(#flowGrid)" />

            {/* Connection lines with animated flow */}
            {FLOW_TIERS.map((tier, i) => (
              i < FLOW_TIERS.length - 1 ? (
                <g key={`conn${i}`}>
                  {/* Main connection line */}
                  <line
                    x1={150 + i * 220}
                    y1={80}
                    x2={195 + i * 220}
                    y2={80}
                    stroke={FLOW_TIERS[i + 1].color}
                    strokeWidth="2"
                    strokeOpacity="0.3"
                    strokeDasharray="6 4"
                  />
                  {/* Animated flow overlay */}
                  <line
                    x1={150 + i * 220}
                    y1={80}
                    x2={195 + i * 220}
                    y2={80}
                    stroke={FLOW_TIERS[i + 1].color}
                    strokeWidth="2"
                    strokeOpacity="0.6"
                    strokeDasharray="6 4"
                  >
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.5s" repeatCount="indefinite" />
                  </line>
                  {/* Arrow head */}
                  <polygon
                    points={`${190 + i * 220},75 ${200 + i * 220},80 ${190 + i * 220},85`}
                    fill={FLOW_TIERS[i + 1].color}
                    fillOpacity="0.6"
                  />
                  {/* Rate label */}
                  <text
                    x={172 + i * 220}
                    y={68}
                    textAnchor="middle"
                    fill={FLOW_TIERS[i + 1].color}
                    fontSize="9"
                    fontFamily="monospace"
                    opacity="0.8"
                  >
                    {formatNumber((tierProductionSummary[i + 1]?.production ?? 0))}/s
                  </text>
                </g>
              ) : null
            ))}

            {/* Tier nodes */}
            {FLOW_TIERS.map((tier, i) => {
              const cx = 90 + i * 220;
              const summary = tierProductionSummary[i];
              const isSelected = selectedFlowNode === tier.key;
              const hasProduction = (summary?.production ?? 0) > 0 || (summary?.consumption ?? 0) > 0;

              return (
                <g
                  key={tier.key}
                  className="cursor-pointer"
                  onClick={() => setSelectedFlowNode(isSelected ? null : tier.key)}
                >
                  {/* Node background glow when active */}
                  {hasProduction && (
                    <circle
                      cx={cx}
                      cy={80}
                      r={isSelected ? 58 : 54}
                      fill={tier.color}
                      fillOpacity="0.08"
                    />
                  )}
                  {/* Node border */}
                  <rect
                    x={cx - 85}
                    y={20}
                    width={170}
                    height={120}
                    rx={12}
                    fill={isSelected ? `${tier.color}15` : '#0a0e17'}
                    stroke={tier.color}
                    strokeWidth={isSelected ? 2 : 1.5}
                    strokeOpacity={isSelected ? 0.7 : 0.35}
                  />
                  {/* Icon placeholder circle */}
                  <circle
                    cx={cx}
                    cy={50}
                    r={16}
                    fill={`${tier.color}20`}
                    stroke={tier.color}
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                  {/* Tier label */}
                  <text
                    x={cx}
                    y={55}
                    textAnchor="middle"
                    fill={tier.color}
                    fontSize="11"
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    dominantBaseline="middle"
                  >
                    {tier.key === 'raw' ? <GameIcon icon="gi:mining" size={14} className="inline-flex" /> : tier.key === 't1' ? <GameIcon icon="gi:anvil-impact" size={14} className="inline-flex" /> : tier.key === 't2' ? <GameIcon icon="gi:big-gear" size={14} className="inline-flex" /> : tier.key === 't3' ? <GameIcon icon="gi:sparkles" size={14} className="inline-flex" /> : <GameIcon icon="gi:vortex" size={14} className="inline-flex" />}
                  </text>
                  {/* Tier name */}
                  <text
                    x={cx}
                    y={82}
                    textAnchor="middle"
                    fill={tier.color}
                    fontSize="10"
                    fontFamily="sans-serif"
                    fontWeight="600"
                  >
                    {tier.label}
                  </text>
                  {/* Production rate */}
                  <text
                    x={cx}
                    y={98}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize="9"
                    fontFamily="monospace"
                  >
                    {formatNumber((summary?.production ?? 0))}/s
                  </text>
                  {/* Resource count */}
                  <text
                    x={cx}
                    y={112}
                    textAnchor="middle"
                    fill="#6b7280"
                    fontSize="8"
                    fontFamily="monospace"
                  >
                    {summary?.resources.size ?? 0} resources
                  </text>
                  {/* Active indicator dot */}
                  {hasProduction && (
                    <circle cx={cx + 75} cy={28} r={4} fill="#22c55e">
                      <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected flow node detail panel */}
        {selectedFlowNode && (() => {
            const tierIdx = FLOW_TIERS.findIndex(t => t.key === selectedFlowNode);
            const tierInfo = FLOW_TIERS[tierIdx];
            const tierNum = tierIdx; // 0=raw, 1=T1, 2=T2, 3=T3
            const relevantResources = Object.entries(allProductionRates)
              .concat(Object.entries(allDemandRates).filter(([k]) => !allProductionRates[k]))
              .filter(([res]) => getResourceTier(res as ResourceType) === tierNum)
              .reduce<Record<string, { prod: number; cons: number }>>((acc, [res, rate]) => {
                if (!acc[res]) acc[res] = { prod: 0, cons: 0 };
                if (allProductionRates[res]) acc[res].prod = allProductionRates[res];
                if (allActualConsumptionRates[res]) acc[res].cons = allActualConsumptionRates[res];
                return acc;
              }, {});

            return (
              <div
                className="overflow-hidden"
              >
                <div className="mt-3 bg-[#0a0e17] rounded-lg p-3 border" style={{ borderColor: `${tierInfo.color}33` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tierInfo.color }} />
                      <span className="text-xs font-medium" style={{ color: tierInfo.color }}>{tierInfo.label} Details</span>
                    </div>
                    <button onClick={() => setSelectedFlowNode(null)} className="text-gray-500 hover:text-gray-300 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {Object.keys(relevantResources).length === 0 ? (
                    <p className="text-[10px] text-gray-500 py-2">No production in this tier yet</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(relevantResources).map(([res, { prod, cons }]) => {
                        const meta = RESOURCE_META[res as ResourceType];
                        const net = prod - cons;
                        return (
                          <div key={res} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${meta.color}22`, backgroundColor: `${meta.color}08` }}>
                            <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                            <div className="min-w-0">
                              <div className="text-[10px] text-gray-300 font-medium truncate">{meta.name}</div>
                              <div className={`text-[9px] font-mono ${net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : prod > 0 && cons > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>
                                {net > 0 ? `+${formatNumber(net)}/s` : net < 0 ? `${formatNumber(net)}/s` : prod > 0 && cons > 0 ? '±0/s' : '—'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
      </div>

      {/* MAIN CONTENT: Factory Grid + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Factory Grid with Tab-based Tier Selector */}
        <div className="lg:col-span-2 space-y-3">
          {/* TIER TAB SELECTOR */}
          <div className="flex items-center gap-1 p-1 bg-card rounded-xl border border-border">
            {([1, 2, 3, 4] as const).map(tier => {
              const config = TIER_CONFIG[tier];
              const colors = getTierColorClasses(config.color as TierColor);
              const tierBuildings = factoriesByTier[tier];
              const isActive = selectedTier === tier;

              return (
                <button
                  key={tier}
                  onClick={() => setSelectedTier(tier)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-semibold ${
                    isActive
                      ? colors.tabActive
                      : `border-transparent text-gray-500 ${colors.tabHover}`
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isActive ? colors.bg : 'bg-gray-800/50'}`}>
                    <GameIcon icon={config.icon} size={16} />
                  </div>
                  <span className="hidden sm:inline">{config.label}</span>
                  <span className="sm:hidden">{config.shortLabel}</span>
                  <span className={`text-[9px] font-mono ${isActive ? '' : 'text-gray-600'}`}>
                    ({tierBuildings.filter(b => b.active).length}/{tierBuildings.length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* FACTORY BUILD CARDS for selected tier */}
          <div key={selectedTier}>
              <div className="game-card rounded-xl bg-card p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg ${currentColorClasses.bg} flex items-center justify-center ${currentColorClasses.text}`}>
                      <GameIcon icon={currentTierConfig.icon} size={16} />
                    </div>
                    <h3 className={`text-sm font-semibold ${currentColorClasses.text}`}>{currentTierConfig.label}</h3>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {currentTierBuildings.filter(b => b.active).length}/{currentTierBuildings.length} active
                  </span>
                </div>

                {/* Search input */}
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search factories..."
                    className="w-full h-8 pl-8 pr-8 text-xs bg-[#0a0e17] border border-cyan-900/30 rounded-lg text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-700/50 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Compact Factory Build Grid */}
                {filteredFactories.length === 0 ? (
                  <div className="text-center py-6">
                    <Search className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">No factories match your search</p>
                  </div>
                ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-4">
                  {filteredFactories.map(type => {
                    const def = BUILDING_DEFS[type];
                    if (!def) return null;
                    const existingCount = store.buildings.filter(b => b.type === type).length;
                    const cost = getBuildingCost(type, existingCount);
                    const canAfford = store.money >= cost;
                    const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);
                    const chains = getFactoryChains(type);

                    return (
                      <GameItemTooltip
                        key={type}
                        name={def.name}
                        icon={def.icon}
                        description={def.description}
                        category="Factory"
                        tier={def.tier}
                        details={[
                          ...(def.inputs?.map(inp => ({ label: `Input: ${RESOURCE_META[inp.resource].name}`, value: `${(inp.amount).toFixed(1)}/s`, color: 'text-red-400' })) ?? []),
                          ...(def.outputs?.map(o => ({ label: `Output: ${RESOURCE_META[o.resource].name}`, value: `${(o.amount * def.baseProductionRate).toFixed(1)}/s`, color: 'text-green-400' })) ?? []),
                          { label: 'Power Consumption', value: `${def.basePowerConsumption} MW`, color: 'text-yellow-400' },
                          { label: 'Build Cost', value: `$${formatNumber(cost)}`, color: canAfford ? 'text-green-400' : 'text-red-400' },
                          { label: 'Cost Multiplier', value: `x${def.costMultiplier}` },
                        ]}
                        requirements={[
                          ...(def.unlockRequirement?.research ? [{ label: 'Research', value: RESEARCH_TREE.find(r => r.id === def.unlockRequirement!.research)?.name ?? def.unlockRequirement.research, color: store.completedResearch.includes(def.unlockRequirement.research) ? 'text-green-400' : 'text-red-400' }] : []),
                        ]}
                        side="bottom"
                      >
                      <div
                        className={`relative rounded-lg p-3 border bg-[#0a0e17] ${
                          !unlocked
                            ? 'border-gray-800 opacity-60'
                            : canAfford
                              ? `${currentColorClasses.hoverBorder} ${currentColorClasses.glow}`
                              : 'border-gray-800'
                        }`}
                      >
                        {!unlocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg z-10">
                            <Lock className="w-4 h-4 text-gray-600" />
                          </div>
                        )}
                        {/* Header: emoji + name + chain badge */}
                        <div className="flex items-start gap-2 mb-1.5">
                          <GameIcon icon={def.icon} size={20} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-gray-200 font-medium leading-tight truncate">{def.name}</p>
                            {/* Chain pipeline badge */}
                            {chains.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-0.5">
                                {chains.slice(0, 2).map(chain => (
                                  <span key={chain.name} className="text-[7px] px-1 py-0 rounded-full border" style={{ borderColor: `${chain.color}40`, color: chain.color, backgroundColor: `${chain.color}10` }}>
                                    {chain.name}
                                  </span>
                                ))}
                                {chains.length > 2 && (
                                  <span className="text-[7px] text-gray-500">+{chains.length - 2}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Inline I/O flow */}
                        <div className="mb-2">
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {def.inputs?.map((inp, i) => (
                              <span key={i} className="text-[8px] text-red-300/80 bg-red-900/20 rounded px-1 py-px">
                                <GameIcon icon={RESOURCE_META[inp.resource].icon} size={10} className="inline-flex" />{inp.amount}
                              </span>
                            ))}
                            {def.inputs && def.inputs.length > 0 && (
                              <ArrowRight className="w-2 h-2 text-gray-600 flex-shrink-0" />
                            )}
                            {def.outputs?.map((out, i) => (
                              <span key={i} className="text-[8px] text-green-300/80 bg-green-900/20 rounded px-1 py-px">
                                <GameIcon icon={RESOURCE_META[out.resource].icon} size={10} className="inline-flex" />{out.amount}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Cost + Power */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-mono font-bold ${canAfford ? 'text-green-400' : 'text-red-400'}`}>
                            ${formatNumber(cost)}
                          </span>
                          <span className="flex items-center gap-0.5 text-[9px] text-gray-500">
                            <Zap className="w-2.5 h-2.5 text-yellow-500" />
                            {def.basePowerConsumption}MW
                          </span>
                        </div>

                        {/* Build button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className={`w-full h-6 text-[9px] ${
                            !unlocked ? 'hidden' :
                            canAfford
                              ? `${currentColorClasses.buttonBorder} ${currentColorClasses.buttonText} ${currentColorClasses.buttonHover}`
                              : 'border-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                          onClick={() => handleBuild(type)}
                          disabled={!canAfford || !unlocked}
                        >
                          <Hammer className="w-2.5 h-2.5 mr-1" />
                          Build
                        </Button>

                        {existingCount > 0 && (
                          <div className="mt-1 text-center">
                            <span className="text-[8px] text-gray-500">
                              {store.buildings.filter(b => b.type === type && b.active).length}/{existingCount} active
                            </span>
                          </div>
                        )}
                      </div>
                      </GameItemTooltip>
                    );
                  })}
                </div>
                )}

                {/* ACTIVE FACTORIES for this Tier - compact list */}
                {currentTierBuildings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className={`w-3.5 h-3.5 ${currentColorClasses.text}`} />
                      <h3 className={`text-xs font-semibold ${currentColorClasses.text}`}>Active Factories</h3>
                      <span className="text-[9px] text-gray-500">({currentTierBuildings.length})</span>
                    </div>
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto game-scrollbar pr-1">
                      {currentTierBuildings.map(building => {
                        const def = BUILDING_DEFS[building.type];
                        if (!def) return null;
                        const upgradeCost = getBuildingCost(building.type, building.level);
                        const canUpgrade = store.money >= upgradeCost;
                        const buildingSnap = store.productionSnapshot.buildings[building.id];
                        const effectiveOutputs = buildingSnap
                          ? buildingSnap.outputs.map(o => ({
                              resource: o.resource,
                              rate: o.amount,
                              meta: RESOURCE_META[o.resource],
                            }))
                          : (def.outputs ?? []).map(o => ({
                              resource: o.resource,
                              rate: 0,
                              meta: RESOURCE_META[o.resource],
                            }));
                        const effectiveInputs = buildingSnap
                          ? buildingSnap.inputs.map(inp => ({
                              resource: inp.resource,
                              rate: inp.amount,
                              meta: RESOURCE_META[inp.resource],
                              hasEnough: store.resources[inp.resource] >= inp.amount,
                            }))
                          : (def.inputs ?? []).map(inp => ({
                              resource: inp.resource,
                              rate: 0,
                              meta: RESOURCE_META[inp.resource],
                              hasEnough: true,
                            }));
                        const eff = buildingSnap?.efficiency ?? 0;

                        return (
                          <div
                            key={building.id}
                            className={`rounded-lg bg-[#0a0e17] p-2.5 border ${
                              building.active
                                ? `${currentColorClasses.border}`
                                : 'border-gray-800 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {/* Toggle + Emoji */}
                              <button
                                onClick={() => handleToggle(building.id)}
                                className={`text-base hover:scale-110 flex-shrink-0 ${
                                  building.active ? 'opacity-100' : 'grayscale opacity-50'
                                }`}
                                title={building.active ? 'Click to disable' : 'Click to enable'}
                              >
                                <GameIcon icon={def.icon} size={16} />
                              </button>

                              {/* Name + Level + Status */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-[11px] text-gray-200 font-medium">{def.name}</span>
                                  <Badge variant="outline" className={`text-[8px] ${currentColorClasses.badge} ${currentColorClasses.text} px-1 py-0`}>
                                    Lv.{building.level}
                                  </Badge>
                                  {!building.active && (
                                    <Badge variant="outline" className="text-[8px] border-gray-600 text-gray-500 px-1 py-0">
                                      OFF
                                    </Badge>
                                  )}
                                </div>

                                {/* Inline I/O flow */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {effectiveInputs.map(({ resource: _r, rate, meta, hasEnough }, i) => (
                                    <div key={i} className={`flex items-center gap-0.5 rounded px-1 py-px ${
                                      hasEnough ? 'bg-red-900/15' : 'bg-red-900/30 border border-red-800/50'
                                    }`}>
                                      <GameIcon icon={meta.icon} size={12} className="inline-flex" />
                                      <span className={`text-[8px] font-mono ${building.active ? (hasEnough ? 'text-red-300/80' : 'text-red-400') : 'text-gray-500'}`}>
                                        -{formatNumber(rate)}
                                      </span>
                                    </div>
                                  ))}
                                  {effectiveInputs.length > 0 && (
                                    <ArrowRight className="w-2.5 h-2.5 text-gray-600 flex-shrink-0" />
                                  )}
                                  {effectiveOutputs.map(({ resource: _r, rate, meta }, i) => (
                                    <div key={i} className="flex items-center gap-0.5 bg-green-900/15 rounded px-1 py-px">
                                      <GameIcon icon={meta.icon} size={12} className="inline-flex" />
                                      <span className={`text-[8px] font-mono ${building.active ? 'text-green-400' : 'text-gray-500'}`}>
                                        +{formatNumber(rate)}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* Efficiency bar - compact inline */}
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[8px] text-gray-500">Eff</span>
                                  <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        eff >= 0.8 ? 'bg-gradient-to-r from-green-600 to-green-400' :
                                        eff >= 0.5 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                                        'bg-gradient-to-r from-red-600 to-red-400'
                                      }`}
                                      style={{ width: `${eff * 100}%` }}
                                    />
                                  </div>
                                  <span className={`text-[8px] font-mono ${
                                    eff >= 0.8 ? 'text-green-400' : eff >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                                  }`}>
                                    {(eff * 100).toFixed(0)}%
                                  </span>
                                </div>
                              </div>

                              {/* Upgrade + Toggle - compact */}
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleToggle(building.id)}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                                    building.active
                                      ? 'border-green-500/50 bg-green-900/20 text-green-400'
                                      : 'border-gray-700 bg-gray-800 text-gray-500'
                                  }`}
                                >
                                  {building.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                                </button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`h-5 text-[8px] px-1.5 ${
                                    canUpgrade
                                      ? 'border-cyan-700/50 text-cyan-400 hover:bg-cyan-900/30'
                                      : 'border-gray-700 text-gray-500'
                                  }`}
                                  onClick={() => handleUpgrade(building.id)}
                                  disabled={!canUpgrade}
                                >
                                  <ChevronUp className="w-2.5 h-2.5" />
                                </Button>
                                <span className={`text-[7px] font-mono ${canUpgrade ? 'text-gray-400' : 'text-red-400'}`}>
                                  ${formatNumber(upgradeCost)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state when no factories built for this tier */}
                {currentTierBuildings.length === 0 && (
                  <div className="game-card-empty rounded-xl p-6 text-center">
                    <div className="text-4xl mb-3">
                      {selectedTier === 1 ? <GameIcon icon="gi:anvil-impact" size={14} className="inline-flex" /> : selectedTier === 2 ? <GameIcon icon="gi:big-gear" size={14} className="inline-flex" /> : selectedTier === 3 ? <GameIcon icon="gi:sparkles" size={14} className="inline-flex" /> : <GameIcon icon="gi:vortex" size={14} className="inline-flex" />}
                    </div>
                    <h3 className="text-base font-bold text-cyan-400 mb-2">No {currentTierConfig.label} Factories</h3>
                    <p className="text-sm text-gray-400 mb-1">Build your first factory to start processing materials</p>
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* RIGHT: Production Chains & Stats */}
        <div className="space-y-4">
          {/* PRODUCTION CHAIN VISUALIZATION */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
                  className={`text-[9px] px-2 py-1 rounded-md border ${
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
                    const production = allProductionRates[resource] || 0;
                    const consumption = allActualConsumptionRates[resource] || 0;
                    const net = production - consumption;
                    const stock = store.resources[resource as ResourceType];
                    const capacity = store.resourceCapacity[resource as ResourceType];
                    const fillPct = capacity > 0 ? (stock / capacity) * 100 : 0;

                    return (
                      <div key={resource}>
                        <div className="flex items-center gap-2">
                          {/* Step node */}
                          <div
                            className="flex items-center gap-2 flex-1 rounded-lg p-2 border"
                            style={{
                              borderColor: `${meta.color}33`,
                              backgroundColor: `${meta.color}0a`,
                            }}
                          >
                            <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] text-gray-200 font-medium">{meta.name}</span>
                                <span className={`text-[9px] font-mono ${
                                  net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : production > 0 && consumption > 0 ? 'text-cyan-400' : 'text-gray-600'
                                }`}>
                                  {net > 0 ? `+${formatNumber(net)}/s` : net < 0 ? `${formatNumber(net)}/s` : production > 0 && consumption > 0 ? '±0/s' : '—'}
                                </span>
                              </div>
                              {/* Stock bar */}
                              <div className="h-1 bg-gray-800 rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: meta.color, width: `${Math.min(100, fillPct)}%` }}
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
                              <div>
                                <ArrowRight
                                  className="w-3.5 h-3.5 rotate-90"
                                  style={{ color: PRODUCTION_CHAINS[selectedChain].color }}
                                />
                              </div>
                              {/* Neon flow line */}
                              <div className="w-px h-2 relative overflow-hidden">
                                <div
                                  className="w-full h-full"
                                  style={{ backgroundColor: PRODUCTION_CHAINS[selectedChain].color }}
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Top Production</h3>
              </div>
              <span className="text-[10px] text-gray-500">per second</span>
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
                          <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                          <span className="text-xs text-gray-300">{meta.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowUpFromLine className="w-3 h-3 text-green-400" />
                          <span className="text-xs text-green-400 font-mono font-bold">+{formatNumber(rate)}</span>
                          <span className="text-[10px] text-gray-500">/s</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* INPUT REQUIREMENTS */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-red-400" />
                <h3 className="text-sm font-semibold text-red-400">Input Demand</h3>
              </div>
              <span className="text-[10px] text-gray-500">per second</span>
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
                    const production = allProductionRates[resource] || 0;
                    const actualCons = allActualConsumptionRates[resource] || 0;
                    const net = production - actualCons;
                    const stock = store.resources[resource];
                    return (
                      <div key={resource} className="bg-[#0a0e17] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                            <span className="text-xs text-gray-300">{meta.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <ArrowDownToLine className="w-3 h-3 text-red-400" />
                            <span className="text-[10px] text-red-400 font-mono">-{formatNumber(rate)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-gray-500">Stock: {formatNumber(stock)}</span>
                          <span className={`text-[9px] font-mono ${net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : production > 0 && rate > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>
                            {net > 0 ? `+${formatNumber(net)}/s` : net < 0 ? `${formatNumber(net)}/s` : production > 0 && rate > 0 ? '±0/s' : '—'} net
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

function OverviewRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs font-mono font-medium ${color}`}>{value}</span>
    </div>
  );
}
