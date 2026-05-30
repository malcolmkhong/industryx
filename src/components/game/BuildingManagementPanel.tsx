'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import {
  BuildingInstance,
  BuildingConditionStatus,
  getConditionStatus,
  getConditionColor,
  getConditionStatusLabel,
  MaintenanceLogEntry,
  RegionId,
} from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Wrench,
  AlertTriangle,
  Activity,
  BarChart3,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Factory,
  Pickaxe,
  Zap,
  Shield,
  Heart,
  TrendingDown,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ScrollText,
  Bell,
  Bot,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Sub-tab type ────────────────────────────────────────────────────────────
type SubTab = 'overview' | 'maintenance' | 'analytics' | 'log' | 'alerts';

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'maintenance', label: 'Maintenance', icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: 'log', label: 'Log', icon: <ScrollText className="w-3.5 h-3.5" /> },
  { id: 'alerts', label: 'Alerts', icon: <Bell className="w-3.5 h-3.5" /> },
];

// ─── Sort configuration ──────────────────────────────────────────────────────
type SortField = 'name' | 'type' | 'region' | 'level' | 'condition' | 'status' | 'efficiency' | 'operational' | 'repairCost' | 'detRate';
type SortDir = 'asc' | 'desc';

// ─── Helper: get category label ──────────────────────────────────────────────
function getCategoryLabel(cat: string): string {
  switch (cat) {
    case 'extractor': return 'Extractor';
    case 'factory': return 'Factory';
    case 'power': return 'Power';
    case 'storage': return 'Storage';
    default: return cat;
  }
}

function getCategoryIcon(cat: string): React.ReactNode {
  switch (cat) {
    case 'extractor': return <Pickaxe className="w-3 h-3 text-amber-400" />;
    case 'factory': return <Factory className="w-3 h-3 text-orange-400" />;
    case 'power': return <Zap className="w-3 h-3 text-yellow-400" />;
    default: return <Factory className="w-3 h-3 text-gray-400" />;
  }
}

// ─── Helper: get repair cost for a building ──────────────────────────────────
function getRepairCost(b: BuildingInstance): number {
  const condition = b.condition ?? 100;
  if (condition >= 100) return 0;
  const def = BUILDING_DEFS[b.type];
  if (!def) return 0;
  const baseRepairCost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 100;
  return Math.max(1, Math.floor(baseRepairCost * (100 - condition) / 100 * b.level));
}

// ─── Helper: get region name ─────────────────────────────────────────────────
function getRegionName(regionId: string | undefined, mapRegions: { id: string; name: string; emoji: string }[]): string {
  if (!regionId) return '—';
  const region = mapRegions.find(r => r.id === regionId);
  return region ? `${region.emoji} ${region.name}` : regionId;
}

// ─── Helper: event type badge ────────────────────────────────────────────────
function getEventTypeBadge(eventType: MaintenanceLogEntry['eventType']): { icon: string; label: string; color: string } {
  switch (eventType) {
    case 'storm_damage': return { icon: '⛈️', label: 'Storm', color: 'text-blue-400 bg-blue-900/30 border-blue-500/30' };
    case 'earthquake_damage': return { icon: '🌋', label: 'Earthquake', color: 'text-orange-400 bg-orange-900/30 border-orange-500/30' };
    case 'power_overload_damage': return { icon: '⚡', label: 'Overload', color: 'text-yellow-400 bg-yellow-900/30 border-yellow-500/30' };
    case 'deterioration': return { icon: '📉', label: 'Deterioration', color: 'text-gray-400 bg-gray-800/50 border-gray-600/30' };
    case 'condition_warning': return { icon: '⚠️', label: 'Warning', color: 'text-yellow-400 bg-yellow-900/30 border-yellow-500/30' };
    case 'critical_warning': return { icon: '🔴', label: 'Critical', color: 'text-red-400 bg-red-900/30 border-red-500/30' };
    case 'broken': return { icon: '💥', label: 'Broken', color: 'text-red-500 bg-red-900/40 border-red-500/40' };
    case 'repair': return { icon: '🔧', label: 'Repair', color: 'text-green-400 bg-green-900/30 border-green-500/30' };
    case 'self_repair': return { icon: '🤖', label: 'Self-Repair', color: 'text-cyan-400 bg-cyan-900/30 border-cyan-500/30' };
  }
}

// ─── Helper: condition bar component ─────────────────────────────────────────
function ConditionBar({ condition, className = '' }: { condition: number; className?: string }) {
  const color = getConditionColor(condition);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.max(0, Math.min(100, condition))}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono w-10 text-right" style={{ color }}>{Math.round(condition)}%</span>
    </div>
  );
}

// ─── Helper: status badge ────────────────────────────────────────────────────
function StatusBadge({ condition }: { condition: number }) {
  const status = getConditionStatus(condition);
  const label = getConditionStatusLabel(status);
  const colorMap: Record<BuildingConditionStatus, string> = {
    pristine: 'text-green-400 bg-green-900/30 border-green-500/30',
    good: 'text-emerald-400 bg-emerald-900/30 border-emerald-500/30',
    worn: 'text-yellow-400 bg-yellow-900/30 border-yellow-500/30',
    damaged: 'text-orange-400 bg-orange-900/30 border-orange-500/30',
    critical: 'text-red-400 bg-red-900/30 border-red-500/30',
    broken: 'text-red-600 bg-red-900/40 border-red-500/40',
  };
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${colorMap[status]}`}>
      {label}
    </Badge>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function BuildingManagementPanel() {
  const store = useGameStore();
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRegion, setFilterRegion] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('condition');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string>('all');

  const buildings = store.buildings;
  const mapRegions = store.mapRegions;

  // ─── Computed building data ────────────────────────────────────────────────
  const buildingData = useMemo(() => {
    return buildings.map(b => {
      const def = BUILDING_DEFS[b.type];
      if (!def) return null;
      const repairCost = getRepairCost(b);
      const status = getConditionStatus(b.condition);
      const regionName = getRegionName(b.regionId, mapRegions);
      return {
        ...b,
        // Normalize potentially missing fields from old saves
        efficiency: b.efficiency ?? 0,
        condition: b.condition ?? 100,
        deteriorationRate: b.deteriorationRate ?? 0.01,
        lastDamageTick: b.lastDamageTick ?? 0,
        def,
        repairCost,
        status,
        regionName,
        categoryName: getCategoryLabel(def.category),
        categoryKey: def.category,
      };
    }).filter(Boolean) as (BuildingInstance & {
      def: NonNullable<ReturnType<typeof BUILDING_DEFS[keyof typeof BUILDING_DEFS]>>;
      repairCost: number;
      status: BuildingConditionStatus;
      regionName: string;
      categoryName: string;
      categoryKey: string;
    })[];
  }, [buildings, mapRegions]);

  // ─── Filtered + sorted buildings ──────────────────────────────────────────
  const filteredBuildings = useMemo(() => {
    let result = [...buildingData];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => b.def.name.toLowerCase().includes(q));
    }

    // Filter region
    if (filterRegion !== 'all') {
      result = result.filter(b => b.regionId === filterRegion);
    }

    // Filter category
    if (filterCategory !== 'all') {
      result = result.filter(b => b.categoryKey === filterCategory);
    }

    // Filter status
    if (filterStatus !== 'all') {
      result = result.filter(b => b.status === filterStatus);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.def.name.localeCompare(b.def.name); break;
        case 'type': cmp = a.categoryKey.localeCompare(b.categoryKey); break;
        case 'region': cmp = (a.regionId ?? '').localeCompare(b.regionId ?? ''); break;
        case 'level': cmp = a.level - b.level; break;
        case 'condition': cmp = a.condition - b.condition; break;
        case 'status': cmp = a.condition - b.condition; break;
        case 'efficiency': cmp = a.efficiency - b.efficiency; break;
        case 'operational': cmp = (a.active ? 1 : 0) - (b.active ? 1 : 0); break;
        case 'repairCost': cmp = a.repairCost - b.repairCost; break;
        case 'detRate': cmp = a.deteriorationRate - b.deteriorationRate; break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [buildingData, searchQuery, filterRegion, filterCategory, filterStatus, sortField, sortDir]);

  // ─── Summary stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = buildingData.length;
    const healthy = buildingData.filter(b => b.condition >= 75).length;
    const needMaintenance = buildingData.filter(b => b.condition >= 25 && b.condition < 75).length;
    const critical = buildingData.filter(b => b.condition >= 1 && b.condition < 25).length;
    const broken = buildingData.filter(b => b.condition <= 0).length;
    const avgCondition = total > 0 ? buildingData.reduce((sum, b) => sum + b.condition, 0) / total : 0;
    const totalRepairCost = buildingData.reduce((sum, b) => sum + b.repairCost, 0);
    const selfRepairActive = store.automationUnlocks.find(a => a.type === 'selfRepair' && a.active);
    const buildingsWaiting = buildingData.filter(b => b.condition < 100).length;

    // Condition distribution
    const distribution: Record<BuildingConditionStatus, number> = {
      pristine: buildingData.filter(b => b.condition >= 100).length,
      good: buildingData.filter(b => b.condition >= 75 && b.condition < 100).length,
      worn: buildingData.filter(b => b.condition >= 50 && b.condition < 75).length,
      damaged: buildingData.filter(b => b.condition >= 25 && b.condition < 50).length,
      critical: buildingData.filter(b => b.condition >= 1 && b.condition < 25).length,
      broken: buildingData.filter(b => b.condition <= 0).length,
    };

    // Average by category
    const byCategory: Record<string, { avg: number; count: number }> = {};
    for (const b of buildingData) {
      if (!byCategory[b.categoryKey]) byCategory[b.categoryKey] = { avg: 0, count: 0 };
      byCategory[b.categoryKey].avg += b.condition;
      byCategory[b.categoryKey].count++;
    }
    for (const key of Object.keys(byCategory)) {
      byCategory[key].avg = byCategory[key].count > 0 ? byCategory[key].avg / byCategory[key].count : 0;
    }

    // Average by region
    const byRegion: Record<string, { avg: number; count: number; name: string }> = {};
    for (const b of buildingData) {
      const rId = b.regionId ?? 'unknown';
      if (!byRegion[rId]) {
        const region = mapRegions.find(r => r.id === rId);
        byRegion[rId] = { avg: 0, count: 0, name: region ? region.name : rId };
      }
      byRegion[rId].avg += b.condition;
      byRegion[rId].count++;
    }
    for (const key of Object.keys(byRegion)) {
      byRegion[key].avg = byRegion[key].count > 0 ? byRegion[key].avg / byRegion[key].count : 0;
    }

    // Most damaged buildings
    const mostDamaged = [...buildingData].sort((a, b) => a.condition - b.condition).slice(0, 5);

    // Highest deterioration rate
    const highestDetRate = [...buildingData].sort((a, b) => b.deteriorationRate - a.deteriorationRate).slice(0, 5);

    return {
      total, healthy, needMaintenance, critical, broken,
      avgCondition, totalRepairCost, selfRepairActive: !!selfRepairActive,
      buildingsWaiting, distribution, byCategory, byRegion,
      mostDamaged, highestDetRate,
    };
  }, [buildingData, store.automationUnlocks, mapRegions]);

  // ─── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = useCallback((field: SortField) => {
    setSortDir(prev => sortField === field && prev === 'asc' ? 'desc' : 'asc');
    setSortField(field);
  }, [sortField]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-gray-600" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-cyan-400" /> : <ChevronDown className="w-3 h-3 text-cyan-400" />;
  };

  // ─── Filtered log entries ─────────────────────────────────────────────────
  const filteredLog = useMemo(() => {
    if (logFilter === 'all') return store.maintenanceLog;
    return store.maintenanceLog.filter(e => e.eventType === logFilter);
  }, [store.maintenanceLog, logFilter]);

  // ─── Alert groups ─────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const below75 = buildingData.filter(b => b.condition < 75 && b.condition >= 50);
    const below50 = buildingData.filter(b => b.condition < 50 && b.condition >= 25);
    const below25 = buildingData.filter(b => b.condition < 25 && b.condition >= 1);
    const brokenB = buildingData.filter(b => b.condition <= 0);
    const highDet = buildingData.filter(b => b.deteriorationRate > 0.03);
    return { below75, below50, below25, broken: brokenB, highDet };
  }, [buildingData]);

  // ─── Unique regions / categories for filter dropdowns ─────────────────────
  const regions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of buildingData) {
      if (b.regionId && !seen.has(b.regionId)) {
        const region = mapRegions.find(r => r.id === b.regionId);
        seen.set(b.regionId, region ? `${region.emoji} ${region.name}` : b.regionId);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [buildingData, mapRegions]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const b of buildingData) {
      seen.add(b.categoryKey);
    }
    return Array.from(seen);
  }, [buildingData]);

  // ─── Selected building detail ─────────────────────────────────────────────
  const selectedBuilding = useMemo(() => {
    if (!selectedBuildingId) return null;
    return buildingData.find(b => b.id === selectedBuildingId) ?? null;
  }, [selectedBuildingId, buildingData]);

  // ─── Efficiency impact calculation ────────────────────────────────────────
  const getEfficiencyImpact = (condition: number) => {
    if (condition >= 75) return 0;
    return Math.round((1 - condition / 75) * 100);
  };

  // ─── Deterioration factors for detail panel ───────────────────────────────
  const getDeteriorationFactors = (b: typeof buildingData[0]) => {
    const def = b.def;
    const baseRate = b.deteriorationRate ?? 0.01;
    const ageInTicks = store.gameTick - (b.placedAt ?? 0);
    const ageFactor = 1 + Math.min(2, ageInTicks / 100000);
    const weatherFactor = store.weather.current === 'stormy' ? 2.5
      : store.weather.current === 'rainy' ? 1.5
      : store.weather.current === 'snowy' ? 1.3 : 1;
    const overloadFactor = store.powerGrid.overload ? 1.5 : 1;
    const assignedWorkers = store.workers.filter(w => w.assignedTo === b.id).length;
    const workerFactor = assignedWorkers > 0 ? 0.5 : 1;
    const totalRate = baseRate * ageFactor * weatherFactor * overloadFactor * workerFactor;
    return { baseRate, ageFactor, weatherFactor, overloadFactor, workerFactor, totalRate, assignedWorkers };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-bold text-orange-400">Building Management</h2>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              subTab === tab.id
                ? 'text-orange-400 bg-orange-900/30 border border-orange-500/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.05] border border-transparent'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto game-scrollbar">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={subTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {subTab === 'overview' && renderOverview()}
            {subTab === 'maintenance' && renderMaintenance()}
            {subTab === 'analytics' && renderAnalytics()}
            {subTab === 'log' && renderLog()}
            {subTab === 'alerts' && renderAlerts()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Building Detail Sheet */}
      <Sheet open={!!selectedBuilding} onOpenChange={(open) => { if (!open) setSelectedBuildingId(null); }}>
        <SheetContent side="right" className="bg-[#111827] border-cyan-900/30 text-gray-100 w-[400px] sm:w-[440px] overflow-y-auto game-scrollbar">
          {selectedBuilding && renderBuildingDetail(selectedBuilding)}
        </SheetContent>
      </Sheet>
    </div>
  );

  // ─── OVERVIEW TAB ──────────────────────────────────────────────────────────
  function renderOverview() {
    return (
      <div className="flex flex-col gap-4">
        {/* Health Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryCard icon={<Factory className="w-4 h-4 text-cyan-400" />} label="Total Buildings" value={stats.total} color="text-cyan-400" />
          <SummaryCard icon={<Heart className="w-4 h-4 text-green-400" />} label="Healthy (≥75%)" value={stats.healthy} color="text-green-400" />
          <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-yellow-400" />} label="Need Maintenance" value={stats.needMaintenance} color="text-yellow-400" />
          <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-red-400" />} label="Critical (<25%)" value={stats.critical} color="text-red-400" />
          <SummaryCard icon={<XCircle className="w-4 h-4 text-red-600" />} label="Broken (0%)" value={stats.broken} color="text-red-600" />
          <SummaryCard
            icon={<Activity className="w-4 h-4" style={{ color: getConditionColor(stats.avgCondition) }} />}
            label="Avg Condition"
            value={`${stats.avgCondition.toFixed(1)}%`}
            color=""
            valueStyle={{ color: getConditionColor(stats.avgCondition) }}
          />
          <SummaryCard icon={<span className="text-sm">💰</span>} label="Total Repair Cost" value={`$${formatNumber(stats.totalRepairCost)}`} color="text-green-400" />
          <SummaryCard
            icon={stats.selfRepairActive ? <Bot className="w-4 h-4 text-cyan-400" /> : <Bot className="w-4 h-4 text-gray-600" />}
            label="Auto-Repair"
            value={stats.selfRepairActive ? 'Active' : 'Inactive'}
            color={stats.selfRepairActive ? 'text-cyan-400' : 'text-gray-500'}
          />
        </div>

        {/* Building Table */}
        <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-3">
          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <Input
                placeholder="Search buildings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 text-xs bg-[#0a0e17] border-cyan-900/30 pl-7 placeholder:text-gray-600"
              />
            </div>
            <select
              value={filterRegion}
              onChange={(e) => setFilterRegion(e.target.value)}
              className="h-7 text-xs bg-[#0a0e17] border border-cyan-900/30 rounded-md px-2 text-gray-300"
            >
              <option value="all">All Regions</option>
              {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-7 text-xs bg-[#0a0e17] border border-cyan-900/30 rounded-md px-2 text-gray-300"
            >
              <option value="all">All Types</option>
              {categories.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-7 text-xs bg-[#0a0e17] border border-cyan-900/30 rounded-md px-2 text-gray-300"
            >
              <option value="all">All Status</option>
              <option value="pristine">Pristine</option>
              <option value="good">Good</option>
              <option value="worn">Worn</option>
              <option value="damaged">Damaged</option>
              <option value="critical">Critical</option>
              <option value="broken">Broken</option>
            </select>
            <span className="text-[10px] text-gray-500">
              {filteredBuildings.length}/{buildingData.length} buildings
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-cyan-900/20">
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-300" onClick={() => handleSort('name')}>
                    <span className="flex items-center gap-1">Building <SortIcon field="name" /></span>
                  </th>
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-300 hidden sm:table-cell" onClick={() => handleSort('type')}>
                    <span className="flex items-center gap-1">Type <SortIcon field="type" /></span>
                  </th>
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium hidden md:table-cell">Region</th>
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-300" onClick={() => handleSort('condition')}>
                    <span className="flex items-center gap-1">Condition <SortIcon field="condition" /></span>
                  </th>
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium hidden sm:table-cell">Status</th>
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-300 hidden md:table-cell" onClick={() => handleSort('efficiency')}>
                    <span className="flex items-center gap-1">Eff. <SortIcon field="efficiency" /></span>
                  </th>
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium hidden lg:table-cell">Repair</th>
                  <th className="text-left py-1.5 px-2 text-gray-500 font-medium cursor-pointer hover:text-gray-300 hidden lg:table-cell" onClick={() => handleSort('detRate')}>
                    <span className="flex items-center gap-1">Det.Rate <SortIcon field="detRate" /></span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredBuildings.slice(0, 50).map(b => (
                  <tr
                    key={b.id}
                    onClick={() => setSelectedBuildingId(b.id)}
                    className="border-b border-gray-800/50 hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{b.def.emoji}</span>
                        <span className="text-gray-200 truncate max-w-[120px]">{b.def.name}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 hidden sm:table-cell">
                      <div className="flex items-center gap-1">
                        {getCategoryIcon(b.categoryKey)}
                        <span className="text-gray-400">{b.categoryName}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-gray-400 hidden md:table-cell">{b.regionName}</td>
                    <td className="py-1.5 px-2">
                      <ConditionBar condition={b.condition} className="w-24" />
                    </td>
                    <td className="py-1.5 px-2 hidden sm:table-cell">
                      <StatusBadge condition={b.condition} />
                    </td>
                    <td className="py-1.5 px-2 hidden md:table-cell">
                      <span className={`font-mono ${(b.efficiency ?? 0) >= 0.8 ? 'text-green-400' : (b.efficiency ?? 0) >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {((b.efficiency ?? 0) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-1.5 px-2 hidden lg:table-cell">
                      {b.repairCost > 0 ? (
                        <span className="text-green-400 font-mono">${formatNumber(b.repairCost)}</span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 hidden lg:table-cell">
                      <span className="text-gray-400 font-mono">{(b.deteriorationRate ?? 0.01).toFixed(3)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredBuildings.length > 50 && (
              <p className="text-[10px] text-gray-500 mt-2 text-center">Showing 50 of {filteredBuildings.length} buildings</p>
            )}
            {filteredBuildings.length === 0 && (
              <p className="text-xs text-gray-500 py-4 text-center">No buildings match your filters</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── MAINTENANCE TAB ───────────────────────────────────────────────────────
  function renderMaintenance() {
    const canRepairAll = store.money >= stats.totalRepairCost && stats.buildingsWaiting > 0;

    return (
      <div className="flex flex-col gap-4">
        {/* Actions */}
        <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-4">
          <h3 className="text-sm font-bold text-orange-400 mb-3 flex items-center gap-2">
            <Wrench className="w-4 h-4" /> Maintenance Center
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {/* Repair All */}
            <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Repair All Buildings</span>
                <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400">
                  {stats.buildingsWaiting} buildings
                </Badge>
              </div>
              <div className="text-lg font-bold text-green-400 mb-2">${formatNumber(stats.totalRepairCost)}</div>
              <Button
                size="sm"
                className="w-full h-8 text-xs bg-green-900/40 hover:bg-green-800/50 text-green-400 border border-green-500/30"
                disabled={!canRepairAll}
                onClick={() => store.repairAllBuildings()}
              >
                <Wrench className="w-3 h-3 mr-1" />
                Repair All ({stats.buildingsWaiting})
              </Button>
            </div>

            {/* Auto-repair toggle */}
            <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Self-Repair Automation</span>
                <Badge variant="outline" className={`text-[10px] ${stats.selfRepairActive ? 'border-cyan-500/30 text-cyan-400 bg-cyan-900/20' : 'border-gray-700 text-gray-500'}`}>
                  {stats.selfRepairActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="text-sm text-gray-300 mb-2">
                {stats.selfRepairActive
                  ? 'Automatically repairs buildings over time'
                  : 'Unlock via Automation tab'
                }
              </div>
              {!stats.selfRepairActive && (
                <Button
                  size="sm"
                  className="w-full h-8 text-xs bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-400 border border-cyan-500/30"
                  onClick={() => store.setActiveTab('automation')}
                >
                  <ArrowRight className="w-3 h-3 mr-1" />
                  Go to Automation
                </Button>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-[#0a0e17] rounded border border-cyan-900/10">
              <div className="text-[10px] text-gray-500 mb-0.5">Waiting for Repair</div>
              <div className="text-lg font-bold text-yellow-400">{stats.buildingsWaiting}</div>
            </div>
            <div className="text-center p-2 bg-[#0a0e17] rounded border border-cyan-900/10">
              <div className="text-[10px] text-gray-500 mb-0.5">Avg Efficiency Loss</div>
              <div className="text-lg font-bold text-orange-400">
                {stats.buildingsWaiting > 0
                  ? `${(buildingData.filter(b => b.condition < 100).reduce((sum, b) => sum + getEfficiencyImpact(b.condition), 0) / Math.max(1, stats.buildingsWaiting)).toFixed(0)}%`
                  : '0%'
                }
              </div>
            </div>
            <div className="text-center p-2 bg-[#0a0e17] rounded border border-cyan-900/10">
              <div className="text-[10px] text-gray-500 mb-0.5">Broken Buildings</div>
              <div className="text-lg font-bold text-red-500">{stats.broken}</div>
            </div>
          </div>
        </div>

        {/* Quick repair list */}
        <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-3">
          <h3 className="text-xs font-bold text-gray-400 mb-2">Damaged Buildings</h3>
          <div className="max-h-80 overflow-y-auto game-scrollbar space-y-1">
            {buildingData.filter(b => b.condition < 100).sort((a, b) => a.condition - b.condition).map(b => (
              <div
                key={b.id}
                className="flex items-center gap-2 p-2 rounded bg-[#0a0e17] border border-cyan-900/10 hover:border-cyan-900/30 transition-colors"
              >
                <span className="text-sm">{b.def.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-200 truncate">{b.def.name}</div>
                  <ConditionBar condition={b.condition} className="mt-0.5" />
                </div>
                <span className="text-xs text-green-400 font-mono">${formatNumber(b.repairCost)}</span>
                <Button
                  size="sm"
                  className="h-6 text-[10px] px-2 bg-green-900/40 hover:bg-green-800/50 text-green-400 border border-green-500/30"
                  disabled={store.money < b.repairCost}
                  onClick={(e) => { e.stopPropagation(); store.repairBuilding(b.id); }}
                >
                  <Wrench className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {buildingData.filter(b => b.condition < 100).length === 0 && (
              <div className="text-xs text-gray-500 text-center py-4">
                <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-green-400" />
                All buildings are in good condition!
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── ANALYTICS TAB ─────────────────────────────────────────────────────────
  function renderAnalytics() {
    const distEntries = Object.entries(stats.distribution) as [BuildingConditionStatus, number][];
    const maxDist = Math.max(...distEntries.map(([, v]) => v), 1);

    return (
      <div className="flex flex-col gap-4">
        {/* Condition Distribution */}
        <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-4">
          <h3 className="text-xs font-bold text-gray-400 mb-3">Condition Distribution</h3>
          <div className="space-y-2">
            {distEntries.map(([status, count]) => {
              const pct = maxDist > 0 ? (count / maxDist) * 100 : 0;
              const colorMap: Record<BuildingConditionStatus, string> = {
                pristine: '#4ade80', good: '#34d399', worn: '#facc15', damaged: '#f97316', critical: '#ef4444', broken: '#991b1b',
              };
              const labelMap: Record<BuildingConditionStatus, string> = {
                pristine: 'Pristine (100%)', good: 'Good (75-99%)', worn: 'Worn (50-74%)', damaged: 'Damaged (25-49%)', critical: 'Critical (1-24%)', broken: 'Broken (0%)',
              };
              return (
                <div key={status} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-28 text-right">{labelMap[status]}</span>
                  <div className="flex-1 h-4 bg-gray-800 rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: colorMap[status] }} />
                  </div>
                  <span className="text-xs font-mono w-6 text-right" style={{ color: colorMap[status] }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Average Condition Gauge + Most Damaged + Highest Det Rate */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Average Condition */}
          <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-4 flex flex-col items-center justify-center">
            <h3 className="text-xs font-bold text-gray-400 mb-3">Average Condition</h3>
            <div className="relative w-28 h-28">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke={getConditionColor(stats.avgCondition)}
                  strokeWidth="8"
                  strokeDasharray={`${stats.avgCondition * 2.64} 264`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold" style={{ color: getConditionColor(stats.avgCondition) }}>
                  {stats.avgCondition.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Most Damaged */}
          <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-4">
            <h3 className="text-xs font-bold text-gray-400 mb-3">Most Damaged Buildings</h3>
            <div className="space-y-2">
              {stats.mostDamaged.map(b => (
                <div key={b.id} className="flex items-center gap-2">
                  <span className="text-sm">{b.def.emoji}</span>
                  <span className="text-[10px] text-gray-300 truncate flex-1">{b.def.name}</span>
                  <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(1, b.condition)}%`, backgroundColor: getConditionColor(b.condition) }} />
                  </div>
                  <span className="text-[10px] font-mono w-8 text-right" style={{ color: getConditionColor(b.condition) }}>{Math.round(b.condition)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Highest Deterioration Rate + Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Highest Det Rate */}
          <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-4">
            <h3 className="text-xs font-bold text-gray-400 mb-3">Highest Deterioration Rate</h3>
            <div className="space-y-2">
              {stats.highestDetRate.map(b => (
                <div key={b.id} className="flex items-center gap-2">
                  <span className="text-sm">{b.def.emoji}</span>
                  <span className="text-[10px] text-gray-300 truncate flex-1">{b.def.name}</span>
                  <TrendingDown className="w-3 h-3 text-red-400" />
                  <span className="text-[10px] font-mono text-red-400">{(b.deteriorationRate ?? 0.01).toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Breakdown by Type */}
          <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-4">
            <h3 className="text-xs font-bold text-gray-400 mb-3">Avg Condition by Type</h3>
            <div className="space-y-2">
              {Object.entries(stats.byCategory).map(([cat, data]) => (
                <div key={cat} className="flex items-center gap-2">
                  {getCategoryIcon(cat)}
                  <span className="text-[10px] text-gray-300 w-16">{getCategoryLabel(cat)}</span>
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${data.avg}%`, backgroundColor: getConditionColor(data.avg) }} />
                  </div>
                  <span className="text-[10px] font-mono w-10 text-right" style={{ color: getConditionColor(data.avg) }}>{data.avg.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Breakdown by Region */}
        <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-4">
          <h3 className="text-xs font-bold text-gray-400 mb-3">Avg Condition by Region</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(stats.byRegion).map(([regionId, data]) => (
              <div key={regionId} className="flex items-center gap-2 bg-[#0a0e17] rounded p-2 border border-cyan-900/10">
                <span className="text-[10px] text-gray-300 flex-1">{data.name}</span>
                <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${data.avg}%`, backgroundColor: getConditionColor(data.avg) }} />
                </div>
                <span className="text-[10px] font-mono w-10 text-right" style={{ color: getConditionColor(data.avg) }}>{data.avg.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── LOG TAB ───────────────────────────────────────────────────────────────
  function renderLog() {
    return (
      <div className="flex flex-col gap-3">
        {/* Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">Filter:</span>
          <select
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            className="h-6 text-xs bg-[#0a0e17] border border-cyan-900/30 rounded px-2 text-gray-300"
          >
            <option value="all">All Events</option>
            <option value="storm_damage">⛈️ Storm</option>
            <option value="earthquake_damage">🌋 Earthquake</option>
            <option value="power_overload_damage">⚡ Overload</option>
            <option value="deterioration">📉 Deterioration</option>
            <option value="condition_warning">⚠️ Warning</option>
            <option value="critical_warning">🔴 Critical</option>
            <option value="broken">💥 Broken</option>
            <option value="repair">🔧 Repair</option>
            <option value="self_repair">🤖 Self-Repair</option>
          </select>
          <span className="text-[10px] text-gray-500 ml-auto">{filteredLog.length} entries</span>
        </div>

        {/* Log table */}
        <div className="bg-[#111827] rounded-lg border border-cyan-900/20 overflow-hidden">
          <div className="max-h-[500px] overflow-y-auto game-scrollbar">
            {filteredLog.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-8">
                <ScrollText className="w-6 h-6 mx-auto mb-2 text-gray-600" />
                No maintenance log entries yet. Events will appear as buildings take damage or get repaired.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0d1220] z-10">
                  <tr className="border-b border-cyan-900/20">
                    <th className="text-left py-1.5 px-2 text-gray-500 font-medium">Tick</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-medium">Building</th>
                    <th className="text-left py-1.5 px-2 text-gray-500 font-medium">Event</th>
                    <th className="text-right py-1.5 px-2 text-gray-500 font-medium">Change</th>
                    <th className="text-right py-1.5 px-2 text-gray-500 font-medium hidden sm:table-cell">After</th>
                    <th className="text-right py-1.5 px-2 text-gray-500 font-medium hidden md:table-cell">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.map(entry => {
                    const badge = getEventTypeBadge(entry.eventType);
                    const isDamage = entry.conditionChange < 0;
                    const isRepair = entry.eventType === 'repair' || entry.eventType === 'self_repair';
                    const rowBg = isRepair ? 'bg-green-900/5' : isDamage && Math.abs(entry.conditionChange) > 5 ? 'bg-red-900/5' : '';

                    return (
                      <tr key={entry.id} className={`border-b border-gray-800/30 ${rowBg}`}>
                        <td className="py-1.5 px-2 text-gray-500 font-mono">{entry.tick}</td>
                        <td className="py-1.5 px-2 text-gray-300">{entry.buildingName}</td>
                        <td className="py-1.5 px-2">
                          <Badge variant="outline" className={`text-[9px] px-1 py-0 border ${badge.color}`}>
                            {badge.icon} {badge.label}
                          </Badge>
                        </td>
                        <td className={`py-1.5 px-2 text-right font-mono ${entry.conditionChange > 0 ? 'text-green-400' : entry.conditionChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                          {entry.conditionChange > 0 ? '+' : ''}{(entry.conditionChange ?? 0).toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-gray-400 hidden sm:table-cell">{(entry.conditionAfter ?? 0).toFixed(1)}%</td>
                        <td className="py-1.5 px-2 text-right font-mono text-green-400 hidden md:table-cell">
                          {entry.repairCost ? `$${formatNumber(entry.repairCost)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── ALERTS TAB ────────────────────────────────────────────────────────────
  function renderAlerts() {
    const alertGroups = [
      { label: 'Broken Buildings', buildings: alerts.broken, color: 'text-red-600', bg: 'bg-red-900/10', border: 'border-red-500/30', icon: <XCircle className="w-4 h-4 text-red-600" /> },
      { label: 'Critical Condition (<25%)', buildings: alerts.below25, color: 'text-red-400', bg: 'bg-red-900/5', border: 'border-red-500/20', icon: <AlertTriangle className="w-4 h-4 text-red-400" /> },
      { label: 'Damaged (<50%)', buildings: alerts.below50, color: 'text-orange-400', bg: 'bg-orange-900/5', border: 'border-orange-500/20', icon: <AlertTriangle className="w-4 h-4 text-orange-400" /> },
      { label: 'Worn (<75%)', buildings: alerts.below75, color: 'text-yellow-400', bg: 'bg-yellow-900/5', border: 'border-yellow-500/20', icon: <AlertTriangle className="w-4 h-4 text-yellow-400" /> },
      { label: 'High Deterioration Rate (>0.03)', buildings: alerts.highDet, color: 'text-purple-400', bg: 'bg-purple-900/5', border: 'border-purple-500/20', icon: <TrendingDown className="w-4 h-4 text-purple-400" /> },
    ];

    const totalAlerts = alertGroups.reduce((sum, g) => sum + g.buildings.length, 0);

    return (
      <div className="flex flex-col gap-3">
        {totalAlerts === 0 ? (
          <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-8 text-center">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-sm font-bold text-green-400">All Clear!</p>
            <p className="text-xs text-gray-500 mt-1">No buildings need immediate attention</p>
          </div>
        ) : (
          alertGroups.map(group => {
            if (group.buildings.length === 0) return null;
            return (
              <div key={group.label} className={`rounded-lg border p-3 ${group.bg} ${group.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  {group.icon}
                  <span className={`text-xs font-bold ${group.color}`}>{group.label}</span>
                  <Badge variant="outline" className={`text-[10px] ${group.border} ${group.color}`}>
                    {group.buildings.length}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {group.buildings.map(b => (
                    <div key={b.id} className="flex items-center gap-2 bg-[#0a0e17]/50 rounded p-2">
                      <span className="text-sm">{b.def.emoji}</span>
                      <span className="text-xs text-gray-200 flex-1 truncate">{b.def.name}</span>
                      <ConditionBar condition={b.condition} className="w-20" />
                      {b.repairCost > 0 && (
                        <Button
                          size="sm"
                          className="h-5 text-[9px] px-1.5 bg-green-900/40 hover:bg-green-800/50 text-green-400 border border-green-500/30"
                          disabled={store.money < b.repairCost}
                          onClick={() => store.repairBuilding(b.id)}
                        >
                          🔧 ${formatNumber(b.repairCost)}
                        </Button>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            className="h-5 w-5 p-0 bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-400 border border-cyan-500/30"
                            onClick={() => {
                              store.selectBuilding(b.id);
                              store.setActiveTab('factoryMap');
                            }}
                          >
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-[#111827] border-cyan-900/30">
                          <p className="text-xs">Go to building on map</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  }

  // ─── BUILDING DETAIL PANEL ─────────────────────────────────────────────────
  function renderBuildingDetail(b: typeof buildingData[0]) {
    const detFactors = getDeteriorationFactors(b);
    const baseRepairCost = b.def.baseCost.find(c => c.resource === 'money')?.amount ?? 100;
    const repairCostBreakdown = b.condition < 100
      ? `Base $${formatNumber(baseRepairCost)} × ${(100 - b.condition).toFixed(0)}% deficit × Lv.${b.level} = $${formatNumber(b.repairCost)}`
      : null;

    return (
      <div className="flex flex-col gap-4 p-2">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <span className="text-2xl">{b.def.emoji}</span>
            <div>
              <div className="text-base font-bold text-gray-100">{b.def.name}</div>
              <div className="text-[10px] text-gray-400">{getCategoryLabel(b.categoryKey)} · Level {b.level}</div>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Condition */}
        <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Current Condition</span>
            <StatusBadge condition={b.condition} />
          </div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(0, b.condition)}%`, backgroundColor: getConditionColor(b.condition) }} />
            </div>
            <span className="text-lg font-bold font-mono" style={{ color: getConditionColor(b.condition) }}>{Math.round(b.condition)}%</span>
          </div>
          <div className="text-[10px] text-gray-500">
            Efficiency Impact: <span className={getEfficiencyImpact(b.condition) > 0 ? 'text-red-400' : 'text-green-400'}>
              {getEfficiencyImpact(b.condition) > 0 ? `-${getEfficiencyImpact(b.condition)}%` : 'None'}
            </span>
          </div>
        </div>

        {/* Operational Status */}
        <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
          <span className="text-xs text-gray-400">Operational Status</span>
          <div className="flex items-center gap-2 mt-1">
            {b.active ? (
              <Badge className="bg-green-900/30 text-green-400 border-green-500/30 text-[10px]">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Active
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-900/20 text-red-400 border-red-500/30 text-[10px]">
                <XCircle className="w-3 h-3 mr-1" /> {b.condition <= 0 ? 'Broken' : 'Inactive'}
              </Badge>
            )}
            <span className="text-xs text-gray-400 font-mono">
              Efficiency: <span className={(b.efficiency ?? 0) >= 0.8 ? 'text-green-400' : (b.efficiency ?? 0) >= 0.5 ? 'text-yellow-400' : 'text-red-400'}>
                {((b.efficiency ?? 0) * 100).toFixed(0)}%
              </span>
            </span>
          </div>
        </div>

        {/* Deterioration Factors */}
        <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
          <span className="text-xs text-gray-400">Deterioration Factors</span>
          <div className="space-y-1.5 mt-2">
            <FactorRow label="Base Rate" value={detFactors.baseRate.toFixed(4)} />
            <FactorRow label="Age Modifier" value={`×${detFactors.ageFactor.toFixed(2)}`} highlight={detFactors.ageFactor > 1.5} />
            <FactorRow label="Weather" value={`×${detFactors.weatherFactor.toFixed(1)}`} highlight={detFactors.weatherFactor > 1} extra={store.weather.current !== 'clear' ? store.weather.current : ''} />
            <FactorRow label="Power Overload" value={`×${detFactors.overloadFactor.toFixed(1)}`} highlight={detFactors.overloadFactor > 1} />
            <FactorRow label="Worker Maintenance" value={`×${detFactors.workerFactor.toFixed(1)}`} highlight={detFactors.workerFactor < 1} extra={detFactors.assignedWorkers > 0 ? `${detFactors.assignedWorkers} worker(s)` : ''} />
            <div className="border-t border-gray-800 pt-1.5 flex justify-between items-center">
              <span className="text-[10px] text-gray-300 font-medium">Total Rate</span>
              <span className="text-[10px] font-mono text-orange-400 font-bold">{detFactors.totalRate.toFixed(4)}/cycle</span>
            </div>
          </div>
        </div>

        {/* Repair Cost Breakdown */}
        {repairCostBreakdown && (
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
            <span className="text-xs text-gray-400">Repair Cost Breakdown</span>
            <div className="text-[10px] text-gray-300 mt-1 font-mono">{repairCostBreakdown}</div>
          </div>
        )}

        {/* Location */}
        <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
          <span className="text-xs text-gray-400">Location</span>
          <div className="text-xs text-gray-300 mt-1">{b.regionName}</div>
          {b.gridRow !== undefined && b.gridCol !== undefined && (
            <div className="text-[10px] text-gray-500 mt-0.5">Grid: Row {b.gridRow}, Col {b.gridCol}</div>
          )}
        </div>

        {/* Maintenance Status */}
        <div className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/10">
          <span className="text-xs text-gray-400">Maintenance Status</span>
          <div className="space-y-1 mt-1">
            <div className="text-[10px] text-gray-300">Last Damage: Tick {b.lastDamageTick || '—'}</div>
            <div className="text-[10px] text-gray-300">Self-Repair: {stats.selfRepairActive ? 'Active' : 'Inactive'}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-2">
          {b.condition < 100 && (
            <Button
              className="w-full h-9 text-xs bg-green-900/40 hover:bg-green-800/50 text-green-400 border border-green-500/30"
              disabled={store.money < b.repairCost}
              onClick={() => store.repairBuilding(b.id)}
            >
              <Wrench className="w-3.5 h-3.5 mr-1" />
              Repair for ${formatNumber(b.repairCost)}
            </Button>
          )}
          <Button
            className="w-full h-9 text-xs bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-400 border border-cyan-500/30"
            onClick={() => {
              store.selectBuilding(b.id);
              store.setActiveTab('factoryMap');
              setSelectedBuildingId(null);
            }}
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1" />
            Go to Building on Map
          </Button>
          <Button
            className={`w-full h-9 text-xs border ${
              (b.condition ?? 100) <= 0 && !b.active
                ? 'bg-red-900/20 text-red-400 border-red-500/30 cursor-not-allowed opacity-60'
                : 'bg-gray-800/40 hover:bg-gray-700/50 text-gray-300 border-gray-600/30'
            }`}
            onClick={() => store.toggleBuilding(b.id)}
            disabled={(b.condition ?? 100) <= 0 && !b.active}
          >
            {(b.condition ?? 100) <= 0 && !b.active ? <XCircle className="w-3.5 h-3.5 mr-1" /> : b.active ? <XCircle className="w-3.5 h-3.5 mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            {(b.condition ?? 100) <= 0 && !b.active ? 'Broken — Repair First' : b.active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      </div>
    );
  }
}

// ─── Helper Components ────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  color,
  valueStyle,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="bg-[#111827] rounded-lg border border-cyan-900/20 p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-gray-500">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color}`} style={valueStyle}>
        {value}
      </div>
    </div>
  );
}

function FactorRow({ label, value, highlight, extra }: { label: string; value: string; highlight?: boolean; extra?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-gray-400">{label}</span>
      <span className={`text-[10px] font-mono ${highlight ? 'text-yellow-400' : 'text-gray-300'}`}>
        {value}
        {extra && <span className="text-gray-500 ml-1">({extra})</span>}
      </span>
    </div>
  );
}
