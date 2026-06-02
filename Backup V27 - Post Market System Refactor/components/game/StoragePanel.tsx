'use client';

import { useState, useMemo, useCallback } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { RESOURCE_META, BUILDING_DEFS, PRODUCTION_CHAINS } from '@/lib/game/data';
import { hasUnlimitedStorage } from '@/lib/game/store';
import { ResourceType, BuildingType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, ChevronDown, ChevronRight, ArrowUp, ArrowDown,
  AlertTriangle, Package, TrendingUp, TrendingDown, Minus,
  Search, X, Zap, Link2, BarChart3, Shield, Plus,
  ArrowRight, Box, Layers, Activity, AlertCircle, CheckCircle2,
  Gauge, Warehouse, CircleDot,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GameIcon } from '@/components/game/shared/GameIcon';

// ─── Tier Config ──────────────────────────────────────────────────────────────
const TIER_CONFIG: Record<number, { label: string; color: string; bg: string; border: string }> = {
  0: { label: 'Raw Materials', color: '#a0a0a0', bg: 'bg-gray-900/30', border: 'border-gray-700/40' },
  1: { label: 'Tier 1 — Refined', color: '#22d3ee', bg: 'bg-cyan-900/20', border: 'border-cyan-700/40' },
  2: { label: 'Tier 2 — Manufactured', color: '#f97316', bg: 'bg-orange-900/20', border: 'border-orange-700/40' },
  3: { label: 'Tier 3 — High-Tech', color: '#a855f7', bg: 'bg-purple-900/20', border: 'border-purple-700/40' },
  4: { label: 'Tier 4 — Singularity', color: '#00ffcc', bg: 'bg-emerald-900/20', border: 'border-emerald-700/40' },
};

type ViewMode = 'overview' | 'dependencies' | 'alerts';
type SortMode = 'tier' | 'stock' | 'rate' | 'capacity';

// ─── Storage Upgrade Cost Helper ─────────────────────────────────────────────
function getStorageUpgradeCost(currentLevel: number, levels: number = 1): number {
  let total = 0;
  for (let i = 0; i < levels; i++) {
    total += Math.floor(100 * Math.pow(1.5, currentLevel + i));
  }
  return total;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StoragePanel() {
  const store = useGameStore();
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [sortMode, setSortMode] = useState<SortMode>('tier');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedResource, setExpandedResource] = useState<ResourceType | null>(null);
  const [expandedTier, setExpandedTier] = useState<number | null>(0);

  const unlimited = useMemo(() => hasUnlimitedStorage(store.megaProjects), [store.megaProjects]);

  // ─── Computed Data ────────────────────────────────────────────────────────
  const allResources = useMemo(() => {
    const result: ResourceType[] = [];
    for (const key of Object.keys(RESOURCE_META) as ResourceType[]) {
      result.push(key);
    }
    return result;
  }, []);

  // Build producer/consumer mapping for each resource
  const resourceDependencies = useMemo(() => {
    const deps: Record<string, { producers: { building: string; type: BuildingType; amount: number }[]; consumers: { building: string; type: BuildingType; amount: number }[]; chains: string[] }> = {};

    for (const res of allResources) {
      deps[res] = { producers: [], consumers: [], chains: [] };
    }

    // Map buildings to their inputs/outputs (from production snapshot)
    for (const b of store.buildings) {
      if (!b.active) continue;
      const def = BUILDING_DEFS[b.type];
      if (!def) continue;

      const buildingSnapshot = store.productionSnapshot.buildings[b.id];
      if (!buildingSnapshot) continue;

      for (const o of buildingSnapshot.outputs) {
        if (o.resource === 'money') continue;
        if (deps[o.resource]) {
          deps[o.resource].producers.push({
            building: def.name,
            type: b.type,
            amount: o.amount,
          });
        }
      }
      for (const inp of buildingSnapshot.inputs) {
        if (inp.resource === 'money') continue;
        if (deps[inp.resource]) {
          deps[inp.resource].consumers.push({
            building: def.name,
            type: b.type,
            amount: inp.amount,
          });
        }
      }
    }

    // Map production chains affecting each resource
    for (const chain of PRODUCTION_CHAINS) {
      for (const step of chain.steps) {
        if (deps[step]) {
          deps[step].chains.push(chain.name);
        }
      }
    }

    return deps;
  }, [store.buildings, store.productionSnapshot, allResources]);

  // Compute alerts
  const alerts = useMemo(() => {
    const list: { resource: ResourceType; type: 'shortage' | 'overflow' | 'bottleneck' | 'critical'; message: string; severity: number }[] = [];

    for (const res of allResources) {
      const amount = store.resources[res] ?? 0;
      const capacity = store.resourceCapacity[res] ?? 100;
      const prodRate = store.productionSnapshot.production[res] ?? 0;
      const consRate = store.productionSnapshot.actualConsumption[res] ?? 0;
      const demandRate = store.productionSnapshot.consumption[res] ?? 0;
      const netRate = prodRate - consRate;
      const fillPct = capacity > 0 ? (amount / capacity) * 100 : 0;

      // Critical: Empty and being demanded
      if (amount === 0 && demandRate > 0) {
        list.push({ resource: res, type: 'critical', message: `${RESOURCE_META[res].name} is depleted but still being consumed!`, severity: 4 });
      }
      // Shortage: < 10% and being demanded
      else if (fillPct > 0 && fillPct < 10 && demandRate > 0) {
        list.push({ resource: res, type: 'shortage', message: `${RESOURCE_META[res].name} is critically low (${fillPct.toFixed(0)}%)`, severity: 3 });
      }
      // Overflow: >= 95%
      else if (fillPct >= 95 && !unlimited) {
        list.push({ resource: res, type: 'overflow', message: `${RESOURCE_META[res].name} storage is almost full (${fillPct.toFixed(0)}%)`, severity: 2 });
      }
      // Bottleneck: Net negative and stock will run out in < 100 ticks
      else if (netRate < 0 && amount > 0) {
        const ticksUntilEmpty = amount / Math.abs(netRate);
        if (ticksUntilEmpty < 100) {
          list.push({ resource: res, type: 'bottleneck', message: `${RESOURCE_META[res].name} will deplete in ~${Math.ceil(ticksUntilEmpty)} ticks`, severity: 1 });
        }
      }
    }

    return list.sort((a, b) => b.severity - a.severity);
  }, [store.resources, store.resourceCapacity, store.productionSnapshot.production, store.productionSnapshot.actualConsumption, store.productionSnapshot.consumption, allResources, unlimited]);

  // ─── Filtered & Sorted Resources ──────────────────────────────────────────
  const filteredResources = useMemo(() => {
    let resources = allResources;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      resources = resources.filter(r => {
        const meta = RESOURCE_META[r];
        return meta && (meta.name.toLowerCase().includes(q) || r.toLowerCase().includes(q));
      });
    }

    return resources;
  }, [allResources, searchQuery]);

  const groupedResources = useMemo(() => {
    const groups: Record<number, ResourceType[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };

    const sorted = [...filteredResources].sort((a, b) => {
      switch (sortMode) {
        case 'stock': return (store.resources[b] ?? 0) - (store.resources[a] ?? 0);
        case 'rate': {
          const netA = (store.productionSnapshot.production[a] ?? 0) - (store.productionSnapshot.actualConsumption[a] ?? 0);
          const netB = (store.productionSnapshot.production[b] ?? 0) - (store.productionSnapshot.actualConsumption[b] ?? 0);
          return netB - netA;
        }
        case 'capacity': {
          const fillA = store.resourceCapacity[a] > 0 ? (store.resources[a] ?? 0) / store.resourceCapacity[a] : 0;
          const fillB = store.resourceCapacity[b] > 0 ? (store.resources[b] ?? 0) / store.resourceCapacity[b] : 0;
          return fillB - fillA;
        }
        default: return 0; // tier is handled by grouping
      }
    });

    for (const r of sorted) {
      const tier = RESOURCE_META[r]?.tier ?? 0;
      if (groups[tier]) groups[tier].push(r);
    }

    return groups;
  }, [filteredResources, sortMode, store.resources, store.resourceCapacity, store.productionSnapshot.production, store.productionSnapshot.actualConsumption]);

  // ─── Summary Stats ────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    let totalStock = 0;
    let totalCapacity = 0;
    let activeResources = 0;
    let maxedResources = 0;

    for (const res of allResources) {
      const amount = store.resources[res] ?? 0;
      const capacity = store.resourceCapacity[res] ?? 100;
      totalStock += amount;
      if (!unlimited) totalCapacity += capacity;
      if (amount > 0 || (store.productionSnapshot.production[res] ?? 0) > 0) activeResources++;
      if (!unlimited && capacity > 0 && amount >= capacity) maxedResources++;
    }

    return { totalStock, totalCapacity, activeResources, maxedResources, totalTypes: allResources.length };
  }, [store.resources, store.resourceCapacity, store.productionSnapshot.production, allResources, unlimited]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleUpgrade = useCallback((resource: ResourceType) => {
    store.upgradeStorage(resource, 1);
  }, [store]);

  const handleUpgrade5 = useCallback((resource: ResourceType) => {
    store.upgradeStorage(resource, 5);
  }, [store]);

  const toggleResource = useCallback((res: ResourceType) => {
    setExpandedResource(prev => prev === res ? null : res);
  }, []);

  const toggleTier = useCallback((tier: number) => {
    setExpandedTier(prev => prev === tier ? -1 : tier);
  }, []);

  // ─── Render Helpers ───────────────────────────────────────────────────────
  const renderRateBadge = (rate: number, prodRate?: number, consRate?: number) => {
    if (rate > 0) return <span className="text-green-400 font-mono text-[10px]">+{formatNumber(rate)}/s</span>;
    if (rate < 0) return <span className="text-red-400 font-mono text-[10px]">{formatNumber(rate)}/s</span>;
    // When net rate is 0 but the resource is being both produced and consumed (balanced flow),
    // show "±0/s" in cyan to distinguish from idle resources which show "—"
    if (prodRate !== undefined && consRate !== undefined && prodRate > 0 && consRate > 0) {
      return <span className="text-cyan-400 font-mono text-[10px]">±0/s</span>;
    }
    return <span className="text-gray-600 font-mono text-[10px]">—</span>;
  };

  const renderCapacityBar = (amount: number, capacity: number) => {
    if (unlimited) {
      return (
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500/40" style={{ width: '15%' }} />
        </div>
      );
    }
    const pct = capacity > 0 ? Math.min(100, (amount / capacity) * 100) : 0;
    const barColor = pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-cyan-500';
    return (
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    );
  };

  // ─── Resource Detail Card ─────────────────────────────────────────────────
  const renderResourceDetail = (res: ResourceType) => {
    const meta = RESOURCE_META[res];
    if (!meta) return null;

    const amount = store.resources[res] ?? 0;
    const capacity = store.resourceCapacity[res] ?? 100;
    const prodRate = store.productionSnapshot.production[res] ?? 0;
    const consRate = store.productionSnapshot.actualConsumption[res] ?? 0;
    const netRate = prodRate - consRate;
    const fillPct = unlimited ? 0 : (capacity > 0 ? (amount / capacity) * 100 : 0);
    const upgradeLevel = store.storageUpgradeLevels[res] ?? 0;
    const upgradeCost = getStorageUpgradeCost(upgradeLevel);
    const upgradeCost5 = getStorageUpgradeCost(upgradeLevel, 5);
    const deps = resourceDependencies[res];
    const canAfford = store.money >= upgradeCost;

    // ETA to fill/deplete
    let etaLabel = '';
    if (netRate > 0 && !unlimited && capacity > amount) {
      const ticks = (capacity - amount) / netRate;
      etaLabel = `Full in ~${Math.ceil(ticks)}t`;
    } else if (netRate < 0 && amount > 0) {
      const ticks = amount / Math.abs(netRate);
      etaLabel = `Empty in ~${Math.ceil(ticks)}t`;
    }

    return (
      <div
        className="overflow-hidden"
      >
        <div className="mt-2 bg-[#0a0e17] rounded-lg p-3 border border-gray-800/50 space-y-3">
          {/* Rate Breakdown */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3 h-3 text-cyan-400" />
              <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">Rate Breakdown — {meta.name}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="bg-green-900/10 border border-green-800/30 rounded-lg p-2 text-center">
                <div className="text-[9px] text-green-500/70 uppercase tracking-wider">Production</div>
                <div className="text-sm font-bold text-green-400 font-mono">+{formatNumber(prodRate)}</div>
                <div className="text-[9px] text-green-600">per second</div>
              </div>
              <div className="bg-red-900/10 border border-red-800/30 rounded-lg p-2 text-center">
                <div className="text-[9px] text-red-500/70 uppercase tracking-wider">Consumption</div>
                <div className="text-sm font-bold text-red-400 font-mono">-{formatNumber(consRate)}</div>
                <div className="text-[9px] text-red-600">per second</div>
              </div>
              <div className={`${netRate >= 0 ? 'bg-green-900/10 border-green-800/30' : 'bg-orange-900/10 border-orange-800/30'} border rounded-lg p-2 text-center`}>
                <div className="text-[9px] text-gray-500 uppercase tracking-wider">Net Balance</div>
                <div className={`text-sm font-bold font-mono ${netRate > 0 ? 'text-green-400' : netRate < 0 ? 'text-red-400' : prodRate > 0 && consRate > 0 ? 'text-cyan-400' : 'text-gray-500'}`}>
                  {netRate > 0 ? '+' : ''}{netRate === 0 && prodRate > 0 && consRate > 0 ? '±0' : formatNumber(netRate)}
                </div>
                <div className="text-[9px] text-gray-600">per second</div>
              </div>
            </div>
            {etaLabel && (
              <div className={`mt-1.5 text-[10px] font-mono text-center ${netRate > 0 ? 'text-cyan-500' : 'text-orange-400'}`}>
                <GameIcon icon="gi:clockwork" size={12} className="inline" /> {etaLabel}
              </div>
            )}
          </div>

          {/* Storage Upgrade */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Warehouse className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Storage Capacity — {meta.name}</span>
            </div>
            <div className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Current:</span>
                  <span className="text-sm font-bold font-mono text-gray-200">{unlimited ? '∞' : formatNumber(capacity)}</span>
                  <span className="text-[10px] text-gray-600">({formatNumber(amount)} stored)</span>
                </div>
                {upgradeLevel > 0 && (
                  <Badge level={upgradeLevel} />
                )}
              </div>
              {!unlimited && (
                <>
                  {renderCapacityBar(amount, capacity)}
                  <div className="flex items-center justify-between mt-2 text-[10px]">
                    <span className="text-gray-500">Level {upgradeLevel} • +50% base per level</span>
                    <span className={`font-mono ${fillPct >= 95 ? 'text-red-400' : fillPct >= 80 ? 'text-orange-400' : 'text-gray-500'}`}>
                      {fillPct.toFixed(1)}% used
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleUpgrade(res)}
                      disabled={!canAfford}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium ${
                        canAfford
                          ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 hover:bg-amber-600/30 hover:border-amber-500/60'
                          : 'bg-gray-800/30 text-gray-600 border border-gray-700/30 cursor-not-allowed'
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      +1 Level (${formatNumber(upgradeCost)})
                    </button>
                    <button
                      onClick={() => handleUpgrade5(res)}
                      disabled={store.money < upgradeCost5}
                      className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium ${
                        store.money >= upgradeCost5
                          ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-600/30 hover:border-cyan-500/60'
                          : 'bg-gray-800/30 text-gray-600 border border-gray-700/30 cursor-not-allowed'
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      +5 (${formatNumber(upgradeCost5)})
                    </button>
                  </div>
                </>
              )}
              {unlimited && (
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-emerald-400">
                  <Shield className="w-3 h-3" />
                  Unlimited Storage (Terraforming Engine)
                </div>
              )}
            </div>
          </div>

          {/* Production Chains */}
          {deps.chains.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Link2 className="w-3 h-3 text-purple-400" />
                <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Production Chains — {meta.name}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {deps.chains.map((chainName, i) => {
                  const chain = PRODUCTION_CHAINS.find(c => c.name === chainName);
                  return (
                    <TooltipProvider key={i}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="px-2 py-1 rounded-md text-[10px] font-medium border cursor-help"
                            style={{
                              borderColor: `${chain?.color ?? '#666'}44`,
                              backgroundColor: `${chain?.color ?? '#666'}15`,
                              color: chain?.color ?? '#999',
                            }}
                          >
                            {chainName}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-gray-900 border-gray-700 text-gray-200 text-[10px]">
                          <div className="flex items-center gap-1">
                            {chain?.steps.map((step, j) => (
                              <span key={j} className="flex items-center gap-1">
                                <span style={{ color: RESOURCE_META[step as ResourceType]?.color ?? '#999' }}>
                                  <GameIcon icon={RESOURCE_META[step as ResourceType]?.icon} size={14} className="inline-flex" /> {RESOURCE_META[step as ResourceType]?.name ?? step}
                                </span>
                                {j < chain.steps.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-gray-600" />}
                              </span>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>
          )}

          {/* Producers & Consumers */}
          {(deps.producers.length > 0 || deps.consumers.length > 0) && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CircleDot className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Dependency Map — {meta.name}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {deps.producers.length > 0 && (
                  <div className="bg-green-900/10 border border-green-800/30 rounded-lg p-2">
                    <div className="text-[9px] text-green-500 uppercase tracking-wider mb-1.5">Produced By</div>
                    <div className="space-y-1">
                      {deps.producers.slice(0, 5).map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px]">
                          <span className="text-gray-300 truncate">{p.building}</span>
                          <span className="text-green-400 font-mono ml-1">+{formatNumber(p.amount)}/s</span>
                        </div>
                      ))}
                      {deps.producers.length > 5 && (
                        <div className="text-[9px] text-gray-600">+{deps.producers.length - 5} more</div>
                      )}
                    </div>
                  </div>
                )}
                {deps.consumers.length > 0 && (
                  <div className="bg-red-900/10 border border-red-800/30 rounded-lg p-2">
                    <div className="text-[9px] text-red-500 uppercase tracking-wider mb-1.5">Consumed By</div>
                    <div className="space-y-1">
                      {deps.consumers.slice(0, 5).map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px]">
                          <span className="text-gray-300 truncate">{c.building}</span>
                          <span className="text-red-400 font-mono ml-1">-{formatNumber(c.amount)}/s</span>
                        </div>
                      ))}
                      {deps.consumers.length > 5 && (
                        <div className="text-[9px] text-gray-600">+{deps.consumers.length - 5} more</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ─── Resource Row ─────────────────────────────────────────────────────────
  const renderResourceRow = (res: ResourceType) => {
    const meta = RESOURCE_META[res];
    if (!meta) return null;

    const amount = store.resources[res] ?? 0;
    const capacity = store.resourceCapacity[res] ?? 100;
    const prodRate = store.productionSnapshot.production[res] ?? 0;
    const consRate = store.productionSnapshot.actualConsumption[res] ?? 0;
    const netRate = prodRate - consRate;
    const fillPct = unlimited ? 0 : (capacity > 0 ? (amount / capacity) * 100 : 0);
    const isExpanded = expandedResource === res;
    const hasAlert = alerts.some(a => a.resource === res);
    const isActive = amount > 0 || prodRate > 0 || consRate > 0;

    if (!isActive && !searchQuery.trim()) return null;

    return (
      <div key={res} className="border-b border-gray-800/30 last:border-0">
        <button
          onClick={() => toggleResource(res)}
          className={`w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-gray-800/30 text-left ${isExpanded ? 'bg-gray-800/20' : ''}`}
        >
          {/* Color Dot */}
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} />

          {/* Emoji + Name */}
          <div className="flex items-center gap-1.5 min-w-[120px]">
            <GameIcon icon={meta.icon} size={14} className="inline-flex" />
            <span className="text-xs font-medium text-gray-200 truncate">{meta.name}</span>
            {hasAlert && <AlertCircle className="w-3 h-3 text-orange-400 flex-shrink-0" />}
          </div>

          {/* Capacity Bar */}
          <div className="flex-1 min-w-0">
            {renderCapacityBar(amount, capacity)}
          </div>

          {/* Stock / Capacity */}
          <div className="text-right min-w-[80px]">
            <span className="text-xs font-mono text-gray-300">{formatNumber(amount)}</span>
            <span className="text-[10px] text-gray-600">/</span>
            <span className="text-[10px] text-gray-500 font-mono">{unlimited ? '∞' : formatNumber(capacity)}</span>
          </div>

          {/* Net Rate */}
          <div className="min-w-[60px] text-right">
            {renderRateBadge(netRate, prodRate, consRate)}
          </div>

          {/* Expand Chevron */}
          {isExpanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          }
        </button>
        {isExpanded && renderResourceDetail(res)}
      </div>
    );
  };

  // ─── Alerts View ──────────────────────────────────────────────────────────
  const renderAlertsView = () => {
    if (alerts.length === 0) {
      return (
        <div className="text-center py-12">
          <CheckCircle2 className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
          <div className="text-sm text-gray-400">No Storage Alerts</div>
          <div className="text-[10px] text-gray-600 mt-1">All materials are in good standing</div>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto game-scrollbar pr-1">
        {alerts.map((alert, i) => {
          const meta = RESOURCE_META[alert.resource];
          if (!meta) return null;
          const iconMap = {
            critical: <AlertCircle className="w-4 h-4 text-red-400" />,
            shortage: <AlertTriangle className="w-4 h-4 text-orange-400" />,
            overflow: <Package className="w-4 h-4 text-yellow-400" />,
            bottleneck: <Gauge className="w-4 h-4 text-purple-400" />,
          };
          const colorMap = {
            critical: 'border-red-500/40 bg-red-900/10',
            shortage: 'border-orange-500/40 bg-orange-900/10',
            overflow: 'border-yellow-500/40 bg-yellow-900/10',
            bottleneck: 'border-purple-500/40 bg-purple-900/10',
          };
          const labelMap = {
            critical: 'CRITICAL',
            shortage: 'SHORTAGE',
            overflow: 'OVERFLOW',
            bottleneck: 'BOTTLENECK',
          };

          return (
            <div
              key={alert.resource + alert.type}
              className={`flex items-start gap-3 p-3 rounded-lg border ${colorMap[alert.type]}`}
            >
              <div className="mt-0.5">{iconMap[alert.type]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                  <span className="text-sm font-semibold text-gray-200">{meta.name}</span>
                  <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    alert.type === 'critical' ? 'bg-red-500/20 text-red-400' :
                    alert.type === 'shortage' ? 'bg-orange-500/20 text-orange-400' :
                    alert.type === 'overflow' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-purple-500/20 text-purple-400'
                  }`}>
                    {labelMap[alert.type]}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400">{alert.message}</div>
              </div>
              <button
                onClick={() => { setExpandedResource(alert.resource); setViewMode('overview'); }}
                className="text-[9px] text-cyan-400 hover:text-cyan-300 flex-shrink-0 mt-1"
              >
                View →
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Dependencies View ────────────────────────────────────────────────────
  const renderDependenciesView = () => {
    // Build a visual dependency map for all active resources
    const activeResources = allResources.filter(r => {
      const amount = store.resources[r] ?? 0;
      const prodRate = store.productionSnapshot.production[r] ?? 0;
      const consRate = store.productionSnapshot.actualConsumption[r] ?? 0;
      return amount > 0 || prodRate > 0 || consRate > 0;
    });

    return (
      <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto game-scrollbar pr-1">
        {PRODUCTION_CHAINS.filter(chain =>
          chain.steps.some(s => activeResources.includes(s as ResourceType))
        ).map((chain, ci) => {
          const allActive = chain.steps.every(s => activeResources.includes(s as ResourceType));
          const bottleneck = chain.steps.find(s => !activeResources.includes(s as ResourceType));

          return (
            <div
              key={chain.name}
              className={`rounded-lg border p-3 ${
                allActive ? 'bg-gray-900/40 border-green-700/30' : 'bg-gray-900/30 border-gray-700/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: chain.color }} />
                <span className="text-sm font-semibold" style={{ color: chain.color }}>{chain.name}</span>
                {allActive ? (
                  <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-bold">ACTIVE</span>
                ) : bottleneck ? (
                  <span className="text-[8px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">BLOCKED</span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {chain.steps.map((step, si) => {
                  const stepMeta = RESOURCE_META[step as ResourceType];
                  const stepActive = activeResources.includes(step as ResourceType);
                  const stepProd = store.productionSnapshot.production[step] ?? 0;
                  const stepCons = store.productionSnapshot.actualConsumption[step] ?? 0;
                  const stepNet = stepProd - stepCons;

                  return (
                    <div key={step} className="flex items-center gap-1">
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border ${
                        stepActive
                          ? 'bg-gray-800/50 border-gray-600/40'
                          : 'bg-red-900/10 border-red-800/30'
                      }`}>
                        <GameIcon icon={stepMeta?.icon} size={14} className="inline-flex" />
                        <span className={stepActive ? 'text-gray-200' : 'text-red-400/70'}>{stepMeta?.name ?? step}</span>
                        {stepActive && (
                          <span className={`font-mono ${stepNet > 0 ? 'text-green-400' : stepNet < 0 ? 'text-red-400' : stepProd > 0 && stepCons > 0 ? 'text-cyan-400' : 'text-gray-600'}`}>
                            {stepNet > 0 ? '+' : ''}{stepNet === 0 && stepProd > 0 && stepCons > 0 ? '±0' : formatNumber(stepNet)}
                          </span>
                        )}
                      </div>
                      {si < chain.steps.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
              {!allActive && bottleneck && (
                <div className="mt-1.5 text-[10px] text-red-400/70">
                  <GameIcon icon="gi:hazard-sign" size={12} className="inline" /> Blocked at {RESOURCE_META[bottleneck as ResourceType]?.name ?? bottleneck} — no production
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Overview View ────────────────────────────────────────────────────────
  const renderOverviewView = () => (
    <div className="space-y-3">
      {([0, 1, 2, 3, 4] as const).map(tier => {
        const config = TIER_CONFIG[tier];
        const resources = groupedResources[tier];
        const activeInTier = resources.filter(r => {
          const amount = store.resources[r] ?? 0;
          const prodRate = store.productionSnapshot.production[r] ?? 0;
          const consRate = store.productionSnapshot.actualConsumption[r] ?? 0;
          return amount > 0 || prodRate > 0 || consRate > 0;
        });

        if (activeInTier.length === 0 && !searchQuery.trim()) return null;

        const isExpanded = expandedTier === tier;

        return (
          <div key={tier} className="rounded-lg border overflow-hidden" style={{ borderColor: `${config.color}33` }}>
            {/* Tier Header */}
            <button
              onClick={() => toggleTier(tier)}
              className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-gray-800/20"
              style={{ backgroundColor: `${config.color}08` }}
            >
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
              <span className="text-sm font-semibold" style={{ color: config.color }}>{config.label}</span>
              <span className="text-[10px] text-gray-500">
                {activeInTier.length}/{resources.length} active
              </span>
              <div className="flex-1" />
              {/* Tier aggregate net rate */}
              <span className="text-[10px] font-mono text-gray-500">
                {(() => {
                  const tierNet = activeInTier.reduce((sum, r) => {
                    return sum + (store.productionSnapshot.production[r] ?? 0) - (store.productionSnapshot.actualConsumption[r] ?? 0);
                  }, 0);
                  const tierProd = activeInTier.reduce((sum, r) => sum + (store.productionSnapshot.production[r] ?? 0), 0);
                  const tierCons = activeInTier.reduce((sum, r) => sum + (store.productionSnapshot.actualConsumption[r] ?? 0), 0);
                  if (tierNet === 0 && tierProd > 0 && tierCons > 0) return '±0';
                  return tierNet >= 0 ? `+${formatNumber(tierNet)}` : formatNumber(tierNet);
                })()}/s
              </span>
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              }
            </button>

            {/* Tier Resources */}
            <>
              {isExpanded && (
                <div
                  className="overflow-hidden"
                >
                  {activeInTier.length === 0 && searchQuery.trim() ? (
                    <div className="px-3 py-4 text-center text-[10px] text-gray-600">No matching resources</div>
                  ) : (
                    activeInTier.map(res => renderResourceRow(res))
                  )}
                </div>
              )}
            </>
          </div>
        );
      })}
    </div>
  );

  // ─── Main Render ──────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col gap-3 p-4 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-bold text-gray-100 neon-glow-cyan">Storage Management</h2>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-3">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">Total Stock</div>
            <div className="text-lg font-bold font-mono text-gray-200">{formatNumber(summaryStats.totalStock)}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-3">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">Total Capacity</div>
            <div className="text-lg font-bold font-mono text-gray-200">{unlimited ? '∞' : formatNumber(summaryStats.totalCapacity)}</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-3">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">Active Materials</div>
            <div className="text-lg font-bold font-mono text-cyan-400">{summaryStats.activeResources}<span className="text-gray-600">/{summaryStats.totalTypes}</span></div>
          </div>
          <div className="bg-gray-900/50 border border-gray-700/40 rounded-lg p-3">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">Alerts</div>
            <div className={`text-lg font-bold font-mono ${alerts.length > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>{alerts.length}</div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Tabs */}
          <div className="flex bg-gray-900/50 border border-gray-700/40 rounded-lg p-0.5">
            {([
              { mode: 'overview' as ViewMode, label: 'Overview', icon: Layers },
              { mode: 'dependencies' as ViewMode, label: 'Chains', icon: Link2 },
              { mode: 'alerts' as ViewMode, label: `Alerts${alerts.length > 0 ? ` (${alerts.length})` : ''}`, icon: AlertTriangle },
            ]).map(tab => (
              <button
                key={tab.mode}
                onClick={() => setViewMode(tab.mode)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium ${
                  viewMode === tab.mode
                    ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-gray-500 hover:text-gray-300 border border-transparent'
                }`}
              >
                <tab.icon className="w-3 h-3" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort Mode (only for overview) */}
          {viewMode === 'overview' && (
            <div className="flex bg-gray-900/50 border border-gray-700/40 rounded-lg p-0.5">
              {([
                { mode: 'tier' as SortMode, label: 'Tier' },
                { mode: 'stock' as SortMode, label: 'Stock' },
                { mode: 'rate' as SortMode, label: 'Rate' },
                { mode: 'capacity' as SortMode, label: 'Capacity' },
              ]).map(tab => (
                <button
                  key={tab.mode}
                  onClick={() => setSortMode(tab.mode)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium ${
                    sortMode === tab.mode
                      ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30'
                      : 'text-gray-500 hover:text-gray-300 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[140px] max-w-[220px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search materials..."
              className="w-full bg-gray-900/50 border border-gray-700/40 rounded-lg pl-7 pr-7 py-1.5 text-[10px] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-cyan-500/40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3 h-3 text-gray-500 hover:text-gray-300" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto game-scrollbar">
        {viewMode === 'overview' && renderOverviewView()}
        {viewMode === 'dependencies' && renderDependenciesView()}
        {viewMode === 'alerts' && renderAlertsView()}
      </div>
    </div>
  );
}

// ─── Badge Helper ─────────────────────────────────────────────────────────────
function Badge({ level }: { level: number }) {
  const color = level >= 20 ? 'text-emerald-400 bg-emerald-500/20' : level >= 10 ? 'text-cyan-400 bg-cyan-500/20' : 'text-amber-400 bg-amber-500/20';
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${color}`}>
      LV{level}
    </span>
  );
}
