'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked, hasUnlimitedStorage } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Pickaxe, ChevronUp, Power, PowerOff, Hammer, ArrowRight,
  Package, TrendingUp, Zap, Clock, Lock, Layers, Droplets,
  Mountain, Drill, Container, Warehouse, ArrowDownToLine,
  ArrowUpFromLine, Workflow, Gauge, X,
} from 'lucide-react';
import { ResourceType, ExtractorType } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXTRACTOR_TYPES: ExtractorType[] = ['miningDrill', 'oilPump', 'waterExtractor', 'quarry', 'clayPit', 'limestoneQuarry', 'gravelPit', 'bauxiteMine', 'wolframiteMine', 'rareEarthExtractor'];
const RAW_RESOURCES: ResourceType[] = ['iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water', 'rareEarth', 'clay', 'limestone', 'gravel', 'bauxite', 'wolframite'];

const BASIC_EXTRACTORS: ExtractorType[] = ['miningDrill', 'oilPump', 'waterExtractor', 'quarry'];
const ADVANCED_EXTRACTORS: ExtractorType[] = ['clayPit', 'limestoneQuarry', 'gravelPit', 'bauxiteMine', 'wolframiteMine', 'rareEarthExtractor'];

// Tab config for the tier selector
const TAB_CONFIG = {
  basic: { label: 'Basic Mining', shortLabel: 'Basic', color: 'amber' as const, icon: <Pickaxe className="w-4 h-4" />, emoji: '⛏️' },
  advanced: { label: 'Advanced Mining', shortLabel: 'Advanced', color: 'orange' as const, icon: <Mountain className="w-4 h-4" />, emoji: '🏔️' },
};

type TabKey = 'basic' | 'advanced';
type TabColor = 'amber' | 'orange';

type TabColorClasses = {
  text: string;
  border: string;
  bg: string;
  hoverBorder: string;
  glow: string;
  buttonBorder: string;
  buttonText: string;
  buttonHover: string;
  badge: string;
  tabActive: string;
  tabHover: string;
};

function getTabColorClasses(color: TabColor): TabColorClasses {
  const map: Record<TabColor, TabColorClasses> = {
    amber: {
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      bg: 'bg-amber-900/20',
      hoverBorder: 'hover:border-amber-500/50',
      glow: 'hover:shadow-[0_0_15px_rgba(245,158,11,0.1)]',
      buttonBorder: 'border-amber-700/50',
      buttonText: 'text-amber-400',
      buttonHover: 'hover:bg-amber-900/30 hover:border-amber-500',
      badge: 'border-amber-600/50',
      tabActive: 'border-amber-500/60 bg-amber-900/25 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.15)]',
      tabHover: 'hover:border-amber-700/50 hover:text-amber-300',
    },
    orange: {
      text: 'text-orange-400',
      border: 'border-orange-500/30',
      bg: 'bg-orange-900/20',
      hoverBorder: 'hover:border-orange-500/50',
      glow: 'hover:shadow-[0_0_15px_rgba(249,115,22,0.1)]',
      buttonBorder: 'border-orange-700/50',
      buttonText: 'text-orange-400',
      buttonHover: 'hover:bg-orange-900/30 hover:border-orange-500',
      badge: 'border-orange-600/50',
      tabActive: 'border-orange-500/60 bg-orange-900/25 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.15)]',
      tabHover: 'hover:border-orange-700/50 hover:text-orange-300',
    },
  };
  return map[color];
}

// Extraction pipeline tiers for SVG flow diagram
const EXTRACTION_TIERS = [
  { key: 'basic', label: 'Basic Mining', emoji: '⛏️', color: '#f59e0b' },
  { key: 'advanced', label: 'Advanced Mining', emoji: '🏔️', color: '#f97316' },
  { key: 'specialized', label: 'Specialized', emoji: '💎', color: '#a855f7' },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Main Component ───────────────────────────────────────────────────────────

export function ResourcePanel() {
  const store = useGameStore();
  const [selectedTab, setSelectedTab] = useState<TabKey>('basic');
  const [selectedFlowNode, setSelectedFlowNode] = useState<string | null>(null);

  // Track recently built/upgraded buildings for CSS animation classes
  const [recentlyBuilt, setRecentlyBuilt] = useState<Set<string>>(new Set());
  const [recentlyUpgraded, setRecentlyUpgraded] = useState<Set<string>>(new Set());

  // ─── Computed data ──────────────────────────────────────────────────────

  // Extractor buildings from store
  const extractorBuildings = useMemo(() =>
    store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor'),
    [store.buildings]
  );

  // Extractors grouped by tab
  const extractorsByTab = useMemo(() => ({
    basic: extractorBuildings.filter(b => BASIC_EXTRACTORS.includes(b.type as ExtractorType)),
    advanced: extractorBuildings.filter(b => ADVANCED_EXTRACTORS.includes(b.type as ExtractorType)),
  }), [extractorBuildings]);

  // Extractor instances grouped by type
  const extractorsByType = useMemo(() => {
    const grouped: Record<string, typeof store.buildings> = {};
    EXTRACTOR_TYPES.forEach(type => {
      grouped[type] = store.buildings.filter(b => b.type === type);
    });
    return grouped;
  }, [store.buildings]);

  // Production rates per resource — use store's computed rates which include all bonuses
  // (mega project, prestige, research, worker, event, weather, etc.)
  // Only include extractor-produced resources for the Raw Materials panel
  const productionRates = useMemo(() => {
    const extractorResources = new Set<string>();
    store.buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def || def.category !== 'extractor' || !def.outputs) return;
      def.outputs.forEach(o => extractorResources.add(o.resource));
    });
    const rates: Record<string, number> = {};
    Object.entries(store.computedProductionRates).forEach(([res, rate]) => {
      if (extractorResources.has(res)) {
        rates[res] = rate;
      }
    });
    return rates;
  }, [store.buildings, store.computedProductionRates]);

  // Consumption rates — use store's computed rates which include all bonuses
  const consumptionRates = store.computedConsumptionRates;

  // Resource flow data
  const unlimited = useMemo(() => hasUnlimitedStorage(store.megaProjects), [store.megaProjects]);
  const resourceFlow = useMemo(() => {
    return RAW_RESOURCES.map(r => {
      const rate = productionRates[r] || 0;
      const amount = store.resources[r];
      const capacity = unlimited ? Infinity : store.resourceCapacity[r];
      const meta = RESOURCE_META[r];
      return { resource: r, rate, amount, capacity, meta };
    }).filter(r => r.rate > 0 || r.amount > 0);
  }, [productionRates, store.resources, store.resourceCapacity, unlimited]);

  // Extraction tier production summary for SVG flow — uses store computed rates
  const tierProductionSummary = useMemo(() => {
    const summary: Record<string, { production: number; resources: Set<string> }> = {
      basic: { production: 0, resources: new Set<string>() },
      advanced: { production: 0, resources: new Set<string>() },
      specialized: { production: 0, resources: new Set<string>() },
    };
    // Basic extractors produce basic tier resources
    extractorBuildings.filter(b => b.active && BASIC_EXTRACTORS.includes(b.type as ExtractorType)).forEach(b => {
      const def = BUILDING_DEFS[b.type];
      if (!def?.outputs) return;
      def.outputs.forEach(o => {
        const rate = store.computedProductionRates[o.resource] ?? 0;
        if (rate > 0) {
          summary.basic.production += rate;
          summary.basic.resources.add(o.resource);
        }
      });
    });
    // Advanced extractors
    extractorBuildings.filter(b => b.active && ADVANCED_EXTRACTORS.includes(b.type as ExtractorType)).forEach(b => {
      const def = BUILDING_DEFS[b.type];
      if (!def?.outputs) return;
      def.outputs.forEach(o => {
        const rate = store.computedProductionRates[o.resource] ?? 0;
        if (rate > 0) {
          summary.advanced.production += rate;
          summary.advanced.resources.add(o.resource);
          // Advanced resources also count as specialized
          summary.specialized.production += rate * 0.3;
          summary.specialized.resources.add(o.resource);
        }
      });
    });
    return summary;
  }, [extractorBuildings, store.computedProductionRates]);

  // ─── Overview stats ─────────────────────────────────────────────────────

  const totalExtractors = extractorBuildings.length;
  const activeExtractors = extractorBuildings.filter(b => b.active).length;
  const totalPowerConsumption = extractorBuildings
    .filter(b => b.active)
    .reduce((sum, b) => sum + BUILDING_DEFS[b.type].basePowerConsumption * b.level, 0);
  const avgEfficiency = activeExtractors > 0
    ? extractorBuildings.filter(b => b.active).reduce((sum, b) => sum + b.efficiency, 0) / activeExtractors
    : 0;
  const rawMaterialTypes = Object.keys(productionRates).filter(r => RAW_RESOURCES.includes(r as ResourceType)).length;

  // Current tab data
  const currentTabConfig = TAB_CONFIG[selectedTab];
  const currentExtractors = selectedTab === 'basic' ? BASIC_EXTRACTORS : ADVANCED_EXTRACTORS;
  const currentTabBuildings = extractorsByTab[selectedTab];
  const currentColorClasses = getTabColorClasses(currentTabConfig.color);

  // ─── Callbacks ──────────────────────────────────────────────────────────

  const handleBuild = useCallback((type: ExtractorType) => {
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

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-amber-400 neon-glow-amber tracking-wide flex items-center gap-2">
            <Pickaxe className="w-5 h-5" />
            Resource Extraction
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Mine, pump, and extract raw materials from the earth</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-amber-500/50 text-amber-400 bg-amber-900/20 text-xs">
            <Pickaxe className="w-3 h-3 mr-1" />
            {activeExtractors}/{totalExtractors} Active
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
          icon={<Pickaxe className="w-4 h-4" />}
          label="Total Extractors"
          value={totalExtractors.toString()}
          subtext={`${activeExtractors} running`}
          color="amber"
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
          label="Raw Materials"
          value={rawMaterialTypes.toString()}
          subtext="resource types"
          color="purple"
        />
      </div>

      {/* EXTRACTION PIPELINE - HERO SECTION */}
      <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-400">Extraction Pipeline</h3>
          </div>
          <span className="text-[10px] text-gray-500">Click a tier node for details</span>
        </div>

        {/* SVG Flow Diagram */}
        <div className="relative bg-[#0a0e17] rounded-lg p-2 overflow-x-auto">
          <svg viewBox="0 0 1200 160" className="w-full h-auto min-w-[500px]" style={{ maxHeight: '180px' }}>
            {/* Background grid pattern */}
            <defs>
              <pattern id="extFlowGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="0.5" fill="#1e293b" />
              </pattern>
              {/* Animated particle gradients */}
              {EXTRACTION_TIERS.map((tier, i) => (
                <linearGradient key={tier.key} id={`extGrad${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={tier.color} stopOpacity="0.8" />
                  <stop offset="100%" stopColor={tier.color} stopOpacity="0.2" />
                </linearGradient>
              ))}
              {/* Particle animation */}
              {EXTRACTION_TIERS.map((_, i) => (
                i < EXTRACTION_TIERS.length - 1 ? (
                  <circle key={`extParticle${i}`} id={`extFlowParticle${i}`} r="3" fill={EXTRACTION_TIERS[i + 1].color} opacity="0.8">
                    <animateMotion
                      dur="2.5s"
                      repeatCount="indefinite"
                      path={`M${270 + i * 350},80 L${340 + i * 350},80`}
                    />
                    <animate attributeName="opacity" values="0.3;1;0.3" dur="2.5s" repeatCount="indefinite" />
                  </circle>
                ) : null
              ))}
            </defs>
            <rect width="1200" height="160" fill="url(#extFlowGrid)" />

            {/* Connection lines with animated flow */}
            {EXTRACTION_TIERS.map((tier, i) => (
              i < EXTRACTION_TIERS.length - 1 ? (
                <g key={`extConn${i}`}>
                  {/* Main connection line */}
                  <line
                    x1={270 + i * 350}
                    y1={80}
                    x2={340 + i * 350}
                    y2={80}
                    stroke={EXTRACTION_TIERS[i + 1].color}
                    strokeWidth="2"
                    strokeOpacity="0.3"
                    strokeDasharray="6 4"
                  />
                  {/* Animated flow overlay */}
                  <line
                    x1={270 + i * 350}
                    y1={80}
                    x2={340 + i * 350}
                    y2={80}
                    stroke={EXTRACTION_TIERS[i + 1].color}
                    strokeWidth="2"
                    strokeOpacity="0.6"
                    strokeDasharray="6 4"
                  >
                    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="1.5s" repeatCount="indefinite" />
                  </line>
                  {/* Arrow head */}
                  <polygon
                    points={`${335 + i * 350},75 ${345 + i * 350},80 ${335 + i * 350},85`}
                    fill={EXTRACTION_TIERS[i + 1].color}
                    fillOpacity="0.6"
                  />
                  {/* Rate label */}
                  <text
                    x={305 + i * 350}
                    y={68}
                    textAnchor="middle"
                    fill={EXTRACTION_TIERS[i + 1].color}
                    fontSize="9"
                    fontFamily="monospace"
                    opacity="0.8"
                  >
                    {formatNumber(tierProductionSummary[EXTRACTION_TIERS[i + 1].key]?.production ?? 0)}/t
                  </text>
                </g>
              ) : null
            ))}

            {/* Tier nodes */}
            {EXTRACTION_TIERS.map((tier, i) => {
              const cx = 170 + i * 350;
              const summary = tierProductionSummary[tier.key];
              const isSelected = selectedFlowNode === tier.key;
              const hasProduction = (summary?.production ?? 0) > 0;

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
                    >
                      <animate attributeName="r" values={isSelected ? "56;60;56" : "52;56;52"} dur="3s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Node border */}
                  <rect
                    x={cx - 115}
                    y={20}
                    width={230}
                    height={120}
                    rx={12}
                    fill={isSelected ? `${tier.color}15` : '#0a0e17'}
                    stroke={tier.color}
                    strokeWidth={isSelected ? 2 : 1.5}
                    strokeOpacity={isSelected ? 0.7 : 0.35}
                  />
                  {/* Icon circle */}
                  <circle
                    cx={cx}
                    cy={50}
                    r={16}
                    fill={`${tier.color}20`}
                    stroke={tier.color}
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                  {/* Tier emoji */}
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
                    {tier.emoji}
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
                    {formatNumber(summary?.production ?? 0)}/t
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
                    <circle cx={cx + 105} cy={28} r={4} fill="#22c55e">
                      <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected flow node detail panel */}
        <AnimatePresence>
          {selectedFlowNode && (() => {
            const tierIdx = EXTRACTION_TIERS.findIndex(t => t.key === selectedFlowNode);
            const tierInfo = EXTRACTION_TIERS[tierIdx];
            const tierExtractors = tierIdx === 0 ? BASIC_EXTRACTORS : ADVANCED_EXTRACTORS;
            const relevantResources: Record<string, { prod: number; cons: number }> = {};
            tierExtractors.forEach(type => {
              const def = BUILDING_DEFS[type];
              if (!def?.outputs) return;
              def.outputs.forEach(o => {
                if (!relevantResources[o.resource]) relevantResources[o.resource] = { prod: 0, cons: 0 };
                relevantResources[o.resource].prod = productionRates[o.resource] || 0;
                relevantResources[o.resource].cons = consumptionRates[o.resource] || 0;
              });
            });

            return (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
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
                    <p className="text-[10px] text-gray-500 py-2">No extraction in this tier yet</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(relevantResources).map(([res, { prod, cons }]) => {
                        const meta = RESOURCE_META[res as ResourceType];
                        const net = prod - cons;
                        return (
                          <div key={res} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${meta.color}22`, backgroundColor: `${meta.color}08` }}>
                            <span className="text-sm">{meta.emoji}</span>
                            <div className="min-w-0">
                              <div className="text-[10px] text-gray-300 font-medium truncate">{meta.name}</div>
                              <div className={`text-[9px] font-mono ${net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                {net > 0 ? `+${formatNumber(net)}/t` : net < 0 ? `${formatNumber(net)}/t` : '—'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </div>

      {/* MAIN CONTENT: Extractor Grid + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Extractor Grid with Tab Selector */}
        <div className="lg:col-span-2 space-y-3">
          {/* TAB SELECTOR */}
          <div className="flex items-center gap-1 p-1 bg-[#111827] rounded-xl border border-[#1e293b]">
            {(['basic', 'advanced'] as const).map(tab => {
              const config = TAB_CONFIG[tab];
              const colors = getTabColorClasses(config.color);
              const tabBuildings = extractorsByTab[tab];
              const isActive = selectedTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border transition-all text-xs font-semibold ${
                    isActive
                      ? colors.tabActive
                      : `border-transparent text-gray-500 ${colors.tabHover}`
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isActive ? colors.bg : 'bg-gray-800/50'}`}>
                    {config.icon}
                  </div>
                  <span className="hidden sm:inline">{config.label}</span>
                  <span className="sm:hidden">{config.shortLabel}</span>
                  <span className={`text-[9px] font-mono ${isActive ? '' : 'text-gray-600'}`}>
                    ({tabBuildings.filter(b => b.active).length}/{tabBuildings.length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* EXTRACTOR BUILD CARDS for selected tab */}
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg ${currentColorClasses.bg} flex items-center justify-center ${currentColorClasses.text}`}>
                      {currentTabConfig.icon}
                    </div>
                    <h3 className={`text-sm font-semibold ${currentColorClasses.text}`}>{currentTabConfig.label}</h3>
                  </div>
                  <span className="text-[10px] text-gray-500">
                    {currentTabBuildings.filter(b => b.active).length}/{currentTabBuildings.length} active
                  </span>
                </div>

                {/* Compact Extractor Build Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-4">
                  {currentExtractors.map(type => {
                    const def = BUILDING_DEFS[type];
                    if (!def) return null;
                    const existingCount = extractorsByType[type].length;
                    const cost = getBuildingCost(type, existingCount);
                    const canAfford = store.money >= cost;
                    const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);

                    return (
                      <GameItemTooltip
                        key={type}
                        name={def.name}
                        emoji={def.emoji}
                        description={def.description}
                        category="Extractor"
                        tier={def.tier}
                        details={[
                          { label: 'Production Rate', value: `${def.baseProductionRate}/t` },
                          ...(def.outputs?.map(o => ({ label: `Output: ${RESOURCE_META[o.resource].name}`, value: `${o.amount}/t`, color: 'text-green-400' })) ?? []),
                          { label: 'Power Consumption', value: `${def.basePowerConsumption} MW`, color: 'text-yellow-400' },
                          { label: 'Build Cost', value: `$${formatNumber(cost)}`, color: canAfford ? 'text-green-400' : 'text-red-400' },
                          { label: 'Cost Multiplier', value: `x${def.costMultiplier}` },
                        ]}
                        requirements={[
                          ...(def.unlockRequirement?.research ? [{ label: 'Research', value: RESEARCH_TREE.find(r => r.id === def.unlockRequirement!.research)?.name ?? def.unlockRequirement.research, color: store.completedResearch.includes(def.unlockRequirement.research) ? 'text-green-400' : 'text-red-400' }] : []),
                          ...(def.unlockRequirement?.level ? [{ label: 'Level Required', value: `${def.unlockRequirement.level}`, color: 'text-amber-400' }] : []),
                        ]}
                        side="bottom"
                      >
                      <div
                        className={`relative rounded-lg p-2.5 border bg-[#0a0e17] transition-all duration-200 ${
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
                        {/* Header: emoji + name */}
                        <div className="flex items-start gap-2 mb-1.5">
                          <span className="text-lg leading-none mt-0.5">{def.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-gray-200 font-medium leading-tight truncate">{def.name}</p>
                          </div>
                        </div>

                        {/* Inline output flow */}
                        <div className="mb-2">
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {def.outputs?.map((out, i) => (
                              <span key={i} className="text-[8px] text-green-300/80 bg-green-900/20 rounded px-1 py-px">
                                {RESOURCE_META[out.resource].emoji}{out.amount}/t
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
                              {extractorsByType[type].filter(b => b.active).length}/{existingCount} active
                            </span>
                          </div>
                        )}
                      </div>
                      </GameItemTooltip>
                    );
                  })}
                </div>

                {/* ACTIVE EXTRACTORS for this tab - compact list */}
                {currentTabBuildings.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className={`w-3.5 h-3.5 ${currentColorClasses.text}`} />
                      <h4 className={`text-xs font-semibold ${currentColorClasses.text}`}>Active Extractors</h4>
                      <span className="text-[9px] text-gray-500">({currentTabBuildings.length})</span>
                    </div>
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto game-scrollbar pr-1">
                      {currentTabBuildings.map(building => {
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
                        const eff = building.efficiency * store.powerGrid.efficiency;

                        return (
                          <motion.div
                            key={building.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`rounded-lg bg-[#0a0e17] p-2.5 border transition-all duration-200 ${
                              recentlyBuilt.has(building.id) ? 'build-construct' : ''
                            } ${
                              recentlyUpgraded.has(building.id) ? 'upgrade-flash' : ''
                            } ${
                              building.active
                                ? `${currentColorClasses.border}`
                                : 'border-gray-800 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {/* Toggle + Emoji */}
                              <button
                                onClick={() => handleToggle(building.id)}
                                className={`text-base transition-transform duration-200 hover:scale-110 flex-shrink-0 ${
                                  building.active ? 'opacity-100' : 'grayscale opacity-50'
                                }`}
                                title={building.active ? 'Click to disable' : 'Click to enable'}
                              >
                                {def.emoji}
                              </button>

                              {/* Name + Level + Status + I/O + Efficiency */}
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

                                {/* Inline output flow */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {effectiveOutputs.map(({ resource: _r, rate, meta }, i) => (
                                    <div key={i} className="flex items-center gap-0.5 bg-green-900/15 rounded px-1 py-px">
                                      <span className="text-[10px]">{meta.emoji}</span>
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
                                  <span className={`text-[8px] font-mono ${
                                    eff >= 0.8 ? 'text-green-400' : eff >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                                  }`}>
                                    {(eff * 100).toFixed(0)}%
                                  </span>
                                </div>

                                {/* Power deficit warning */}
                                {building.active && store.powerGrid.overload && (
                                  <div className="mt-1 flex items-center gap-1 text-[8px] text-red-400 bg-red-900/20 rounded px-1.5 py-0.5 border border-red-900/30">
                                    <Zap className="w-2 h-2 flex-shrink-0" />
                                    <span>Power deficit!</span>
                                  </div>
                                )}
                              </div>

                              {/* Upgrade + Toggle - compact */}
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
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
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Empty state when no extractors built */}
                {currentTabBuildings.length === 0 && (
                  <div className="game-card-empty rounded-xl p-6 text-center">
                    <div className="text-4xl mb-3">{currentTabConfig.emoji}</div>
                    <h3 className="text-base font-bold text-amber-400 mb-2">No {currentTabConfig.label} Extractors</h3>
                    <p className="text-sm text-gray-400 mb-1">Build your first extractor to start mining resources</p>
                    <p className="text-xs text-gray-500 mt-2">Extractors gather raw materials from the earth. Start with a Mining Drill!</p>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* RIGHT: Resource Inventory, Flow & Summary */}
        <div className="space-y-4">
          {/* RAW MATERIALS INVENTORY */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">Raw Materials</h3>
              </div>
              <span className="text-[10px] text-gray-500">Storage</span>
            </div>
            <div className="space-y-2.5 max-h-96 overflow-y-auto game-scrollbar pr-1">
              {RAW_RESOURCES.map(resource => {
                const amount = store.resources[resource];
                const capacity = unlimited ? Infinity : store.resourceCapacity[resource];
                const meta = RESOURCE_META[resource];
                const pct = Number.isFinite(capacity) && capacity > 0 ? (amount / capacity) * 100 : 0;
                const prodRate = productionRates[resource] || 0;
                const consRate = consumptionRates[resource] || 0;
                const netRate = prodRate - consRate;
                const isFull = !Number.isFinite(capacity) ? false : pct >= 95;
                const isEmpty = amount === 0;

                // Only show resources that have some activity or stock
                if (isEmpty && prodRate === 0 && consRate === 0) return null;

                return (
                  <div key={resource} className={`rounded-lg p-2 bg-[#0a0e17] border ${
                    isFull ? 'border-orange-900/40' : 'border-gray-800/50'
                  }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{meta.emoji}</span>
                        <span className="text-[11px] text-gray-200 font-medium">{meta.name}</span>
                      </div>
                      {netRate !== 0 ? (
                        <span className={`text-[9px] font-mono ${netRate > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {netRate > 0 ? '+' : ''}{formatNumber(netRate)}/t
                        </span>
                      ) : prodRate > 0 ? (
                        <span className="text-[9px] text-yellow-400 font-mono">±0/t</span>
                      ) : (
                        <span className="text-[9px] text-gray-600 font-mono">—</span>
                      )}
                    </div>

                    {/* Amount display */}
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className={`text-xs font-bold font-mono ${
                        isFull ? 'text-orange-400' : isEmpty ? 'text-gray-600' : 'text-gray-200'
                      }`}>
                        {formatNumber(amount)}
                      </span>
                      <span className="text-[9px] text-gray-600">/</span>
                      <span className="text-[9px] text-gray-500 font-mono">{formatNumber(capacity)}</span>
                      {isFull && (
                        <span className="text-[8px] text-orange-400 ml-1">FULL</span>
                      )}
                    </div>

                    {/* Capacity bar */}
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full rounded-full resource-bar-animated transition-all duration-500 ${
                          pct > 90 ? 'bg-gradient-to-r from-red-600 to-red-400' :
                          pct > 70 ? 'bg-gradient-to-r from-orange-600 to-orange-400' :
                          pct > 40 ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
                          'bg-gradient-to-r from-amber-700 to-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>

                    {/* Production/Consumption mini breakdown */}
                    {(prodRate > 0 || consRate > 0) && (
                      <div className="flex items-center justify-between mt-1">
                        {prodRate > 0 && (
                          <div className="flex items-center gap-0.5">
                            <ArrowUpFromLine className="w-2 h-2 text-green-500" />
                            <span className="text-[8px] text-green-400 font-mono">{formatNumber(prodRate)}</span>
                          </div>
                        )}
                        {consRate > 0 && (
                          <div className="flex items-center gap-0.5">
                            <ArrowDownToLine className="w-2 h-2 text-red-500" />
                            <span className="text-[8px] text-red-400 font-mono">{formatNumber(consRate)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-0.5">
                          <Clock className="w-2 h-2 text-gray-500" />
                          <span className="text-[8px] text-gray-500 font-mono">
                            {Number.isFinite(capacity) && netRate > 0 ? `+${formatNumber(capacity - amount)}` : '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Storage upgrade */}
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-800/50">
                      <div className="flex items-center gap-0.5">
                        <Package className="w-2 h-2 text-gray-500" />
                        <span className="text-[8px] text-gray-500">Lv.{store.storageUpgradeLevels[resource] ?? 0}</span>
                      </div>
                      {(() => {
                        const currentLevel = store.storageUpgradeLevels[resource] ?? 0;
                        const upgradeCost = Math.floor(100 * Math.pow(1.5, currentLevel));
                        const canAffordUpgrade = store.money >= upgradeCost;
                        return (
                          <button
                            onClick={() => store.upgradeStorage(resource, 1)}
                            disabled={!canAffordUpgrade}
                            className={`text-[8px] px-1.5 py-0.5 rounded transition-colors ${
                              canAffordUpgrade
                                ? 'text-amber-400 bg-amber-900/20 hover:bg-amber-900/40 border border-amber-800/40'
                                : 'text-gray-600 bg-gray-800/30 border border-gray-800/30 cursor-not-allowed'
                            }`}
                          >
                            +50% (${formatNumber(upgradeCost)})
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RESOURCE FLOW VISUALIZATION */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-green-400">Resource Flow</h3>
              </div>
              <span className="text-[10px] text-gray-500">net/t</span>
            </div>
            {resourceFlow.length === 0 ? (
              <div className="game-card-empty rounded-xl p-6 text-center">
                <div className="text-3xl mb-2">📊</div>
                <h3 className="text-sm font-bold text-green-400 mb-1">No Resource Flow Yet</h3>
                <p className="text-xs text-gray-400">Build extractors to generate resources and see the flow visualization</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar pr-1">
                {resourceFlow
                  .sort((a, b) => {
                    const netA = a.rate - (consumptionRates[a.resource] || 0);
                    const netB = b.rate - (consumptionRates[b.resource] || 0);
                    return netB - netA;
                  })
                  .map(({ resource, rate, amount, capacity, meta }) => {
                    const consRate = consumptionRates[resource] || 0;
                    const net = rate - consRate;
                    const maxRate = Math.max(rate, consRate, 0.1);
                    const fillPct = Number.isFinite(capacity) && capacity > 0 ? (amount / capacity) * 100 : 0;
                    const isFull = Number.isFinite(capacity) && fillPct >= 100;
                    const isAlmostFull = Number.isFinite(capacity) && fillPct >= 95;
                    const isNearing = Number.isFinite(capacity) && fillPct >= 80;

                    return (
                      <div key={resource} className="bg-[#0a0e17] rounded-lg p-2">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm">{meta.emoji}</span>
                          <span className="text-[11px] text-gray-300 flex-1 flex items-center gap-1.5">
                            {meta.name}
                            {isFull && (
                              <span className="inline-flex items-center text-[8px] font-bold text-red-400 bg-red-900/30 border border-red-500/40 rounded px-1 py-px animate-pulse">
                                FULL
                              </span>
                            )}
                            {!isFull && isAlmostFull && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] text-red-400">
                                🔴 <span className="text-red-300">Almost full!</span>
                              </span>
                            )}
                            {!isAlmostFull && isNearing && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] text-yellow-400">
                                ⚠ <span className="text-yellow-300">Nearing capacity</span>
                              </span>
                            )}
                          </span>
                          <span className={`text-[10px] font-mono font-bold ${
                            net > 0 ? 'text-green-400' : net < 0 ? 'text-red-400' : 'text-gray-600'
                          }`}>
                            {net > 0 ? `+${formatNumber(net)}/t` : net < 0 ? `${formatNumber(net)}/t` : '—'}
                          </span>
                        </div>

                        {/* Flow bar visualization */}
                        <div className="relative h-5 flex items-center">
                          {/* Center line */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-700" />

                          {/* Production side (left of center) */}
                          <div className="absolute left-1/2 right-1/2 flex justify-end pr-0.5">
                            <div
                              className="h-3 bg-gradient-to-l from-green-600 to-green-800 rounded-l"
                              style={{ width: `${(rate / maxRate) * 48}%`, minWidth: rate > 0 ? '4px' : '0' }}
                            />
                          </div>

                          {/* Consumption side (right of center) */}
                          <div className="absolute left-1/2 right-1/2 flex pl-0.5">
                            <div
                              className="h-3 bg-gradient-to-r from-red-600 to-red-800 rounded-r"
                              style={{ width: `${(consRate / maxRate) * 48}%`, minWidth: consRate > 0 ? '4px' : '0' }}
                            />
                          </div>

                          {/* Labels */}
                          <span className="absolute left-1 text-[7px] text-green-400 font-mono">{formatNumber(rate)}</span>
                          <span className="absolute right-1 text-[7px] text-red-400 font-mono">{formatNumber(consRate)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* EXTRACTOR SUMMARY */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Container className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-400">Extractor Summary</h3>
            </div>
            <div className="space-y-1.5">
              {EXTRACTOR_TYPES.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const instances = extractorsByType[type];
                const activeInstances = instances.filter(b => b.active);
                const totalLevel = instances.reduce((s, b) => s + b.level, 0);
                const unlocked = isBuildingUnlocked(type, store.completedResearch, store.prestigeState);

                return (
                  <div key={type} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg p-2">
                    <span className="text-base">{def.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[11px] font-medium ${unlocked ? 'text-gray-200' : 'text-gray-600'}`}>
                          {def.name}
                        </span>
                        <span className="text-[9px] text-gray-500 font-mono">
                          {activeInstances.length}/{instances.length}
                        </span>
                      </div>
                      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
                          style={{ width: instances.length > 0 ? `${(activeInstances.length / instances.length) * 100}%` : '0%' }}
                        />
                      </div>
                      {instances.length > 0 && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[8px] text-gray-500">Total Lv.{totalLevel}</span>
                          <span className="text-[8px] text-gray-500">
                            {formatNumber(instances.reduce((s, b) => s + def.basePowerConsumption * b.level, 0))} MW
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
