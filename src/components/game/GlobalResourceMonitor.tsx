'use client';

import { useState, useMemo, useCallback } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META, INITIAL_MARKET } from '@/lib/game/data';
import { ResourceType, BuildingType } from '@/lib/game/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Activity, AlertTriangle, ArrowDown, ArrowUp, ArrowRight,
  BarChart3, Box, CheckCircle, ChevronDown, ChevronRight, Clock,
  Database, Droplets, Filter, Gauge, Package, Plus, Minus,
  Search, ShieldAlert, TrendingDown, TrendingUp,
  Warehouse, XCircle, Zap, ArrowUpDown, Eye, Layers,
  Factory, Pickaxe, Flame, Cpu, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────────

type ResourceCategory = 'all' | 'raw' | 'processed' | 'industrial' | 'advanced' | 'power' | 'endgame';
type SortField = 'quantity' | 'productionRate' | 'consumptionRate' | 'netChange' | 'marketValue' | 'storageUtilization';
type SortDirection = 'asc' | 'desc';

interface ResourceData {
  resource: ResourceType;
  name: string;
  emoji: string;
  tier: number;
  color: string;
  category: ResourceCategory;
  quantity: number;
  capacity: number;
  utilization: number;
  productionRate: number;
  consumptionRate: number;
  actualConsumptionRate: number;
  netChange: number;
  marketPrice: number;
  marketTrend: 'up' | 'down' | 'stable';
  status: 'growing' | 'stable' | 'declining' | 'critical' | 'storageFull' | 'empty';
  producers: { buildingType: BuildingType; buildingName: string; count: number }[];
  consumers: { buildingType: BuildingType; buildingName: string; count: number }[];
}

// ─── Category Mapping ──────────────────────────────────────────────────────────────

function getResourceCategory(resource: ResourceType, tier: number): ResourceCategory {
  const rawResources: ResourceType[] = ['iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water', 'rareEarth', 'clay', 'limestone', 'gravel', 'bauxite', 'wolframite'];
  const powerResources: ResourceType[] = ['fossilFuel', 'coolant', 'plasmaCore', 'antimatter'];
  const endgameResources: ResourceType[] = ['singularityCore', 'darkMatterCell', 'warpDrive', 'chronoPart', 'voidCrystal', 'megaStructure'];

  if (rawResources.includes(resource)) return 'raw';
  if (endgameResources.includes(resource)) return 'endgame';
  if (powerResources.includes(resource)) return 'power';
  if (tier === 1) return 'processed';
  if (tier === 2) return 'industrial';
  if (tier >= 3) return 'advanced';
  return 'processed';
}

const CATEGORY_META: Record<ResourceCategory, { label: string; icon: typeof Activity; color: string }> = {
  all: { label: 'All Materials', icon: Layers, color: '#94a3b8' },
  raw: { label: 'Raw Materials', icon: Pickaxe, color: '#a0a0a0' },
  processed: { label: 'Processed Materials', icon: Factory, color: '#f59e0b' },
  industrial: { label: 'Industrial Materials', icon: Cpu, color: '#3b82f6' },
  advanced: { label: 'Advanced Materials', icon: Sparkles, color: '#a855f7' },
  power: { label: 'Power Resources', icon: Flame, color: '#ef4444' },
  endgame: { label: 'Endgame Resources', icon: Activity, color: '#00ffcc' },
};

// ─── Status Colors & Labels ─────────────────────────────────────────────────────────

function getStatusInfo(status: ResourceData['status']) {
  switch (status) {
    case 'growing': return { label: 'Growing', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: TrendingUp };
    case 'stable': return { label: 'Stable', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', icon: Minus };
    case 'declining': return { label: 'Declining', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', icon: TrendingDown };
    case 'critical': return { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertTriangle };
    case 'storageFull': return { label: 'Storage Full', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', icon: Warehouse };
    case 'empty': return { label: 'No Stock', color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: Package };
  }
}

function computeStatus(data: { quantity: number; capacity: number; netChange: number }): ResourceData['status'] {
  const { quantity, capacity, netChange } = data;
  if (quantity <= 0) return 'empty';
  if (capacity > 0 && quantity >= capacity * 0.98) return 'storageFull';
  if (quantity / capacity < 0.1 && netChange < 0) return 'critical';
  if (netChange < -0.5) return 'declining';
  if (netChange > 0.5) return 'growing';
  return 'stable';
}

// ─── Main Component ────────────────────────────────────────────────────────────────

export function GlobalResourceMonitor() {
  const store = useGameStore();

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ResourceCategory>('all');
  const [sortField, setSortField] = useState<SortField>('quantity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedResource, setSelectedResource] = useState<ResourceType | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showHealthMonitor, setShowHealthMonitor] = useState(true);

  // ─── Compute all resource data ─────────────────────────────────────────────────
  const resourceData = useMemo<ResourceData[]>(() => {
    const allResources = Object.keys(RESOURCE_META) as ResourceType[];
    const buildings = store.buildings;

    // Build producer/consumer maps
    const producerMap = new Map<ResourceType, { buildingType: BuildingType; buildingName: string; count: number }[]>();
    const consumerMap = new Map<ResourceType, { buildingType: BuildingType; buildingName: string; count: number }[]>();

    for (const building of buildings) {
      const def = BUILDING_DEFS[building.type];
      if (!def) continue;

      // Producers
      if (def.outputs) {
        for (const output of def.outputs) {
          if (output.resource === 'money') continue;
          const res = output.resource as ResourceType;
          if (!producerMap.has(res)) producerMap.set(res, []);
          const existing = producerMap.get(res)!.find(p => p.buildingType === building.type);
          if (existing) {
            existing.count++;
          } else {
            producerMap.set(res, [...producerMap.get(res)!, { buildingType: building.type, buildingName: def.name, count: 1 }]);
          }
        }
      }

      // Consumers
      if (def.inputs) {
        for (const input of def.inputs) {
          if (input.resource === 'money') continue;
          const res = input.resource as ResourceType;
          if (!consumerMap.has(res)) consumerMap.set(res, []);
          const existing = consumerMap.get(res)!.find(p => p.buildingType === building.type);
          if (existing) {
            existing.count++;
          } else {
            consumerMap.set(res, [...consumerMap.get(res)!, { buildingType: building.type, buildingName: def.name, count: 1 }]);
          }
        }
      }
    }

    return allResources.map(resource => {
      const meta = RESOURCE_META[resource];
      const quantity = store.resources[resource] ?? 0;
      const rawCapacity = store.resourceCapacity[resource] ?? 50;

      // Apply storage research bonus
      const storageBonus = store.completedResearch.includes('storageExpansion') ? 0.5 : 0;
      const capacity = Math.floor(rawCapacity * (1 + storageBonus));

      // Unlimited storage check
      const hasUnlimited = store.megaProjects.some(p => p.completed && p.bonus.type === 'unlimitedStorage');
      const effectiveCapacity = hasUnlimited ? Infinity : capacity;

      const utilization = effectiveCapacity === Infinity ? (quantity > 0 ? 50 : 0) : (effectiveCapacity > 0 ? (quantity / effectiveCapacity) * 100 : 0);
      const productionRate = store.computedProductionRates[resource] ?? 0;
      const consumptionRate = store.computedConsumptionRates[resource] ?? 0;
      const actualConsumptionRate = store.computedActualConsumptionRates[resource] ?? 0;
      const netChange = productionRate - actualConsumptionRate;

      const marketEntry = store.market.find(m => m.resource === resource);
      const marketPrice = marketEntry?.currentPrice ?? 0;
      const marketTrend = marketEntry?.trend ?? 'stable';

      const category = getResourceCategory(resource, meta.tier);
      const status = computeStatus({ quantity, capacity: effectiveCapacity, netChange });

      return {
        resource,
        name: meta.name,
        emoji: meta.emoji,
        tier: meta.tier,
        color: meta.color,
        category,
        quantity,
        capacity: effectiveCapacity,
        utilization,
        productionRate,
        consumptionRate,
        actualConsumptionRate,
        netChange,
        marketPrice,
        marketTrend,
        status,
        producers: producerMap.get(resource) ?? [],
        consumers: consumerMap.get(resource) ?? [],
      };
    });
  }, [store.resources, store.resourceCapacity, store.computedProductionRates, store.computedConsumptionRates, store.computedActualConsumptionRates, store.market, store.buildings, store.completedResearch, store.megaProjects]);

  // ─── Filtered & Sorted Data ────────────────────────────────────────────────────
  const filteredData = useMemo(() => {
    let data = resourceData;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(r => r.name.toLowerCase().includes(q) || r.resource.toLowerCase().includes(q));
    }

    // Category filter
    if (selectedCategory !== 'all') {
      data = data.filter(r => r.category === selectedCategory);
    }

    // Sort
    data.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortField) {
        case 'quantity': aVal = a.quantity; bVal = b.quantity; break;
        case 'productionRate': aVal = a.productionRate; bVal = b.productionRate; break;
        case 'consumptionRate': aVal = a.actualConsumptionRate; bVal = b.actualConsumptionRate; break;
        case 'netChange': aVal = a.netChange; bVal = b.netChange; break;
        case 'marketValue': aVal = a.quantity * a.marketPrice; bVal = b.quantity * b.marketPrice; break;
        case 'storageUtilization': aVal = a.utilization; bVal = b.utilization; break;
        default: aVal = a.quantity; bVal = b.quantity;
      }
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });

    return data;
  }, [resourceData, searchQuery, selectedCategory, sortField, sortDirection]);

  // ─── Summary Stats ─────────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const totalMaterials = resourceData.length;
    const totalStored = resourceData.reduce((sum, r) => sum + r.quantity, 0);
    const totalCapacity = resourceData.reduce((sum, r) => sum + (r.capacity === Infinity ? r.quantity : r.capacity), 0);
    const avgUtilization = totalCapacity > 0 ? (totalStored / totalCapacity) * 100 : 0;
    const lowStock = resourceData.filter(r => r.quantity > 0 && r.utilization < 20).length;
    const criticalStock = resourceData.filter(r => r.status === 'critical').length;
    const fullStorage = resourceData.filter(r => r.status === 'storageFull').length;

    const highestProduced = resourceData.reduce((best, r) => r.productionRate > best.productionRate ? r : best, resourceData[0]);
    const highestConsumed = resourceData.reduce((best, r) => r.actualConsumptionRate > best.actualConsumptionRate ? r : best, resourceData[0]);

    return { totalMaterials, totalStored, totalCapacity, avgUtilization, lowStock, criticalStock, fullStorage, highestProduced, highestConsumed };
  }, [resourceData]);

  // ─── Health Alerts ──────────────────────────────────────────────────────────────
  const healthAlerts = useMemo(() => {
    const alerts: { severity: 'critical' | 'warning' | 'info'; resource: ResourceType; message: string }[] = [];

    for (const r of resourceData) {
      if (r.quantity <= 0 && r.consumers.length > 0 && r.productionRate <= 0) {
        alerts.push({ severity: 'critical', resource: r.resource, message: `${r.name} is depleted but still in demand by ${r.consumers.length} building type(s)` });
      } else if (r.status === 'critical') {
        alerts.push({ severity: 'critical', resource: r.resource, message: `${r.name} critically low (${formatNumber(r.quantity)}/${r.capacity === Infinity ? '∞' : formatNumber(r.capacity)}) with negative net production` });
      } else if (r.netChange < -0.5 && r.utilization < 30) {
        alerts.push({ severity: 'warning', resource: r.resource, message: `${r.name} declining (net: ${r.netChange.toFixed(2)}/t) with low stock (${r.utilization.toFixed(0)}%)` });
      } else if (r.status === 'storageFull' && r.productionRate > r.actualConsumptionRate) {
        alerts.push({ severity: 'info', resource: r.resource, message: `${r.name} at full capacity — production overflow wasted` });
      }
    }

    // Bottleneck detection: resources that are consumed by many but have low production
    for (const r of resourceData) {
      if (r.consumers.length >= 3 && r.productionRate < r.actualConsumptionRate * 0.8 && r.quantity < (r.capacity === Infinity ? 100 : r.capacity * 0.3)) {
        if (!alerts.some(a => a.resource === r.resource && a.severity === 'critical')) {
          alerts.push({ severity: 'warning', resource: r.resource, message: `${r.name} is a bottleneck — consumed by ${r.consumers.length} building types but underproduced` });
        }
      }
    }

    // Overproduced: high production but no consumers
    for (const r of resourceData) {
      if (r.productionRate > 0 && r.consumers.length === 0 && r.status === 'storageFull') {
        alerts.push({ severity: 'info', resource: r.resource, message: `${r.name} overproduced with no consumers — consider selling on market` });
      }
    }

    return alerts.sort((a, b) => {
      const priority = { critical: 0, warning: 1, info: 2 };
      return priority[a.severity] - priority[b.severity];
    });
  }, [resourceData]);

  // ─── Sort Handler ───────────────────────────────────────────────────────────────
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  }, [sortField]);

  // ─── Selected resource detail ──────────────────────────────────────────────────
  const selectedData = useMemo(() => {
    if (!selectedResource) return null;
    return resourceData.find(r => r.resource === selectedResource) ?? null;
  }, [selectedResource, resourceData]);

  // ─── Analytics data ─────────────────────────────────────────────────────────────
  const topProducers = useMemo(() => {
    return [...resourceData].sort((a, b) => b.productionRate - a.productionRate).slice(0, 8);
  }, [resourceData]);

  const topConsumers = useMemo(() => {
    return [...resourceData].sort((a, b) => b.actualConsumptionRate - a.actualConsumptionRate).slice(0, 8);
  }, [resourceData]);

  const utilizationDistribution = useMemo(() => {
    const buckets = { empty: 0, low: 0, medium: 0, high: 0, full: 0 };
    for (const r of resourceData) {
      if (r.quantity <= 0) buckets.empty++;
      else if (r.utilization < 25) buckets.low++;
      else if (r.utilization < 50) buckets.medium++;
      else if (r.utilization < 80) buckets.high++;
      else buckets.full++;
    }
    return buckets;
  }, [resourceData]);

  // ─── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Global Resource Monitor
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Central hub for monitoring all materials, production flow, storage & resource health</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">
            {resourceData.length} Resources Tracked
          </Badge>
        </div>
      </div>

      {/* ── Summary Dashboard Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <SummaryCard
          icon={<Package className="w-4 h-4" />}
          label="Total Materials"
          value={String(summaryStats.totalMaterials)}
          color="text-cyan-400"
          bgColor="bg-cyan-500/10"
        />
        <SummaryCard
          icon={<Database className="w-4 h-4" />}
          label="Total Stored"
          value={formatNumber(summaryStats.totalStored)}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <SummaryCard
          icon={<Warehouse className="w-4 h-4" />}
          label="Avg Utilization"
          value={`${summaryStats.avgUtilization.toFixed(1)}%`}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
          subtext={summaryStats.avgUtilization > 80 ? 'Near capacity!' : summaryStats.avgUtilization < 30 ? 'Low utilization' : 'Healthy'}
        />
        <SummaryCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Critical Stock"
          value={String(summaryStats.criticalStock)}
          color={summaryStats.criticalStock > 0 ? 'text-red-400' : 'text-green-400'}
          bgColor={summaryStats.criticalStock > 0 ? 'bg-red-500/10' : 'bg-green-500/10'}
        />
        <SummaryCard
          icon={<Warehouse className="w-4 h-4" />}
          label="Storage Full"
          value={String(summaryStats.fullStorage)}
          color={summaryStats.fullStorage > 0 ? 'text-orange-400' : 'text-green-400'}
          bgColor={summaryStats.fullStorage > 0 ? 'bg-orange-500/10' : 'bg-green-500/10'}
        />
      </div>

      {/* Top Produced/Consumed mini cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div className="bg-[#111827]/80 rounded-lg border border-cyan-900/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs font-bold text-green-400">Highest Produced</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{summaryStats.highestProduced?.emoji}</span>
            <div>
              <p className="text-sm font-bold text-white">{summaryStats.highestProduced?.name}</p>
              <p className="text-xs text-green-400 font-mono">+{summaryStats.highestProduced?.productionRate.toFixed(2)}/t</p>
            </div>
          </div>
        </div>
        <div className="bg-[#111827]/80 rounded-lg border border-cyan-900/20 p-3">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            <span className="text-xs font-bold text-red-400">Highest Consumed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{summaryStats.highestConsumed?.emoji}</span>
            <div>
              <p className="text-sm font-bold text-white">{summaryStats.highestConsumed?.name}</p>
              <p className="text-xs text-red-400 font-mono">-{summaryStats.highestConsumed?.actualConsumptionRate.toFixed(2)}/t</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Health Monitor ── */}
      <CollapsibleSection
        title="Resource Health Monitor"
        icon={<ShieldAlert className="w-4 h-4" />}
        color="text-red-400"
        isOpen={showHealthMonitor}
        onToggle={() => setShowHealthMonitor(!showHealthMonitor)}
        badge={healthAlerts.length > 0 ? { count: healthAlerts.filter(a => a.severity === 'critical').length, label: 'critical' } : undefined}
      >
        {healthAlerts.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm">All resources are healthy — no issues detected</span>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto game-scrollbar">
            {healthAlerts.slice(0, 15).map((alert, i) => {
              const meta = RESOURCE_META[alert.resource];
              const severityStyles = {
                critical: 'border-red-500/30 bg-red-500/5',
                warning: 'border-yellow-500/30 bg-yellow-500/5',
                info: 'border-blue-500/30 bg-blue-500/5',
              };
              const severityIcons = {
                critical: <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />,
                warning: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />,
                info: <Activity className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />,
              };
              return (
                <motion.div
                  key={`${alert.resource}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`flex items-start gap-2 p-2 rounded-lg border ${severityStyles[alert.severity]} cursor-pointer hover:bg-white/[0.03] transition-colors`}
                  onClick={() => setSelectedResource(alert.resource)}
                >
                  {severityIcons[alert.severity]}
                  <span className="mr-1">{meta?.emoji}</span>
                  <span className="text-xs text-gray-300 flex-1">{alert.message}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[9px] text-cyan-400 hover:text-cyan-300"
                    onClick={(e) => { e.stopPropagation(); setSelectedResource(alert.resource); }}
                  >
                    Details
                  </Button>
                </motion.div>
              );
            })}
            {healthAlerts.length > 15 && (
              <p className="text-xs text-gray-500 text-center py-1">+{healthAlerts.length - 15} more alerts</p>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Analytics Section ── */}
      <CollapsibleSection
        title="Resource Analytics"
        icon={<BarChart3 className="w-4 h-4" />}
        color="text-purple-400"
        isOpen={showAnalytics}
        onToggle={() => setShowAnalytics(!showAnalytics)}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Production vs Consumption */}
          <div className="bg-[#111827]/60 rounded-lg border border-cyan-900/20 p-3">
            <h4 className="text-xs font-bold text-cyan-400 mb-3 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              Production vs Consumption (Top 8)
            </h4>
            <div className="space-y-2">
              {topProducers.map(r => {
                const maxRate = Math.max(r.productionRate, r.actualConsumptionRate, 0.1);
                return (
                  <div key={r.resource} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        {r.emoji} {r.name}
                      </span>
                      <span className="text-[10px] font-mono">
                        <span className="text-green-400">+{r.productionRate.toFixed(1)}</span>
                        <span className="text-gray-600 mx-1">/</span>
                        <span className="text-red-400">-{r.actualConsumptionRate.toFixed(1)}</span>
                      </span>
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800">
                      <div
                        className="bg-green-500/60 transition-all duration-300"
                        style={{ width: `${(r.productionRate / maxRate) * 50}%` }}
                      />
                      <div className="flex-1" />
                      <div
                        className="bg-red-500/60 transition-all duration-300"
                        style={{ width: `${(r.actualConsumptionRate / maxRate) * 50}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Storage Utilization Distribution */}
          <div className="bg-[#111827]/60 rounded-lg border border-cyan-900/20 p-3">
            <h4 className="text-xs font-bold text-cyan-400 mb-3 flex items-center gap-1.5">
              <Warehouse className="w-3.5 h-3.5" />
              Storage Utilization Distribution
            </h4>
            <div className="space-y-2">
              {[
                { label: 'Empty (0%)', count: utilizationDistribution.empty, color: 'bg-gray-500', textColor: 'text-gray-400' },
                { label: 'Low (1-25%)', count: utilizationDistribution.low, color: 'bg-red-500', textColor: 'text-red-400' },
                { label: 'Medium (25-50%)', count: utilizationDistribution.medium, color: 'bg-yellow-500', textColor: 'text-yellow-400' },
                { label: 'High (50-80%)', count: utilizationDistribution.high, color: 'bg-cyan-500', textColor: 'text-cyan-400' },
                { label: 'Full (80%+)', count: utilizationDistribution.full, color: 'bg-green-500', textColor: 'text-green-400' },
              ].map(bucket => {
                const maxCount = Math.max(...Object.values(utilizationDistribution), 1);
                return (
                  <div key={bucket.label} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-28 flex-shrink-0">{bucket.label}</span>
                    <div className="flex-1 h-4 bg-gray-800 rounded overflow-hidden">
                      <div
                        className={`h-full ${bucket.color}/60 transition-all duration-300`}
                        style={{ width: `${(bucket.count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono ${bucket.textColor} w-6 text-right`}>{bucket.count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Most Demanded Resources */}
          <div className="bg-[#111827]/60 rounded-lg border border-cyan-900/20 p-3">
            <h4 className="text-xs font-bold text-cyan-400 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Most Demanded Resources
            </h4>
            <div className="space-y-1.5">
              {topConsumers.map((r, i) => (
                <div key={r.resource} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600 w-3">{i + 1}</span>
                  <span className="text-sm">{r.emoji}</span>
                  <span className="text-[10px] text-gray-300 flex-1">{r.name}</span>
                  <span className="text-[10px] text-red-400 font-mono">-{r.actualConsumptionRate.toFixed(2)}/t</span>
                  <span className="text-[9px] text-gray-500">{r.consumers.length} consumers</span>
                </div>
              ))}
            </div>
          </div>

          {/* Most Produced Resources */}
          <div className="bg-[#111827]/60 rounded-lg border border-cyan-900/20 p-3">
            <h4 className="text-xs font-bold text-cyan-400 mb-3 flex items-center gap-1.5">
              <Factory className="w-3.5 h-3.5" />
              Most Produced Resources
            </h4>
            <div className="space-y-1.5">
              {topProducers.map((r, i) => (
                <div key={r.resource} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-600 w-3">{i + 1}</span>
                  <span className="text-sm">{r.emoji}</span>
                  <span className="text-[10px] text-gray-300 flex-1">{r.name}</span>
                  <span className="text-[10px] text-green-400 font-mono">+{r.productionRate.toFixed(2)}/t</span>
                  <span className="text-[9px] text-gray-500">{r.producers.length} sources</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Search & Filter Bar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input
            placeholder="Search materials..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-8 text-xs bg-[#111827] border-cyan-900/30 pl-8 placeholder:text-gray-600"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(CATEGORY_META) as ResourceCategory[]).map(cat => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const isActive = selectedCategory === cat;
            const count = cat === 'all' ? resourceData.length : resourceData.filter(r => r.category === cat).length;
            return (
              <Button
                key={cat}
                variant="ghost"
                size="sm"
                className={`h-7 px-2 text-[10px] ${isActive ? 'text-cyan-400 bg-cyan-900/20 border border-cyan-500/30' : 'text-gray-500 border border-transparent hover:text-gray-300'}`}
                onClick={() => setSelectedCategory(cat)}
              >
                <Icon className="w-3 h-3 mr-1" />
                {meta.label.split(' ')[0]}
                <span className="ml-1 text-[9px] opacity-60">{count}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* ── Resource Table (Desktop) ── */}
      <div className="hidden lg:block bg-[#111827]/60 rounded-lg border border-cyan-900/20 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[2.5rem_1fr_4rem_5rem_6rem_5rem_5rem_5rem_5.5rem_5rem] items-center gap-0 px-3 py-2 bg-[#0a0e17] border-b border-cyan-900/20 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          <span></span>
          <SortableHeader field="quantity" label="Material" currentField={sortField} direction={sortDirection} onSort={handleSort} />
          <span className="text-center">Tier</span>
          <SortableHeader field="quantity" label="Quantity" currentField={sortField} direction={sortDirection} onSort={handleSort} />
          <SortableHeader field="storageUtilization" label="Storage" currentField={sortField} direction={sortDirection} onSort={handleSort} />
          <SortableHeader field="productionRate" label="Prod/t" currentField={sortField} direction={sortDirection} onSort={handleSort} />
          <SortableHeader field="consumptionRate" label="Cons/t" currentField={sortField} direction={sortDirection} onSort={handleSort} />
          <SortableHeader field="netChange" label="Net/t" currentField={sortField} direction={sortDirection} onSort={handleSort} />
          <SortableHeader field="marketValue" label="Value" currentField={sortField} direction={sortDirection} onSort={handleSort} />
          <span className="text-center">Status</span>
        </div>

        {/* Table Body */}
        <div className="max-h-[60vh] overflow-y-auto game-scrollbar">
          {filteredData.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-gray-500 text-xs">
              No resources match your filters
            </div>
          ) : (
            filteredData.map((r, i) => {
              const statusInfo = getStatusInfo(r.status);
              const StatusIcon = statusInfo.icon;
              const isSelected = selectedResource === r.resource;

              return (
                <motion.div
                  key={r.resource}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.5) }}
                  className={`grid grid-cols-[2.5rem_1fr_4rem_5rem_6rem_5rem_5rem_5rem_5.5rem_5rem] items-center gap-0 px-3 py-1.5 border-b border-cyan-900/10 cursor-pointer transition-colors hover:bg-white/[0.02] ${isSelected ? 'bg-cyan-900/10 border-l-2 border-l-cyan-500' : ''}`}
                  onClick={() => setSelectedResource(isSelected ? null : r.resource)}
                >
                  <span className="text-base text-center">{r.emoji}</span>
                  <span className="text-xs font-medium text-gray-200 truncate">{r.name}</span>
                  <span className="text-[10px] text-center" style={{ color: r.color }}>T{r.tier}</span>
                  <span className="text-[11px] font-mono text-gray-300 text-right pr-2">{formatNumber(r.quantity)}</span>
                  <div className="px-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${r.utilization >= 90 ? 'bg-red-500' : r.utilization >= 70 ? 'bg-yellow-500' : r.utilization >= 40 ? 'bg-cyan-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(r.utilization, 100)}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-gray-500 w-7 text-right">{r.capacity === Infinity ? '∞' : `${r.utilization.toFixed(0)}%`}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-green-400 text-right pr-1">{r.productionRate > 0 ? `+${r.productionRate.toFixed(1)}` : '0'}</span>
                  <span className="text-[10px] font-mono text-red-400 text-right pr-1">{r.actualConsumptionRate > 0 ? `-${r.actualConsumptionRate.toFixed(1)}` : '0'}</span>
                  <span className={`text-[10px] font-mono font-bold text-right pr-1 ${r.netChange > 0.01 ? 'text-green-400' : r.netChange < -0.01 ? 'text-red-400' : 'text-gray-500'}`}>
                    {r.netChange > 0.01 ? `+${r.netChange.toFixed(1)}` : r.netChange < -0.01 ? r.netChange.toFixed(1) : '0'}
                  </span>
                  <span className="text-[10px] font-mono text-amber-400 text-right pr-1">${formatNumber(r.quantity * r.marketPrice)}</span>
                  <div className="flex justify-center">
                    <Badge variant="outline" className={`text-[8px] px-1 py-0 h-4 ${statusInfo.color} ${statusInfo.bg} ${statusInfo.border} border`}>
                      <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                      {statusInfo.label}
                    </Badge>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Resource Cards (Mobile) ── */}
      <div className="lg:hidden space-y-1.5 max-h-[60vh] overflow-y-auto game-scrollbar">
        {filteredData.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-gray-500 text-xs">
            No resources match your filters
          </div>
        ) : (
          filteredData.map((r, i) => {
            const statusInfo = getStatusInfo(r.status);
            const StatusIcon = statusInfo.icon;
            const isSelected = selectedResource === r.resource;

            return (
              <motion.div
                key={r.resource}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.015, 0.4) }}
                className={`bg-[#111827]/80 rounded-lg border p-2.5 cursor-pointer transition-colors active:scale-[0.99] ${isSelected ? 'border-cyan-500/50 bg-cyan-900/10' : 'border-cyan-900/20 hover:border-cyan-900/40'}`}
                onClick={() => setSelectedResource(isSelected ? null : r.resource)}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{r.emoji}</span>
                    <div>
                      <span className="text-xs font-medium text-gray-200">{r.name}</span>
                      <span className="text-[9px] ml-1.5" style={{ color: r.color }}>T{r.tier}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[8px] px-1 py-0 h-4 ${statusInfo.color} ${statusInfo.bg} ${statusInfo.border} border`}>
                    <StatusIcon className="w-2.5 h-2.5 mr-0.5" />
                    {statusInfo.label}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-gray-400">
                    <span className="font-mono text-gray-200">{formatNumber(r.quantity)}</span>
                    <span className="text-gray-600">/{r.capacity === Infinity ? '∞' : formatNumber(r.capacity)}</span>
                  </span>
                  <span className="text-green-400 font-mono">+{r.productionRate.toFixed(1)}</span>
                  <span className="text-red-400 font-mono">-{r.actualConsumptionRate.toFixed(1)}</span>
                  <span className={`font-mono font-bold ${r.netChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {r.netChange >= 0 ? '+' : ''}{r.netChange.toFixed(1)}
                  </span>
                  <span className="text-amber-400 font-mono ml-auto">${formatNumber(r.quantity * r.marketPrice)}</span>
                </div>

                {/* Storage bar */}
                <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${r.utilization >= 90 ? 'bg-red-500' : r.utilization >= 70 ? 'bg-yellow-500' : 'bg-cyan-500'}`}
                    style={{ width: `${Math.min(r.utilization, 100)}%` }}
                  />
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* ── Resource Detail Panel ── */}
      <AnimatePresence>
        {selectedData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="bg-[#111827] border-cyan-900/30">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-xl">{selectedData.emoji}</span>
                    <span className="text-white">{selectedData.name}</span>
                    <Badge variant="outline" className="text-[9px]" style={{ color: selectedData.color, borderColor: selectedData.color + '60' }}>
                      Tier {selectedData.tier}
                    </Badge>
                    {(() => {
                      const si = getStatusInfo(selectedData.status);
                      const SI = si.icon;
                      return (
                        <Badge variant="outline" className={`text-[9px] ${si.color} ${si.bg} ${si.border} border`}>
                          <SI className="w-2.5 h-2.5 mr-0.5" />
                          {si.label}
                        </Badge>
                      );
                    })()}
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-500" onClick={() => setSelectedResource(null)}>
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-3">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <DetailStat label="Quantity" value={formatNumber(selectedData.quantity)} sub={`of ${selectedData.capacity === Infinity ? '∞' : formatNumber(selectedData.capacity)}`} />
                  <DetailStat label="Production" value={`+${selectedData.productionRate.toFixed(2)}/t`} color="text-green-400" />
                  <DetailStat label="Consumption" value={`-${selectedData.actualConsumptionRate.toFixed(2)}/t`} color="text-red-400" />
                  <DetailStat label="Net Change" value={`${selectedData.netChange >= 0 ? '+' : ''}${selectedData.netChange.toFixed(2)}/t`} color={selectedData.netChange >= 0 ? 'text-green-400' : 'text-red-400'} />
                  <DetailStat label="Market Price" value={`$${formatNumber(selectedData.marketPrice)}/unit`} color="text-amber-400" />
                  <DetailStat label="Total Value" value={`$${formatNumber(selectedData.quantity * selectedData.marketPrice)}`} color="text-amber-400" />
                  <DetailStat label="Storage Util." value={`${selectedData.utilization.toFixed(1)}%`} color={selectedData.utilization >= 90 ? 'text-red-400' : 'text-cyan-400'} />
                  <DetailStat label="Market Trend" value={selectedData.marketTrend === 'up' ? '📈 Rising' : selectedData.marketTrend === 'down' ? '📉 Falling' : '➡️ Stable'} />
                </div>

                {/* Storage bar */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-500">Storage</span>
                    <span className="text-gray-400 font-mono">{formatNumber(selectedData.quantity)} / {selectedData.capacity === Infinity ? '∞' : formatNumber(selectedData.capacity)}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        selectedData.utilization >= 90 ? 'bg-red-500' :
                        selectedData.utilization >= 70 ? 'bg-yellow-500' :
                        'bg-cyan-500'
                      }`}
                      style={{ width: `${Math.min(selectedData.utilization, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Production Chain Visibility */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Producers */}
                  <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-2.5">
                    <h5 className="text-[10px] font-bold text-green-400 mb-2 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Producing Buildings ({selectedData.producers.length})
                    </h5>
                    {selectedData.producers.length === 0 ? (
                      <p className="text-[10px] text-gray-600">No producing buildings</p>
                    ) : (
                      <div className="space-y-1">
                        {selectedData.producers.map(p => {
                          const pDef = BUILDING_DEFS[p.buildingType];
                          const outputAmount = pDef?.outputs?.find(o => o.resource === selectedData.resource)?.amount ?? 0;
                          return (
                            <div key={p.buildingType} className="flex items-center justify-between text-[10px]">
                              <span className="text-gray-300">{pDef?.emoji} {p.buildingName}</span>
                              <span className="text-gray-500">{p.count}× → +{(outputAmount * p.count).toFixed(1)}/t</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Consumers */}
                  <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-2.5">
                    <h5 className="text-[10px] font-bold text-red-400 mb-2 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      Consuming Buildings ({selectedData.consumers.length})
                    </h5>
                    {selectedData.consumers.length === 0 ? (
                      <p className="text-[10px] text-gray-600">No consuming buildings</p>
                    ) : (
                      <div className="space-y-1">
                        {selectedData.consumers.map(c => {
                          const cDef = BUILDING_DEFS[c.buildingType];
                          const inputAmount = cDef?.inputs?.find(inp => inp.resource === selectedData.resource)?.amount ?? 0;
                          return (
                            <div key={c.buildingType} className="flex items-center justify-between text-[10px]">
                              <span className="text-gray-300">{cDef?.emoji} {c.buildingName}</span>
                              <span className="text-gray-500">{c.count}× → -{(inputAmount * c.count).toFixed(1)}/t</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Related Production Chains */}
                <div className="bg-[#0a0e17] rounded-lg border border-cyan-900/20 p-2.5">
                  <h5 className="text-[10px] font-bold text-cyan-400 mb-2 flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    Production Chain Involvement
                  </h5>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedData.producers.map(p => {
                      const pDef = BUILDING_DEFS[p.buildingType];
                      return (
                        <Badge key={`prod-${p.buildingType}`} variant="outline" className="text-[9px] border-green-500/30 text-green-400 bg-green-500/5">
                          {pDef?.emoji} Produced by {p.buildingName}
                        </Badge>
                      );
                    })}
                    {selectedData.consumers.map(c => {
                      const cDef = BUILDING_DEFS[c.buildingType];
                      const outputs = cDef?.outputs?.filter(o => o.resource !== 'money').map(o => {
                        const oMeta = RESOURCE_META[o.resource as ResourceType];
                        return oMeta?.emoji + ' ' + oMeta?.name;
                      }).join(', ') ?? '';
                      return (
                        <Badge key={`cons-${c.buildingType}`} variant="outline" className="text-[9px] border-red-500/30 text-red-400 bg-red-500/5">
                          {cDef?.emoji} Used for {outputs || c.buildingName}
                        </Badge>
                      );
                    })}
                    {selectedData.producers.length === 0 && selectedData.consumers.length === 0 && (
                      <span className="text-[10px] text-gray-600">Not involved in any active production chains</span>
                    )}
                  </div>
                </div>

                {/* Quick Navigation */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-500">Navigate:</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] border-cyan-900/30 text-cyan-400 hover:bg-cyan-900/20"
                    onClick={() => store.setActiveTab('market')}
                  >
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Market
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] border-cyan-900/30 text-cyan-400 hover:bg-cyan-900/20"
                    onClick={() => store.setActiveTab('chains')}
                  >
                    <Layers className="w-3 h-3 mr-1" />
                    Production Chains
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] border-cyan-900/30 text-cyan-400 hover:bg-cyan-900/20"
                    onClick={() => store.setActiveTab('storage')}
                  >
                    <Warehouse className="w-3 h-3 mr-1" />
                    Storage
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Low Stock / Shortage Analysis ── */}
      {(() => {
        const shortageResources = resourceData.filter(r => r.quantity > 0 && r.utilization < 15 && r.actualConsumptionRate > 0);
        const negativeNetResources = resourceData.filter(r => r.netChange < -0.01);
        if (shortageResources.length === 0 && negativeNetResources.length === 0) return null;

        return (
          <div className="bg-[#111827]/60 rounded-lg border border-red-900/20 p-3">
            <h4 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Resource Shortage Analysis
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {shortageResources.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 mb-1.5">Low Stock & In Demand ({shortageResources.length})</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto game-scrollbar">
                    {shortageResources.slice(0, 10).map(r => (
                      <div key={r.resource} className="flex items-center gap-2 text-[10px] cursor-pointer hover:bg-white/[0.02] rounded px-1 py-0.5" onClick={() => setSelectedResource(r.resource)}>
                        <span>{r.emoji}</span>
                        <span className="text-gray-300 flex-1">{r.name}</span>
                        <span className="text-red-400 font-mono">{r.utilization.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {negativeNetResources.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 mb-1.5">Negative Net Production ({negativeNetResources.length})</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto game-scrollbar">
                    {negativeNetResources.sort((a, b) => a.netChange - b.netChange).slice(0, 10).map(r => (
                      <div key={r.resource} className="flex items-center gap-2 text-[10px] cursor-pointer hover:bg-white/[0.02] rounded px-1 py-0.5" onClick={() => setSelectedResource(r.resource)}>
                        <span>{r.emoji}</span>
                        <span className="text-gray-300 flex-1">{r.name}</span>
                        <span className="text-red-400 font-mono">{r.netChange.toFixed(2)}/t</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Footer Stats */}
      <div className="flex items-center justify-between text-[10px] text-gray-600 border-t border-cyan-900/10 pt-2">
        <span>Showing {filteredData.length} of {resourceData.length} resources</span>
        <span>Updated Tick {formatNumber(store.gameTick)}</span>
      </div>
    </div>
  );
}

// ─── Sub-Components ────────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, color, bgColor, subtext }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bgColor: string;
  subtext?: string;
}) {
  return (
    <div className={`${bgColor} rounded-lg border border-cyan-900/20 p-2.5`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={color}>{icon}</span>
        <span className="text-[10px] text-gray-500 font-medium">{label}</span>
      </div>
      <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
      {subtext && <p className="text-[9px] text-gray-500 mt-0.5">{subtext}</p>}
    </div>
  );
}

function DetailStat({ label, value, color, sub }: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="bg-[#0a0e17] rounded-md p-2">
      <p className="text-[9px] text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xs font-bold font-mono ${color ?? 'text-white'}`}>{value}</p>
      {sub && <p className="text-[9px] text-gray-600">{sub}</p>}
    </div>
  );
}

function SortableHeader({ field, label, currentField, direction, onSort }: {
  field: SortField;
  label: string;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentField === field;
  return (
    <button
      className={`flex items-center gap-0.5 hover:text-gray-300 transition-colors ${isActive ? 'text-cyan-400' : ''}`}
      onClick={() => onSort(field)}
    >
      <span>{label}</span>
      {isActive && (
        direction === 'desc' ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />
      )}
    </button>
  );
}

function CollapsibleSection({ title, icon, color, isOpen, onToggle, badge, children }: {
  title: string;
  icon: React.ReactNode;
  color: string;
  isOpen: boolean;
  onToggle: () => void;
  badge?: { count: number; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#111827]/60 rounded-lg border border-cyan-900/20 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className={color}>{icon}</span>
          <span className="text-xs font-bold text-gray-300">{title}</span>
          {badge && badge.count > 0 && (
            <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 bg-red-500/10 h-4 px-1">
              {badge.count} {badge.label}
            </Badge>
          )}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 pb-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
