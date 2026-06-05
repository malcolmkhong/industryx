// Global Resource Monitor Panel — Real-time resource intelligence & navigation control
'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, Search, AlertTriangle, TrendingUp, TrendingDown,
  Zap, Link2, Navigation, ChevronUp, ChevronDown, Filter,
  ArrowUpDown, Package, BarChart3, Database, AlertCircle,
} from 'lucide-react';
import { useGameStore, formatNumber, hasUnlimitedStorage } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import { ResourceType, GameTab } from '@/lib/game/types';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { GameIcon } from '@/components/game/shared/GameIcon';

// ─── Tier Badge Colors ────────────────────────────────────────────────────────
const TIER_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: 'bg-gray-800', text: 'text-gray-300', border: 'border-gray-600' },
  1: { bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-600' },
  2: { bg: 'bg-cyan-900/30', text: 'text-cyan-400', border: 'border-cyan-600' },
  3: { bg: 'bg-purple-900/30', text: 'text-purple-400', border: 'border-purple-600' },
  4: { bg: 'bg-rose-900/30', text: 'text-rose-400', border: 'border-rose-600' },
};

// ─── Resource Status ──────────────────────────────────────────────────────────
type ResourceStatus = 'critical' | 'declining' | 'stable' | 'idle';

interface ResourceRowData {
  resource: ResourceType;
  name: string;
  icon: string;
  tier: number;
  amount: number;
  capacity: number;
  productionRate: number;
  consumptionRate: number;
  netRate: number;
  status: ResourceStatus;
  isBottleneck: boolean;
  fillPct: number;
}

// ─── Sort Type ────────────────────────────────────────────────────────────────
type SortKey = 'name' | 'amount' | 'netRate' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_ORDER: Record<ResourceStatus, number> = {
  critical: 0,
  declining: 1,
  stable: 2,
  idle: 3,
};

const STATUS_LABELS: Record<ResourceStatus, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-900/30' },
  declining: { label: 'Declining', color: 'text-orange-400', bg: 'bg-orange-900/30' },
  stable: { label: 'Stable', color: 'text-green-400', bg: 'bg-green-900/30' },
  idle: { label: 'Idle', color: 'text-gray-500', bg: 'bg-gray-800/50' },
};

// ─── Producers/Consumers lookup (precomputed) ─────────────────────────────────
function buildDependencyMaps() {
  const producers: Record<string, { type: string; name: string }[]> = {};
  const consumers: Record<string, { type: string; name: string }[]> = {};

  for (const [bType, bDef] of Object.entries(BUILDING_DEFS)) {
    // Buildings that produce this resource
    if (bDef.outputs) {
      for (const out of bDef.outputs) {
        if (out.resource === 'money') continue;
        const res = out.resource as string;
        if (!producers[res]) producers[res] = [];
        producers[res].push({ type: bType, name: bDef.name });
      }
    }
    // Buildings that consume this resource
    if (bDef.inputs) {
      for (const inp of bDef.inputs) {
        if (inp.resource === 'money') continue;
        const res = inp.resource as string;
        if (!consumers[res]) consumers[res] = [];
        consumers[res].push({ type: bType, name: bDef.name });
      }
    }
  }

  return { producers, consumers };
}

const { producers: PRODUCER_MAP, consumers: CONSUMER_MAP } = buildDependencyMaps();

// ─── Custom Hook: useResourceHover ────────────────────────────────────────────
interface HoverState {
  resource: ResourceType | null;
  overlayLeft: number;
  overlayTop: number;
}

function useResourceHover(
  getContainerRect: () => DOMRect | undefined,
  showDelay = 200,
  hideDelay = 300,
) {
  const [hover, setHover] = useState<HoverState>({ resource: null, overlayLeft: 0, overlayTop: 0 });
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const onEnter = useCallback((resource: ResourceType, e: React.MouseEvent) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    const rowRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const containerRect = getContainerRect();
    const overlayWidth = 288; // w-72
    const overlayHeight = 350;

    // Center horizontally on the resource table container
    let left = containerRect
      ? containerRect.left + containerRect.width / 2 - overlayWidth / 2
      : rowRect.right + 12;
    left = Math.max(8, Math.min(left, window.innerWidth - overlayWidth - 8));

    // Align vertically with the hovered row
    let top = rowRect.top;
    top = Math.max(8, Math.min(top, window.innerHeight - overlayHeight - 8));

    showTimer.current = setTimeout(() => {
      setHover({ resource, overlayLeft: left, overlayTop: top });
    }, showDelay);
  }, [showDelay, getContainerRect]);

  const onLeave = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    hideTimer.current = setTimeout(() => {
      setHover({ resource: null, overlayLeft: 0, overlayTop: 0 });
    }, hideDelay);
  }, [hideDelay]);

  return { hover, onEnter, onLeave, cancelHide };
}

// ─── Custom Hook: useResourceHighlight ────────────────────────────────────────
function useResourceHighlight() {
  const highlightAndNavigate = useCallback((tab: GameTab) => {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.classList.add('resource-focus-highlight');
      setTimeout(() => {
        mainEl.classList.remove('resource-focus-highlight');
      }, 3000);
    }
  }, []);

  return { highlightAndNavigate };
}

// ─── Determine navigation target for a resource ──────────────────────────────
function getNavTargetForResource(resource: ResourceType): GameTab {
  const meta = RESOURCE_META[resource];
  if (!meta) return 'resources';

  // T0 raw → resources (Extraction tab)
  if (meta.tier === 0) return 'resources';
  // T1-T4 → factories
  return 'factories';
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function GlobalResourceMonitorPanel() {
  const store = useGameStore();

  // Filters & sorting state
  const [tierFilter, setTierFilter] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);

  // Hover state
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const getContainerRect = useCallback(() => tableContainerRef.current?.getBoundingClientRect(), []);
  const { hover, onEnter, onLeave, cancelHide } = useResourceHover(getContainerRect);
  const { highlightAndNavigate } = useResourceHighlight();

  // Toast auto-dismiss
  const toastIdRef = useRef(0);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ─── Compute resource rows ──────────────────────────────────────────────
  const allResources = useMemo<ResourceRowData[]>(() => {
    const unlimited = hasUnlimitedStorage(store.megaProjects);
    return (Object.keys(RESOURCE_META) as ResourceType[]).map((res) => {
      const meta = RESOURCE_META[res];
      const amount = store.resources[res] ?? 0;
      const capacity = unlimited ? Infinity : (store.resourceCapacity[res] ?? 50);
      const prodRate = store.productionSnapshot.production[res] ?? 0;
      const consRate = store.productionSnapshot.consumption[res] ?? 0;
      const netRate = prodRate - consRate;
      const fillPct = capacity === Infinity ? 0 : (amount / capacity) * 100;

      // Status determination
      const lowStock = capacity !== Infinity && amount < capacity * 0.2;
      const isBottleneck = consRate > prodRate && prodRate > 0;

      let status: ResourceStatus;
      if (netRate < 0 && lowStock) {
        status = 'critical';
      } else if (netRate < 0) {
        status = 'declining';
      } else if (prodRate > 0 || consRate > 0) {
        status = 'stable';
      } else {
        status = 'idle';
      }

      return {
        resource: res,
        name: meta.name,
        icon: meta.icon,
        tier: meta.tier,
        amount,
        capacity,
        productionRate: prodRate,
        consumptionRate: consRate,
        netRate,
        status,
        isBottleneck,
        fillPct,
      };
    });
  }, [store.resources, store.resourceCapacity, store.productionSnapshot.production, store.productionSnapshot.consumption, store.megaProjects]);

  // ─── Filter & sort ──────────────────────────────────────────────────────
  const filteredResources = useMemo(() => {
    let rows = allResources;

    // Tier filter
    if (tierFilter !== 'all') {
      rows = rows.filter(r => r.tier === tierFilter);
    }

    // Critical only
    if (criticalOnly) {
      rows = rows.filter(r => r.status === 'critical' || r.status === 'declining');
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      rows = rows.filter(r => r.name.toLowerCase().includes(q) || r.resource.toLowerCase().includes(q));
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'netRate':
          cmp = a.netRate - b.netRate;
          break;
        case 'status':
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [allResources, tierFilter, searchQuery, criticalOnly, sortKey, sortDir]);

  // ─── Overview stats ─────────────────────────────────────────────────────
  const totalNonZero = useMemo(() => allResources.filter(r => r.amount > 0).length, [allResources]);
  const netProduction = useMemo(() => allResources.filter(r => r.netRate > 0).reduce((s, r) => s + r.netRate, 0), [allResources]);
  const criticalCount = useMemo(() => allResources.filter(r => r.status === 'critical').length, [allResources]);
  const avgUtilization = useMemo(() => {
    const withCap = allResources.filter(r => r.capacity !== Infinity);
    if (withCap.length === 0) return 100;
    return withCap.reduce((s, r) => s + r.fillPct, 0) / withCap.length;
  }, [allResources]);

  // ─── Summary totals ─────────────────────────────────────────────────────
  const totalProduction = useMemo(() => allResources.reduce((s, r) => s + r.productionRate, 0), [allResources]);
  const totalConsumption = useMemo(() => allResources.reduce((s, r) => s + r.consumptionRate, 0), [allResources]);
  const totalNet = totalProduction - totalConsumption;

  // ─── Sort handler ───────────────────────────────────────────────────────
  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  // ─── Quick upgrade ──────────────────────────────────────────────────────
  const handleQuickUpgrade = useCallback((resource: ResourceType) => {
    const row = allResources.find(r => r.resource === resource);
    if (!row || (row.status !== 'critical' && row.status !== 'declining' && row.netRate >= 0)) return;

    // Find buildings that produce this resource
    const producerTypes = PRODUCER_MAP[resource] ?? [];
    if (producerTypes.length === 0) return;

    // Find the lowest-level one from placed buildings
    let bestBuilding: { id: string; name: string; level: number } | null = null;
    for (const pt of producerTypes) {
      const matching = store.buildings.filter(b => b.type === pt.type);
      for (const b of matching) {
        if (!bestBuilding || b.level < bestBuilding.level) {
          const def = BUILDING_DEFS[b.type];
          bestBuilding = { id: b.id, name: def?.name ?? pt.name, level: b.level };
        }
      }
    }

    if (bestBuilding) {
      store.upgradeBuilding(bestBuilding.id);
      toastIdRef.current += 1;
      setToast({ message: `Upgraded ${bestBuilding.name} to Lv.${bestBuilding.level + 1}`, id: toastIdRef.current });
    }
  }, [store, allResources]);

  // ─── Quick navigate ─────────────────────────────────────────────────────
  const handleNavigate = useCallback((resource: ResourceType) => {
    const targetTab = getNavTargetForResource(resource);
    store.setActiveTab(targetTab);
    highlightAndNavigate(targetTab);
  }, [store, highlightAndNavigate]);

  // ─── View chain (navigate to dashboard) ─────────────────────────────────
  const handleViewChain = useCallback(() => {
    store.setActiveTab('dashboard');
    highlightAndNavigate('dashboard');
  }, [store, highlightAndNavigate]);

  // ─── Hovered resource data ──────────────────────────────────────────────
  const hoveredRow = useMemo(() => {
    if (!hover.resource) return null;
    return allResources.find(r => r.resource === hover.resource) ?? null;
  }, [hover.resource, allResources]);

  // ─── Tier filter tabs ───────────────────────────────────────────────────
  const tierTabs: { value: number | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 0, label: 'T0' },
    { value: 1, label: 'T1' },
    { value: 2, label: 'T2' },
    { value: 3, label: 'T3' },
    { value: 4, label: 'T4' },
  ];

  return (
    <div className="space-y-4">
      {/* ─── HEADER ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-teal-400 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Global Resource Monitor
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Real-time resource intelligence & navigation control</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-900/30 border border-teal-700/40 text-teal-400">
            {allResources.length} Resources
          </span>
          {criticalCount > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 border border-red-700/40 text-red-400 animate-pulse">
              {criticalCount} Critical
            </span>
          )}
        </div>
      </div>

      {/* ─── OVERVIEW STATS ROW ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <PanelStatCard
          icon={<Database className="w-4 h-4" />}
          label="Total Resources"
          value={String(totalNonZero)}
          subtext={`of ${allResources.length} types`}
          color="teal"
        />
        <PanelStatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Net Production"
          value={formatNumber(netProduction)}
          subtext="positive net rate"
          color="green"
          trend={netProduction > 0 ? 'up' : netProduction < 0 ? 'down' : undefined}
        />
        <PanelStatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Critical Alerts"
          value={String(criticalCount)}
          subtext={criticalCount > 0 ? 'needs attention' : 'all clear'}
          color={criticalCount > 0 ? 'red' : 'green'}
          trend={criticalCount > 0 ? 'down' : undefined}
        />
        <PanelStatCard
          icon={<Package className="w-4 h-4" />}
          label="Storage Util."
          value={`${avgUtilization.toFixed(1)}%`}
          subtext="avg fill across all"
          color={avgUtilization > 90 ? 'red' : avgUtilization > 70 ? 'orange' : 'sky'}
        />
      </div>

      {/* ─── SUMMARY BAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-[#111827] rounded-lg border border-gray-700/30">
        <div className="flex items-center gap-1.5 text-xs">
          <TrendingUp className="w-3.5 h-3.5 text-green-400" />
          <span className="text-gray-400">Total Prod:</span>
          <span className="text-green-400 font-mono font-bold">{formatNumber(totalProduction)}/s</span>
        </div>
        <div className="w-px h-4 bg-gray-700" />
        <div className="flex items-center gap-1.5 text-xs">
          <TrendingDown className="w-3.5 h-3.5 text-red-400" />
          <span className="text-gray-400">Total Cons:</span>
          <span className="text-red-400 font-mono font-bold">{formatNumber(totalConsumption)}/s</span>
        </div>
        <div className="w-px h-4 bg-gray-700" />
        <div className="flex items-center gap-1.5 text-xs">
          <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-gray-400">Net:</span>
          <span className={`font-mono font-bold ${totalNet >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalNet >= 0 ? '▲' : '▼'} {formatNumber(Math.abs(totalNet))}/s
          </span>
        </div>
      </div>

      {/* ─── FILTERS & SEARCH ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        {/* Search */}
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search resources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-8 bg-[#0a0e17] border border-gray-700/30 rounded-lg text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tier filter tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {tierTabs.map(tab => (
            <button
              key={String(tab.value)}
              onClick={() => setTierFilter(tab.value)}
              className={`text-[10px] px-2.5 py-1 rounded-md border ${
                tierFilter === tab.value
                  ? 'bg-teal-900/30 border-teal-600/50 text-teal-400'
                  : 'bg-transparent border-gray-700/30 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
              aria-pressed={tierFilter === tab.value}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Critical Only toggle */}
        <button
          onClick={() => setCriticalOnly(v => !v)}
          className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md border ${
            criticalOnly
              ? 'bg-red-900/30 border-red-600/50 text-red-400'
              : 'bg-transparent border-gray-700/30 text-gray-500 hover:text-gray-300 hover:border-gray-600'
          }`}
          aria-pressed={criticalOnly}
        >
          <AlertCircle className="w-3 h-3" />
          Critical Only
        </button>
      </div>

      {/* ─── RESOURCE INTELLIGENCE TABLE ─────────────────────────────────── */}
      <div ref={tableContainerRef} className="bg-[#111827] rounded-xl border border-gray-700/30 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2.5rem_1fr_3rem_5rem_4rem_4rem_4rem_4.5rem_1.5rem] sm:grid-cols-[2.5rem_1fr_3.5rem_6rem_5rem_5rem_5rem_5.5rem_1.5rem] items-center gap-1 px-3 py-2 bg-[#0d1220] border-b border-gray-700/30 text-[10px] text-gray-500 uppercase tracking-wider select-none">
          <div />
          <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-300 transition-colors text-left" aria-label="Sort by name">
            Resource {sortKey === 'name' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </button>
          <div>Tier</div>
          <button onClick={() => handleSort('amount')} className="flex items-center gap-1 hover:text-gray-300 transition-colors" aria-label="Sort by amount">
            Amount {sortKey === 'amount' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </button>
          <div>Prod</div>
          <div>Cons</div>
          <button onClick={() => handleSort('netRate')} className="flex items-center gap-1 hover:text-gray-300 transition-colors" aria-label="Sort by net rate">
            Net {sortKey === 'netRate' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </button>
          <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-300 transition-colors" aria-label="Sort by status">
            Status {sortKey === 'status' && (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </button>
          <div />
        </div>

        {/* Table body */}
        <div className="max-h-[600px] overflow-y-auto game-scrollbar">
          {filteredResources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Filter className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No resources match your filters</p>
            </div>
          ) : (
            filteredResources.map((row) => {
              const tc = TIER_COLORS[row.tier] ?? TIER_COLORS[0];
              const st = STATUS_LABELS[row.status];
              const isCriticalBg = row.status === 'critical';

              return (
                <div
                  key={row.resource}
                  className={`grid grid-cols-[2.5rem_1fr_3rem_5rem_4rem_4rem_4rem_4.5rem_1.5rem] sm:grid-cols-[2.5rem_1fr_3.5rem_6rem_5rem_5rem_5rem_5.5rem_1.5rem] items-center gap-1 px-3 py-1.5 border-b border-gray-800/50 transition-colors hover:bg-teal-900/10 cursor-default ${
                    isCriticalBg ? 'bg-red-900/10' : ''
                  }`}
                  onMouseEnter={(e) => onEnter(row.resource, e)}
                  onMouseLeave={onLeave}
                >
                  {/* Emoji */}
                  <div className="text-sm"><GameIcon icon={row.icon} size={14} className="inline-flex" /></div>

                  {/* Name */}
                  <div className="text-xs text-gray-200 truncate font-medium">{row.name}</div>

                  {/* Tier badge */}
                  <div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border ${tc.bg} ${tc.text} ${tc.border}`}>
                      T{row.tier}
                    </span>
                  </div>

                  {/* Amount / Capacity with mini progress */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-mono text-gray-300">
                      {formatNumber(row.amount)}{row.capacity !== Infinity ? `/${formatNumber(row.capacity)}` : '/∞'}
                    </span>
                    {row.capacity !== Infinity && (
                      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            row.fillPct >= 95 ? 'bg-red-500' : row.fillPct >= 70 ? 'bg-yellow-500' : 'bg-teal-500'
                          }`}
                          style={{ width: `${Math.min(100, row.fillPct)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Production rate */}
                  <div className={`text-[10px] font-mono ${row.productionRate > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                    {row.productionRate > 0 ? `+${formatNumber(row.productionRate)}` : '0'}
                  </div>

                  {/* Consumption rate */}
                  <div className={`text-[10px] font-mono ${row.consumptionRate > 0 ? 'text-red-400' : 'text-gray-600'}`}>
                    {row.consumptionRate > 0 ? `-${formatNumber(row.consumptionRate)}` : '0'}
                  </div>

                  {/* Net rate */}
                  <div className={`text-[10px] font-mono font-bold ${
                    row.netRate > 0 ? 'text-green-400' : row.netRate < 0 ? 'text-red-400' : 'text-gray-600'
                  }`}>
                    {row.netRate > 0 ? '▲' : row.netRate < 0 ? '▼' : '—'}
                    {row.netRate !== 0 ? formatNumber(Math.abs(row.netRate)) : ''}
                  </div>

                  {/* Status */}
                  <div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${st.bg} ${st.color}`}>
                      {st.label}
                    </span>
                  </div>

                  {/* Bottleneck dot */}
                  <div className="flex items-center justify-center">
                    {row.isBottleneck && (
                      <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]" title="Bottleneck: demand exceeds supply" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── HOVER INTELLIGENCE OVERLAY (portal to body to avoid transform offset) ── */}
      {hoveredRow && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[100] pointer-events-none"
          style={{ left: hover.overlayLeft, top: hover.overlayTop }}
        >
          <AnimatePresence>
            <motion.div
              className="pointer-events-auto w-72 bg-[#111827]/95 border border-teal-700/40 rounded-xl backdrop-blur-sm shadow-xl shadow-black/40 overflow-hidden"
              onMouseEnter={cancelHide}
              onMouseLeave={onLeave}
            >
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/30 bg-[#0d1220]">
                <GameIcon icon={hoveredRow.icon} size={16} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-200 truncate">{hoveredRow.name}</div>
                  <div className="text-[10px] text-gray-500">
                    <span className={`${TIER_COLORS[hoveredRow.tier].text}`}>T{hoveredRow.tier}</span>
                    {' · '}
                    {formatNumber(hoveredRow.amount)}{hoveredRow.capacity !== Infinity ? `/${formatNumber(hoveredRow.capacity)}` : '/∞'}
                  </div>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${STATUS_LABELS[hoveredRow.status].bg} ${STATUS_LABELS[hoveredRow.status].color}`}>
                  {STATUS_LABELS[hoveredRow.status].label}
                </span>
              </div>

              {/* Net change */}
              <div className="px-3 py-1.5 border-b border-gray-800/50">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-gray-400">Net Change:</span>
                  <span className={`font-mono font-bold ${hoveredRow.netRate > 0 ? 'text-green-400' : hoveredRow.netRate < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                    {hoveredRow.netRate > 0 ? '▲' : hoveredRow.netRate < 0 ? '▼' : '—'}
                    {hoveredRow.netRate !== 0 ? ` ${formatNumber(Math.abs(hoveredRow.netRate))}/s` : ' 0/s'}
                  </span>
                </div>
              </div>

              {/* Bottleneck flag */}
              {hoveredRow.isBottleneck && (
                <div className="px-3 py-1.5 border-b border-gray-800/50 bg-red-900/10">
                  <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                    <AlertTriangle className="w-3 h-3" />
                    <GameIcon icon="gi:hazard-sign" size={12} className="inline" /> Bottleneck: Demand exceeds supply
                  </div>
                </div>
              )}

              {/* Dependency preview */}
              <div className="px-3 py-2 space-y-1.5 border-b border-gray-800/50">
                {/* Producers */}
                <div className="text-[10px]">
                  <span className="text-gray-500">Producers: </span>
                  {(() => {
                    const prods = PRODUCER_MAP[hoveredRow.resource] ?? [];
                    if (prods.length === 0) return <span className="text-gray-600">None</span>;
                    const withCounts = prods.map(p => {
                      const count = store.buildings.filter(b => b.type === p.type).length;
                      return { name: p.name, count };
                    });
                    return (
                      <span className="text-green-400">
                        {withCounts.map((p, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            {p.name}{p.count > 0 ? ` ×${p.count}` : ''}
                          </span>
                        ))}
                      </span>
                    );
                  })()}
                </div>
                {/* Consumers */}
                <div className="text-[10px]">
                  <span className="text-gray-500">Consumers: </span>
                  {(() => {
                    const cons = CONSUMER_MAP[hoveredRow.resource] ?? [];
                    if (cons.length === 0) return <span className="text-gray-600">None</span>;
                    const withCounts = cons.map(c => {
                      const count = store.buildings.filter(b => b.type === c.type).length;
                      return { name: c.name, count };
                    }).filter(c => c.count > 0);
                    if (withCounts.length === 0) return <span className="text-gray-600">None active</span>;
                    return (
                      <span className="text-red-400">
                        {withCounts.map((c, i) => (
                          <span key={i}>
                            {i > 0 && ', '}
                            {c.name} ×{c.count}
                          </span>
                        ))}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-1.5 px-3 py-2">
                {/* Quick Upgrade - only for critical/declining/negative net */}
                {(hoveredRow.status === 'critical' || hoveredRow.status === 'declining' || hoveredRow.netRate < 0) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickUpgrade(hoveredRow.resource);
                    }}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-yellow-900/30 border border-yellow-700/40 text-yellow-400 hover:bg-yellow-900/50 transition-colors"
                    aria-label="Quick upgrade producer"
                    title="Upgrade lowest-level producer"
                  >
                    <Zap className="w-3 h-3" />
                    Upgrade
                  </button>
                )}

                {/* View Chain */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleViewChain();
                  }}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-cyan-900/30 border border-cyan-700/40 text-cyan-400 hover:bg-cyan-900/50 transition-colors"
                  aria-label="View production chain"
                  title="Navigate to production chain view"
                >
                  <Link2 className="w-3 h-3" />
                  Chain
                </button>

                {/* Navigate */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNavigate(hoveredRow.resource);
                  }}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-teal-900/30 border border-teal-700/40 text-teal-400 hover:bg-teal-900/50 transition-colors"
                  aria-label="Navigate to resource tab"
                  title="Navigate to relevant tab"
                >
                  <Navigation className="w-3 h-3" />
                  Navigate
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>,
        document.body
      )}

      {/* ─── TOAST NOTIFICATION ───────────────────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="fixed bottom-4 right-4 z-[200] bg-[#111827] border border-teal-700/40 rounded-lg px-4 py-2 shadow-xl shadow-black/40"
          >
            <div className="flex items-center gap-2 text-xs text-teal-400">
              <Zap className="w-3.5 h-3.5" />
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
