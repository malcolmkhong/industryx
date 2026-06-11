'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useGameStore, formatNumber, getBuildingCost, isBuildingUnlocked, hasUnlimitedStorage } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, RESEARCH_TREE } from '@/lib/game/configCache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Pickaxe, ChevronUp, Power, PowerOff, Hammer, ArrowRight,
  Package, TrendingUp, Zap, Clock, Lock, Layers, Droplets,
  Mountain, Drill, Container, Warehouse, ArrowDownToLine,
  ArrowUpFromLine, Workflow, Gauge, X,
} from 'lucide-react';
import { ResourceType, ExtractorType } from '@/lib/game/types';
import { getExtractorTypes, getBasicExtractors, getAdvancedExtractors, getSpecializedExtractors } from '@/lib/game/buildingDiscovery';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { getTierColorClasses, type TierColor } from '@/components/game/shared/tierColors';
import { GameIcon } from '@/components/game/shared/GameIcon';

// ─── Constants ────────────────────────────────────────────────────────────────

// Dynamic extractor types from BUILDING_DEFS (includes Supabase buildings)
const EXTRACTOR_TYPES = getExtractorTypes() as ExtractorType[];
const BASIC_EXTRACTORS = getBasicExtractors() as ExtractorType[];
const ADVANCED_EXTRACTORS = getAdvancedExtractors() as ExtractorType[];
const SPECIALIZED_EXTRACTORS = getSpecializedExtractors() as ExtractorType[];

const RAW_RESOURCES: ResourceType[] = ['iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water', 'rareEarth', 'clay', 'limestone', 'gravel', 'bauxite', 'wolframite', 'silver', 'gold'];

// Tab config for the tier selector
const TAB_CONFIG = {
  basic: { label: 'Basic Mining', shortLabel: 'Basic', color: 'amber' as const, icon: 'gi:mining' },
  advanced: { label: 'Advanced Mining', shortLabel: 'Advanced', color: 'orange' as const, icon: 'gi:peaks' },
  specialized: { label: 'Specialized', shortLabel: 'Special', color: 'purple' as const, icon: 'gi:gem-chain' },
};

type TabKey = 'basic' | 'advanced' | 'specialized';

// Extraction pipeline tiers for SVG flow diagram
const EXTRACTION_TIERS = [
  { key: 'basic', label: 'Basic Mining', icon: 'gi:mining', color: '#f59e0b' },
  { key: 'advanced', label: 'Advanced Mining', icon: 'gi:peaks', color: '#f97316' },
  { key: 'specialized', label: 'Specialized', icon: 'gi:gem-chain', color: '#a855f7' },
] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Main Component ───────────────────────────────────────────────────────────

export function ResourcePanel() {
  const buildings = useGameStore((s) => s.buildings);
  const resources = useGameStore((s) => s.resources);
  const resourceCapacity = useGameStore((s) => s.resourceCapacity);
  const storageUpgradeLevels = useGameStore((s) => s.storageUpgradeLevels);
  const money = useGameStore((s) => s.money);
  const powerGrid = useGameStore((s) => s.powerGrid);
  const prestigeState = useGameStore((s) => s.prestigeState);
  const productionSnapshot = useGameStore((s) => s.productionSnapshot);
  const completedResearch = useGameStore((s) => s.completedResearch);
  const megaProjects = useGameStore((s) => s.megaProjects);
  const buildBuilding = useGameStore((s) => s.buildBuilding);
  const toggleBuilding = useGameStore((s) => s.toggleBuilding);
  const upgradeBuilding = useGameStore((s) => s.upgradeBuilding);
  const upgradeStorage = useGameStore((s) => s.upgradeStorage);
  const [selectedTab, setSelectedTab] = useState<TabKey>('basic');
  const [selectedFlowNode, setSelectedFlowNode] = useState<string | null>(null);

  // Track recently built/upgraded buildings for CSS animation classes
  const [recentlyBuilt, setRecentlyBuilt] = useState<Set<string>>(new Set());
  const [recentlyUpgraded, setRecentlyUpgraded] = useState<Set<string>>(new Set());

  // ─── Computed data ──────────────────────────────────────────────────────

  // Extractor buildings from store
  const extractorBuildings = useMemo(() =>
    buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor'),
    [buildings]
  );

  // Extractors grouped by tab
  const extractorsByTab = useMemo(() => ({
    basic: extractorBuildings.filter(b => BASIC_EXTRACTORS.includes(b.type as ExtractorType)),
    advanced: extractorBuildings.filter(b => ADVANCED_EXTRACTORS.includes(b.type as ExtractorType)),
    specialized: extractorBuildings.filter(b => SPECIALIZED_EXTRACTORS.includes(b.type as ExtractorType)),
  }), [extractorBuildings]);

  // Extractor instances grouped by type
  const extractorsByType = useMemo(() => {
    const grouped: Record<string, typeof buildings> = {};
    EXTRACTOR_TYPES.forEach(type => {
      grouped[type] = buildings.filter(b => b.type === type);
    });
    return grouped;
  }, [buildings]);

  // Production rates per resource — use productionSnapshot which includes all bonuses
  // (mega project, prestige, research, worker, event, weather, etc.)
  // Only include extractor-produced resources for the Raw Materials panel
  const productionRates = useMemo(() => {
    const extractorResources = new Set<string>();
    buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def || def.category !== 'extractor' || !def.outputs) return;
      def.outputs.forEach(o => extractorResources.add(o.resource));
    });
    const rates: Record<string, number> = {};
    Object.entries(productionSnapshot.production).forEach(([res, rate]) => {
      if (extractorResources.has(res)) {
        rates[res] = rate;
      }
    });
    return rates;
  }, [buildings, productionSnapshot.production]);

  // Consumption rates — use actual consumption for net rate, demand consumption for demand display
  const consumptionRates = productionSnapshot.actualConsumption;
  const demandRates = productionSnapshot.consumption;

  // Resource flow data
  const unlimited = useMemo(() => hasUnlimitedStorage(megaProjects), [megaProjects]);
  const resourceFlow = useMemo(() => {
    return RAW_RESOURCES.map(r => {
      const rate = productionRates[r] || 0;
      const amount = resources[r];
      const capacity = unlimited ? Infinity : resourceCapacity[r];
      const meta = RESOURCE_META[r];
      return { resource: r, rate, amount, capacity, meta };
    }).filter(r => r.rate > 0 || r.amount > 0);
  }, [productionRates, resources, resourceCapacity, unlimited]);

  // Extraction tier production summary for SVG flow — uses productionSnapshot
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
        const rate = productionSnapshot.production[o.resource] ?? 0;
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
        const rate = productionSnapshot.production[o.resource] ?? 0;
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
  }, [extractorBuildings, productionSnapshot.production]);

  // ─── Overview stats ─────────────────────────────────────────────────────

  const totalExtractors = extractorBuildings.length;
  const activeExtractors = extractorBuildings.filter(b => b.active).length;
  const totalPowerConsumption = productionSnapshot.powerConsumption;
  const avgEfficiency = activeExtractors > 0
    ? extractorBuildings.filter(b => b.active).reduce((sum, b) => sum + b.efficiency, 0) / activeExtractors
    : 0;
  const rawMaterialTypes = Object.keys(productionRates).filter(r => RAW_RESOURCES.includes(r as ResourceType)).length;

  // Current tab data
  const currentTabConfig = TAB_CONFIG[selectedTab];
  const currentExtractors = selectedTab === 'basic' ? BASIC_EXTRACTORS : selectedTab === 'advanced' ? ADVANCED_EXTRACTORS : SPECIALIZED_EXTRACTORS;
  const currentTabBuildings = extractorsByTab[selectedTab];
  const currentColorClasses = getTierColorClasses(currentTabConfig.color);

  // ─── Callbacks ──────────────────────────────────────────────────────────

  const handleBuild = useCallback((type: ExtractorType) => {
    const prevCount = buildings.filter(b => b.type === type).length;
    buildBuilding(type);
    setTimeout(() => {
      const newBuildings = buildings.filter(b => b.type === type);
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
    upgradeBuilding(id);
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

  const handleToggle = useCallback((id: string) => {
    toggleBuilding(id);
  }, [toggleBuilding]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-warning neon-glow-amber tracking-wide flex items-center gap-2">
            <Pickaxe className="w-5 h-5" />
            Resource Extraction
          </h2>
          <p className="text-xs text-muted-label mt-0.5">Mine, pump, and extract raw materials from the earth</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-warning/50 text-warning bg-amber-900/20 text-xs">
            <Pickaxe className="w-3 h-3 mr-1" />
            {activeExtractors}/{totalExtractors} Active
          </Badge>
          <Badge variant="outline" className="border-warning/50 text-warning bg-yellow-900/20 text-xs">
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
          subtext={powerGrid.overload ? 'Grid overloaded!' : 'Nominal'}
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
      <div className="game-card rounded-xl bg-card p-4 border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-semibold text-warning">Extraction Pipeline</h3>
          </div>
          <span className="text-[10px] text-muted-label">Click a tier node for details</span>
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
                    {formatNumber(tierProductionSummary[EXTRACTION_TIERS[i + 1].key]?.production ?? 0)}/s
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
                    />
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
                    <GameIcon icon={tier.icon} size={11} />
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
                    {formatNumber(summary?.production ?? 0)}/s
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
        {selectedFlowNode && (() => {
            const tierIdx = EXTRACTION_TIERS.findIndex(t => t.key === selectedFlowNode);
            const tierInfo = EXTRACTION_TIERS[tierIdx];
            const tierExtractors = tierIdx === 0 ? BASIC_EXTRACTORS : tierIdx === 1 ? ADVANCED_EXTRACTORS : SPECIALIZED_EXTRACTORS;
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
              <div
                className="overflow-hidden"
              >
                <div className="mt-3 bg-[#0a0e17] rounded-lg p-3 border" style={{ borderColor: `${tierInfo.color}33` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tierInfo.color }} />
                      <span className="text-xs font-medium" style={{ color: tierInfo.color }}>{tierInfo.label} Details</span>
                    </div>
                    <button onClick={() => setSelectedFlowNode(null)} className="text-muted-label hover:text-subtle transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {Object.keys(relevantResources).length === 0 ? (
                    <p className="text-[10px] text-muted-label py-2">No extraction in this tier yet</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(relevantResources).map(([res, { prod, cons }]) => {
                        const meta = RESOURCE_META[res as ResourceType];
                        const net = prod - cons;
                        return (
                          <div key={res} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border" style={{ borderColor: `${meta.color}22`, backgroundColor: `${meta.color}08` }}>
                            <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                            <div className="min-w-0">
                              <div className="text-[10px] text-subtle font-medium truncate">{meta.name}</div>
                              <div className={`text-[9px] font-mono ${net > 0 ? 'text-success' : net < 0 ? 'text-danger' : prod > 0 && cons > 0 ? 'text-brand' : 'text-muted-label'}`}>
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

      {/* MAIN CONTENT: Extractor Grid + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Extractor Grid with Tab Selector */}
        <div className="lg:col-span-2 space-y-3">
          {/* TAB SELECTOR */}
          <div className="flex items-center gap-1 p-1 bg-card rounded-xl border border-border">
            {(['basic', 'advanced', 'specialized'] as const).map(tab => {
              const config = TAB_CONFIG[tab];
              const colors = getTierColorClasses(config.color);
              const tabBuildings = extractorsByTab[tab];
              const isActive = selectedTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-semibold ${
                    isActive
                      ? colors.tabActive
                      : `border-transparent text-muted-label ${colors.tabHover}`
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${isActive ? colors.bg : 'bg-muted-label/50'}`}>
                    <GameIcon icon={config.icon} size={16} />
                  </div>
                  <span className="hidden sm:inline">{config.label}</span>
                  <span className="sm:hidden">{config.shortLabel}</span>
                  <span className={`text-[9px] font-mono ${isActive ? '' : 'text-muted-label'}`}>
                    ({tabBuildings.filter(b => b.active).length}/{tabBuildings.length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* EXTRACTOR BUILD CARDS for selected tab */}
          <div key={selectedTab}>
              <div className="game-card rounded-xl bg-card p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg ${currentColorClasses.bg} flex items-center justify-center ${currentColorClasses.text}`}>
                      <GameIcon icon={currentTabConfig.icon} size={16} />
                    </div>
                    <h3 className={`text-sm font-semibold ${currentColorClasses.text}`}>{currentTabConfig.label}</h3>
                  </div>
                  <span className="text-[10px] text-muted-label">
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
                    const canAfford = money >= cost;
                    const unlocked = isBuildingUnlocked(type, completedResearch, prestigeState);

                    return (
                      <GameItemTooltip
                        key={type}
                        name={def.name}
                        icon={def.icon}
                        description={def.description}
                        category="Extractor"
                        tier={def.tier}
                        details={[
                          { label: 'Production Rate', value: `${def.baseProductionRate.toFixed(1)}/s` },
                          ...(def.outputs?.map(o => ({ label: `Output: ${RESOURCE_META[o.resource].name}`, value: `${(o.amount * def.baseProductionRate).toFixed(1)}/s`, color: 'text-success' })) ?? []),
                          { label: 'Power Consumption', value: `${def.basePowerConsumption} MW`, color: 'text-warning' },
                          { label: 'Build Cost', value: `$${formatNumber(cost)}`, color: canAfford ? 'text-success' : 'text-danger' },
                          { label: 'Cost Multiplier', value: `x${def.costMultiplier}` },
                        ]}
                        requirements={[
                          ...(def.unlockRequirement?.research ? [{ label: 'Research', value: RESEARCH_TREE.find(r => r.id === def.unlockRequirement!.research)?.name ?? def.unlockRequirement.research, color: completedResearch.includes(def.unlockRequirement.research) ? 'text-success' : 'text-danger' }] : []),
                          ...(def.unlockRequirement?.level ? [{ label: 'Level Required', value: `${def.unlockRequirement.level}`, color: 'text-warning' }] : []),
                        ]}
                        side="bottom"
                      >
                      <div
                        className={`relative rounded-lg p-3 border bg-[#0a0e17] ${
                          !unlocked
                            ? 'border-muted-label opacity-60'
                            : canAfford
                              ? `${currentColorClasses.hoverBorder} ${currentColorClasses.glow}`
                              : 'border-muted-label'
                        }`}
                      >
                        {!unlocked && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg z-10">
                            <Lock className="w-4 h-4 text-muted-label" />
                          </div>
                        )}
                        {/* Header: emoji + name */}
                        <div className="flex items-start gap-2 mb-1.5">
                          <GameIcon icon={def.icon} size={20} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-subtle font-medium leading-tight truncate">{def.name}</p>
                          </div>
                        </div>

                        {/* Inline output flow */}
                        <div className="mb-2">
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {def.outputs?.map((out, i) => (
                              <span key={i} className="text-[8px] text-success/80 bg-success/20 rounded px-1 py-px">
                                <GameIcon icon={RESOURCE_META[out.resource].icon} size={10} className="inline-flex" />{(out.amount * def.baseProductionRate).toFixed(1)}/s
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Cost + Power */}
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-mono font-bold ${canAfford ? 'text-success' : 'text-danger'}`}>
                            ${formatNumber(cost)}
                          </span>
                          <span className="flex items-center gap-0.5 text-[9px] text-muted-label">
                            <Zap className="w-2.5 h-2.5 text-warning" />
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
                              : 'border-muted-label text-muted-label cursor-not-allowed'
                          }`}
                          onClick={() => handleBuild(type)}
                          disabled={!canAfford || !unlocked}
                        >
                          <Hammer className="w-2.5 h-2.5 mr-1" />
                          Build
                        </Button>

                        {existingCount > 0 && (
                          <div className="mt-1 text-center">
                            <span className="text-[8px] text-muted-label">
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
                      <span className="text-[9px] text-muted-label">({currentTabBuildings.length})</span>
                    </div>
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto game-scrollbar pr-1">
                      {currentTabBuildings.map(building => {
                        const def = BUILDING_DEFS[building.type];
                        if (!def) return null;
                        const upgradeCost = getBuildingCost(building.type, building.level);
                        const canUpgrade = money >= upgradeCost;
                        const buildingSnapshot = productionSnapshot.buildings[building.id];
                        const effectiveOutputs = buildingSnapshot
                          ? buildingSnapshot.outputs.map(o => ({
                              resource: o.resource,
                              rate: o.amount,
                              meta: RESOURCE_META[o.resource],
                            }))
                          : [];
                        const eff = buildingSnapshot?.efficiency ?? 0;

                        return (
                          <div
                            key={building.id}
                            className={`rounded-lg bg-[#0a0e17] p-2.5 border ${
                              building.active
                                ? `${currentColorClasses.border}`
                                : 'border-muted-label opacity-60'
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

                              {/* Name + Level + Status + I/O + Efficiency */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="text-[11px] text-subtle font-medium">{def.name}</span>
                                  <Badge variant="outline" className={`text-[8px] ${currentColorClasses.badge} ${currentColorClasses.text} px-1 py-0`}>
                                    Lv.{building.level}
                                  </Badge>
                                  {!building.active && (
                                    <Badge variant="outline" className="text-[8px] border-muted-label text-muted-label px-1 py-0">
                                      OFF
                                    </Badge>
                                  )}
                                </div>

                                {/* Inline output flow */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  {effectiveOutputs.map(({ resource: _r, rate, meta }, i) => (
                                    <div key={i} className="flex items-center gap-0.5 bg-success/15 rounded px-1 py-px">
                                      <GameIcon icon={meta.icon} size={10} className="inline-flex" />
                                      <span className={`text-[8px] font-mono ${building.active ? 'text-success' : 'text-muted-label'}`}>
                                        +{formatNumber(rate)}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* Efficiency bar - compact inline */}
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[8px] text-muted-label">Eff</span>
                                  <div className="flex-1 h-1 bg-muted-label rounded-full overflow-hidden">
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
                                    eff >= 0.8 ? 'text-success' : eff >= 0.5 ? 'text-warning' : 'text-danger'
                                  }`}>
                                    {(eff * 100).toFixed(0)}%
                                  </span>
                                </div>

                                {/* Power deficit warning */}
                                {building.active && powerGrid.overload && (
                                  <div className="mt-1 flex items-center gap-1 text-[8px] text-danger bg-danger/20 rounded px-1.5 py-0.5 border border-red-900/30">
                                    <Zap className="w-2 h-2 flex-shrink-0" />
                                    <span>Power deficit!</span>
                                  </div>
                                )}
                              </div>

                              {/* Upgrade + Toggle - compact */}
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <button
                                  onClick={() => handleToggle(building.id)}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                                    building.active
                                      ? 'border-success/50 bg-success/20 text-success'
                                      : 'border-muted-label bg-muted-label text-muted-label'
                                  }`}
                                >
                                  {building.active ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                                </button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`h-5 text-[8px] px-1.5 ${
                                    canUpgrade
                                      ? 'border-brand/50 text-brand hover:bg-brand/30'
                                      : 'border-muted-label text-muted-label'
                                  }`}
                                  onClick={() => handleUpgrade(building.id)}
                                  disabled={!canUpgrade}
                                >
                                  <ChevronUp className="w-2.5 h-2.5" />
                                </Button>
                                <span className={`text-[7px] font-mono ${canUpgrade ? 'text-subtle' : 'text-danger'}`}>
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

                {/* Empty state when no extractors built */}
                {currentTabBuildings.length === 0 && (
                  <div className="game-card-empty rounded-xl p-6 text-center">
                    <div className="text-4xl mb-3"><GameIcon icon={currentTabConfig.icon} size={32} /></div>
                    <h3 className="text-base font-bold text-warning mb-2">No {currentTabConfig.label} Extractors</h3>
                    <p className="text-sm text-subtle mb-1">Build your first extractor to start mining resources</p>
                    <p className="text-xs text-muted-label mt-2">Extractors gather raw materials from the earth. Start with a Mining Drill!</p>
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* RIGHT: Resource Inventory, Flow & Summary */}
        <div className="space-y-4">
          {/* RAW MATERIALS INVENTORY */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-warning" />
                <h3 className="text-sm font-semibold text-warning">Raw Materials</h3>
              </div>
              <span className="text-[10px] text-muted-label">Storage</span>
            </div>
            <div className="space-y-2.5 max-h-96 overflow-y-auto game-scrollbar pr-1">
              {RAW_RESOURCES.map(resource => {
                const amount = resources[resource];
                const capacity = unlimited ? Infinity : resourceCapacity[resource];
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
                    isFull ? 'border-domain/40' : 'border-muted-label/50'
                  }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                        <span className="text-[11px] text-subtle font-medium">{meta.name}</span>
                      </div>
                      {netRate !== 0 ? (
                        <span className={`text-[9px] font-mono ${netRate > 0 ? 'text-success' : 'text-danger'}`}>
                          {netRate > 0 ? '+' : ''}{formatNumber(netRate)}/s
                        </span>
                      ) : prodRate > 0 ? (
                        <span className="text-[9px] text-warning font-mono">±0/s</span>
                      ) : (
                        <span className="text-[9px] text-muted-label font-mono">—</span>
                      )}
                    </div>

                    {/* Amount display */}
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className={`text-xs font-bold font-mono ${
                        isFull ? 'text-domain' : isEmpty ? 'text-muted-label' : 'text-subtle'
                      }`}>
                        {formatNumber(amount)}
                      </span>
                      <span className="text-[9px] text-muted-label">/</span>
                      <span className="text-[9px] text-muted-label font-mono">{formatNumber(capacity)}</span>
                      {isFull && (
                        <span className="text-[8px] text-domain ml-1">FULL</span>
                      )}
                    </div>

                    {/* Capacity bar */}
                    <div className="h-1.5 bg-muted-label rounded-full overflow-hidden relative">
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
                            <ArrowUpFromLine className="w-2 h-2 text-success" />
                            <span className="text-[8px] text-success font-mono">{formatNumber(prodRate)}</span>
                          </div>
                        )}
                        {consRate > 0 && (
                          <div className="flex items-center gap-0.5">
                            <ArrowDownToLine className="w-2 h-2 text-danger" />
                            <span className="text-[8px] text-danger font-mono">{formatNumber(consRate)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-0.5">
                          <Clock className="w-2 h-2 text-muted-label" />
                          <span className="text-[8px] text-muted-label font-mono">
                            {Number.isFinite(capacity) && netRate > 0 ? `+${formatNumber(capacity - amount)}` : '—'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Storage upgrade */}
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-muted-label/50">
                      <div className="flex items-center gap-0.5">
                        <Package className="w-2 h-2 text-muted-label" />
                        <span className="text-[8px] text-muted-label">Lv.{storageUpgradeLevels[resource] ?? 0}</span>
                      </div>
                      {(() => {
                        const currentLevel = storageUpgradeLevels[resource] ?? 0;
                        const upgradeCost = Math.floor(100 * Math.pow(1.5, currentLevel));
                        const canAffordUpgrade = money >= upgradeCost;
                        return (
                          <button
                            onClick={() => upgradeStorage(resource, 1)}
                            disabled={!canAffordUpgrade}
                            className={`text-[8px] px-1.5 py-0.5 rounded transition-colors ${
                              canAffordUpgrade
                                ? 'text-warning bg-amber-900/20 hover:bg-amber-900/40 border border-amber-800/40'
                                : 'text-muted-label bg-muted-label/30 border border-muted-label/30 cursor-not-allowed'
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-success" />
                <h3 className="text-sm font-semibold text-success">Resource Flow</h3>
              </div>
              <span className="text-[10px] text-muted-label">net/s</span>
            </div>
            {resourceFlow.length === 0 ? (
              <div className="game-card-empty rounded-xl p-6 text-center">
                <div className="mb-2"><GameIcon icon="gi:chart" size={28} /></div>
                <h3 className="text-sm font-bold text-success mb-1">No Resource Flow Yet</h3>
                <p className="text-xs text-subtle">Build extractors to generate resources and see the flow visualization</p>
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
                          <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                          <span className="text-[11px] text-subtle flex-1 flex items-center gap-1.5">
                            {meta.name}
                            {isFull && (
                              <span className="inline-flex items-center text-[8px] font-bold text-danger bg-danger/30 border border-danger/40 rounded px-1 py-px animate-pulse">
                                FULL
                              </span>
                            )}
                            {!isFull && isAlmostFull && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] text-danger">
                                <span className="w-2 h-2 rounded-full bg-danger"></span> <span className="text-danger">Almost full!</span>
                              </span>
                            )}
                            {!isAlmostFull && isNearing && (
                              <span className="inline-flex items-center gap-0.5 text-[8px] text-warning">
                                <GameIcon icon="gi:hazard-sign" size={14} className="inline" /> <span className="text-warning">Nearing capacity</span>
                              </span>
                            )}
                          </span>
                          <span className={`text-[10px] font-mono font-bold ${
                            net > 0 ? 'text-success' : net < 0 ? 'text-danger' : rate > 0 && consRate > 0 ? 'text-brand' : 'text-muted-label'
                          }`}>
                            {net > 0 ? `+${formatNumber(net)}/s` : net < 0 ? `${formatNumber(net)}/s` : rate > 0 && consRate > 0 ? '±0/s' : '—'}
                          </span>
                        </div>

                        {/* Flow bar visualization */}
                        <div className="relative h-5 flex items-center">
                          {/* Center line */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-label" />

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
                          <span className="absolute left-1 text-[7px] text-success font-mono">{formatNumber(rate)}</span>
                          <span className="absolute right-1 text-[7px] text-danger font-mono">{formatNumber(consRate)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* EXTRACTOR SUMMARY */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Container className="w-4 h-4 text-warning" />
              <h3 className="text-sm font-semibold text-warning">Extractor Summary</h3>
            </div>
            <div className="space-y-1.5">
              {EXTRACTOR_TYPES.map(type => {
                const def = BUILDING_DEFS[type];
                if (!def) return null;
                const instances = extractorsByType[type];
                const activeInstances = instances.filter(b => b.active);
                const totalLevel = instances.reduce((s, b) => s + b.level, 0);
                const unlocked = isBuildingUnlocked(type, completedResearch, prestigeState);

                return (
                  <div key={type} className="flex items-center gap-2 bg-[#0a0e17] rounded-lg p-2">
                    <GameIcon icon={def.icon} size={16} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[11px] font-medium ${unlocked ? 'text-subtle' : 'text-muted-label'}`}>
                          {def.name}
                        </span>
                        <span className="text-[9px] text-muted-label font-mono">
                          {activeInstances.length}/{instances.length}
                        </span>
                      </div>
                      <div className="h-1 bg-muted-label rounded-full overflow-hidden">
                        <div
                          className="h-full bg-warning rounded-full transition-all duration-500"
                          style={{ width: instances.length > 0 ? `${(activeInstances.length / instances.length) * 100}%` : '0%' }}
                        />
                      </div>
                      {instances.length > 0 && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[8px] text-muted-label">Total Lv.{totalLevel}</span>
                          <span className="text-[8px] text-muted-label">
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
