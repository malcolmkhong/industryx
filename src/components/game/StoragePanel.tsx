"use client";

import {
  useState,
  useMemo,
  useCallback,
  useDeferredValue,
  useEffect,
} from "react";
import { useGameStore, formatNumber } from "@/lib/game/store";
import { useShallow } from "zustand/react/shallow";
import { BUILDING_DEFS, PRODUCTION_CHAINS } from "@/lib/game/configCache";
import { RESOURCE_META } from "@/lib/game/uiCatalog";
import { TIER_INFO, ALL_TIERS } from "@/lib/game/tiers";
import { hasUnlimitedStorage } from "@/lib/game/store";
import { ResourceType, BuildingType } from "@/lib/game/types";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Package,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  X,
  Zap,
  Link2,
  BarChart3,
  Shield,
  Plus,
  ArrowRight,
  Box,
  Layers,
  Activity,
  AlertCircle,
  CheckCircle2,
  Gauge,
  Warehouse,
  CircleDot,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { GameIcon } from "@/components/icons";

// ─── Tier Config ──────────────────────────────────────────────────────────────
// Tier config derived from central TIER_INFO module.
// Storage tier display only — values come from @/lib/game/tiers.
const TIER_CONFIG: Record<
  number,
  { label: string; color: string; bg: string; border: string }
> = Object.fromEntries(
  TIER_INFO.map((info, tier) => [
    tier,
    {
      label: tier === 0 ? info.name : `Tier ${tier} — ${info.name}`,
      color: info.color,
      bg: info.tailwindBg,
      border: info.tailwindBorder,
    },
  ]),
) as Record<
  number,
  { label: string; color: string; bg: string; border: string }
>;

type ViewMode = "overview" | "dependencies" | "alerts";
type SortMode = "tier" | "stock" | "rate" | "capacity";
type QuickFilter = "all" | "inStock" | "critical" | "overflow";

// ─── Storage Upgrade Cost Helper ─────────────────────────────────────────────
function getStorageUpgradeCost(
  currentLevel: number,
  levels: number = 1,
): number {
  let total = 0;
  for (let i = 0; i < levels; i++) {
    total += Math.floor(100 * Math.pow(1.5, currentLevel + i));
  }
  return total;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function StoragePanel() {
  const store = useGameStore(
    useShallow((s) => ({
      buildings: s.buildings,
      megaProjects: s.megaProjects,
      money: s.money,
      productionSnapshot: s.productionSnapshot,
      resourceCapacity: s.resourceCapacity,
      resources: s.resources,
      storageUpgradeLevels: s.storageUpgradeLevels,
      upgradeStorage: s.upgradeStorage,
    })),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [sortMode, setSortMode] = useState<SortMode>("tier");
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearch = useDeferredValue(searchQuery);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [alertsTierFilter, setAlertsTierFilter] = useState<number | null>(null);
  const [expandedResource, setExpandedResource] = useState<ResourceType | null>(
    null,
  );
  const [expandedTier, setExpandedTier] = useState<number | null>(null);

  // ─── Collapsible Controls Panel ────────────────────────────────────────────
  // Default: collapsed on mobile (<md), expanded on desktop (≥md).
  // Persisted to localStorage so user override survives refresh.
  const [showControls, setShowControls] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("storage-show-controls");
    if (stored !== null) return stored === "1";
    // No saved preference: default to expanded on desktop, collapsed on mobile.
    return window.innerWidth >= 768;
  });

  useEffect(() => {
    localStorage.setItem("storage-show-controls", showControls ? "1" : "0");
  }, [showControls]);

  const toggleControls = useCallback(() => {
    setShowControls((prev) => !prev);
  }, []);

  // Reset all filters (search + quickFilter + alertsTierFilter + sort back to tier)
  const hasActiveFilter =
    searchQuery.trim() !== "" ||
    quickFilter !== "all" ||
    alertsTierFilter !== null ||
    sortMode !== "tier";

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setQuickFilter("all");
    setAlertsTierFilter(null);
    setSortMode("tier");
    setViewMode("overview");
  }, []);

  const unlimited = useMemo(
    () => hasUnlimitedStorage(store.megaProjects),
    [store.megaProjects],
  );

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
    const deps: Record<
      string,
      {
        producers: { building: string; type: BuildingType; amount: number }[];
        consumers: { building: string; type: BuildingType; amount: number }[];
        chains: string[];
      }
    > = {};

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
        if (o.resource === "money") continue;
        if (deps[o.resource]) {
          deps[o.resource].producers.push({
            building: def.name,
            type: b.type,
            amount: o.amount,
          });
        }
      }
      for (const inp of buildingSnapshot.inputs) {
        if (inp.resource === "money") continue;
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
  }, [store.buildings, store.productionSnapshot.buildings, allResources]);

  // Compute alerts
  const alerts = useMemo(() => {
    const list: {
      resource: ResourceType;
      type: "shortage" | "overflow" | "bottleneck" | "critical";
      message: string;
      severity: number;
    }[] = [];

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
        list.push({
          resource: res,
          type: "critical",
          message: `${RESOURCE_META[res].name} is depleted but still being consumed!`,
          severity: 4,
        });
      }
      // Shortage: < 10% and being demanded
      else if (fillPct > 0 && fillPct < 10 && demandRate > 0) {
        list.push({
          resource: res,
          type: "shortage",
          message: `${RESOURCE_META[res].name} is critically low (${fillPct.toFixed(0)}%)`,
          severity: 3,
        });
      }
      // Overflow: >= 95%
      else if (fillPct >= 95 && !unlimited) {
        list.push({
          resource: res,
          type: "overflow",
          message: `${RESOURCE_META[res].name} storage is almost full (${fillPct.toFixed(0)}%)`,
          severity: 2,
        });
      }
      // Bottleneck: Net negative and stock will run out in < 100 ticks
      else if (netRate < 0 && amount > 0) {
        const ticksUntilEmpty = amount / Math.abs(netRate);
        if (ticksUntilEmpty < 100) {
          list.push({
            resource: res,
            type: "bottleneck",
            message: `${RESOURCE_META[res].name} will deplete in ~${Math.ceil(ticksUntilEmpty)} ticks`,
            severity: 1,
          });
        }
      }
    }

    return list.sort((a, b) => b.severity - a.severity);
  }, [
    store.resources,
    store.resourceCapacity,
    store.productionSnapshot.production,
    store.productionSnapshot.actualConsumption,
    store.productionSnapshot.consumption,
    allResources,
    unlimited,
  ]);

  // ─── Filtered & Sorted Resources ──────────────────────────────────────────
  const filteredResources = useMemo(() => {
    let resources = allResources;

    const q = deferredSearch.trim().toLowerCase();
    if (q) {
      resources = resources.filter((r) => {
        const meta = RESOURCE_META[r];
        return (
          meta &&
          (meta.name.toLowerCase().includes(q) || r.toLowerCase().includes(q))
        );
      });
    }

    // Quick filters (post-search). Builds a Set of alerted resources once for O(1) lookup.
    if (quickFilter !== "all") {
      const alerted = new Set(alerts.map((a) => a.resource));
      resources = resources.filter((r) => {
        const amount = store.resources[r] ?? 0;
        const capacity = store.resourceCapacity[r] ?? 100;
        const fillPct = capacity > 0 ? (amount / capacity) * 100 : 0;
        switch (quickFilter) {
          case "inStock":
            return amount > 0;
          case "critical":
            return alerted.has(r);
          case "overflow":
            return fillPct >= 80;
          default:
            return true;
        }
      });
    }

    return resources;
  }, [
    allResources,
    deferredSearch,
    quickFilter,
    alerts,
    store.resources,
    store.resourceCapacity,
  ]);

  const groupedResources = useMemo(() => {
    // Derive group keys from central tier SSOT so adding tier 6 needs no edit here.
    const groups: Record<number, ResourceType[]> = Object.fromEntries(
      ALL_TIERS.map((t) => [t, [] as ResourceType[]]),
    ) as Record<number, ResourceType[]>;

    const sorted = [...filteredResources].sort((a, b) => {
      switch (sortMode) {
        case "stock":
          return (store.resources[b] ?? 0) - (store.resources[a] ?? 0);
        case "rate": {
          const netA =
            (store.productionSnapshot.production[a] ?? 0) -
            (store.productionSnapshot.actualConsumption[a] ?? 0);
          const netB =
            (store.productionSnapshot.production[b] ?? 0) -
            (store.productionSnapshot.actualConsumption[b] ?? 0);
          return netB - netA;
        }
        case "capacity": {
          const fillA =
            store.resourceCapacity[a] > 0
              ? (store.resources[a] ?? 0) / store.resourceCapacity[a]
              : 0;
          const fillB =
            store.resourceCapacity[b] > 0
              ? (store.resources[b] ?? 0) / store.resourceCapacity[b]
              : 0;
          return fillB - fillA;
        }
        default:
          return 0; // tier is handled by grouping
      }
    });

    for (const r of sorted) {
      const tier = RESOURCE_META[r]?.tier ?? 0;
      if (groups[tier]) groups[tier].push(r);
    }

    return groups;
  }, [
    filteredResources,
    sortMode,
    store.resources,
    store.resourceCapacity,
    store.productionSnapshot.production,
    store.productionSnapshot.actualConsumption,
  ]);

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
      if (amount > 0 || (store.productionSnapshot.production[res] ?? 0) > 0)
        activeResources++;
      if (!unlimited && capacity > 0 && amount >= capacity) maxedResources++;
    }

    return {
      totalStock,
      totalCapacity,
      activeResources,
      maxedResources,
      totalTypes: allResources.length,
    };
  }, [
    store.resources,
    store.resourceCapacity,
    store.productionSnapshot.production,
    allResources,
    unlimited,
  ]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleUpgrade = useCallback(
    (resource: ResourceType) => {
      store.upgradeStorage(resource, 1);
    },
    [store],
  );

  const handleUpgrade5 = useCallback(
    (resource: ResourceType) => {
      store.upgradeStorage(resource, 5);
    },
    [store],
  );

  const toggleResource = useCallback((res: ResourceType) => {
    setExpandedResource((prev) => (prev === res ? null : res));
  }, []);

  const toggleTier = useCallback((tier: number) => {
    setExpandedTier((prev) => (prev === tier ? -1 : tier));
  }, []);

  // ─── Render Helpers ───────────────────────────────────────────────────────
  const renderRateBadge = (
    rate: number,
    prodRate?: number,
    consRate?: number,
  ) => {
    if (rate > 0)
      return (
        <span className="inline-flex items-center gap-0.5 text-success font-mono text-[10px]">
          <TrendingUp className="w-2.5 h-2.5" />+{formatNumber(rate)}/s
        </span>
      );
    if (rate < 0)
      return (
        <span className="inline-flex items-center gap-0.5 text-danger font-mono text-[10px]">
          <TrendingDown className="w-2.5 h-2.5" />
          {formatNumber(rate)}/s
        </span>
      );
    // When net rate is 0 but the resource is being both produced and consumed (balanced flow),
    // show "±0/s" with Minus icon to distinguish from idle resources which show "—"
    if (
      prodRate !== undefined &&
      consRate !== undefined &&
      prodRate > 0 &&
      consRate > 0
    ) {
      return (
        <span className="inline-flex items-center gap-0.5 text-brand font-mono text-[10px]">
          <Minus className="w-2.5 h-2.5" />
          ±0/s
        </span>
      );
    }
    return <span className="text-muted-label font-mono text-[10px]">—</span>;
  };

  const renderCapacityBar = (amount: number, capacity: number) => {
    if (unlimited) {
      // Terraforming Engine: neutral 15% indicator (unlimited, no real fill tracking).
      return (
        <Progress
          value={15}
          aria-label="Unlimited storage"
          className="h-1.5 bg-muted-label [&>div]:bg-brand/40"
        />
      );
    }
    const pct = capacity > 0 ? Math.min(100, (amount / capacity) * 100) : 0;
    // 2-color consolidation: brand (normal) + danger (full). No yellow/red/green/cyan noise.
    const barColor = pct >= 95 ? "[&>div]:bg-danger" : "[&>div]:bg-brand";
    return (
      <Progress
        value={pct}
        aria-label={`Storage fill ${pct.toFixed(0)}%`}
        className={`h-1.5 bg-muted-label ${barColor} transition-all duration-300`}
      />
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
    const fillPct = unlimited
      ? 0
      : capacity > 0
        ? (amount / capacity) * 100
        : 0;
    const upgradeLevel = store.storageUpgradeLevels[res] ?? 0;
    const upgradeCost = getStorageUpgradeCost(upgradeLevel);
    const upgradeCost5 = getStorageUpgradeCost(upgradeLevel, 5);
    const deps = resourceDependencies[res];
    const canAfford = store.money >= upgradeCost;

    // ETA to fill/deplete
    let etaLabel = "";
    if (netRate > 0 && !unlimited && capacity > amount) {
      const ticks = (capacity - amount) / netRate;
      etaLabel = `Full in ~${Math.ceil(ticks)}t`;
    } else if (netRate < 0 && amount > 0) {
      const ticks = amount / Math.abs(netRate);
      etaLabel = `Empty in ~${Math.ceil(ticks)}t`;
    }

    return (
      <div className="overflow-hidden">
        <div className="mt-2 bg-background rounded-lg p-3 border border-muted-label/50 space-y-3">
          {/* Rate Breakdown */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-3 h-3 text-brand" />
              <span className="text-[10px] font-semibold text-brand uppercase tracking-wider">
                Rate Breakdown — {meta.name}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="bg-success/10 border border-success/30 rounded-lg p-2 text-center">
                <div className="text-[9px] text-success/70 uppercase tracking-wider inline-flex items-center justify-center gap-1">
                  <ArrowUp className="w-2.5 h-2.5" />
                  Production
                </div>
                <div className="text-sm font-bold text-success font-mono">
                  +{formatNumber(prodRate)}
                </div>
                <div className="text-[9px] text-success">per second</div>
              </div>
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-2 text-center">
                <div className="text-[9px] text-danger/70 uppercase tracking-wider inline-flex items-center justify-center gap-1">
                  <ArrowDown className="w-2.5 h-2.5" />
                  Consumption
                </div>
                <div className="text-sm font-bold text-danger font-mono">
                  -{formatNumber(consRate)}
                </div>
                <div className="text-[9px] text-danger">per second</div>
              </div>
              <div
                className={`${netRate >= 0 ? "bg-success/10 border-success/30" : "bg-domain/10 border-domain/30"} border rounded-lg p-2 text-center`}
              >
                <div className="text-[9px] text-muted-label uppercase tracking-wider inline-flex items-center justify-center gap-1">
                  {netRate > 0 ? (
                    <TrendingUp className="w-2.5 h-2.5 text-success" />
                  ) : netRate < 0 ? (
                    <TrendingDown className="w-2.5 h-2.5 text-danger" />
                  ) : prodRate > 0 && consRate > 0 ? (
                    <Minus className="w-2.5 h-2.5 text-brand" />
                  ) : (
                    <Minus className="w-2.5 h-2.5 text-muted-label" />
                  )}
                  Net Balance
                </div>
                <div
                  className={`text-sm font-bold font-mono ${netRate > 0 ? "text-success" : netRate < 0 ? "text-danger" : prodRate > 0 && consRate > 0 ? "text-brand" : "text-muted-label"}`}
                >
                  {netRate > 0 ? "+" : ""}
                  {netRate === 0 && prodRate > 0 && consRate > 0
                    ? "±0"
                    : formatNumber(netRate)}
                </div>
                <div className="text-[9px] text-muted-label">per second</div>
              </div>
            </div>
            {etaLabel && (
              <div
                className={`mt-1.5 text-[10px] font-mono text-center inline-flex items-center justify-center gap-1 w-full ${netRate > 0 ? "text-brand" : "text-domain"}`}
              >
                {netRate > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {etaLabel}
              </div>
            )}
          </div>

          {/* Storage Upgrade */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Warehouse className="w-3 h-3 text-warning" />
              <span className="text-[10px] font-semibold text-warning uppercase tracking-wider">
                Storage Capacity — {meta.name}
              </span>
            </div>
            <div className="bg-muted-label/50 border border-muted-label/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-subtle">Current:</span>
                  <span className="text-sm font-bold font-mono text-subtle">
                    {unlimited ? "∞" : formatNumber(capacity)}
                  </span>
                  <span className="text-[10px] text-muted-label">
                    ({formatNumber(amount)} stored)
                  </span>
                </div>
                {upgradeLevel > 0 && <StorageLevelBadge level={upgradeLevel} />}
              </div>
              {!unlimited && (
                <>
                  {renderCapacityBar(amount, capacity)}
                  <div className="flex items-center justify-between mt-2 text-[10px]">
                    <span className="text-muted-label">
                      Level {upgradeLevel} • +50% base per level
                    </span>
                    <span
                      className={`font-mono ${fillPct >= 95 ? "text-danger" : "text-muted-label"}`}
                    >
                      {fillPct.toFixed(1)}% used
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      onClick={() => handleUpgrade(res)}
                      disabled={!canAfford}
                      size="sm"
                      variant="outline"
                      className={`flex-1 text-[10px] h-7 ${
                        canAfford
                          ? "border-warning/40 text-warning bg-warning/10 hover:bg-warning/20 hover:border-warning/60"
                          : "border-muted-label/30 text-muted-label bg-muted-label/20"
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      +1 Level (${formatNumber(upgradeCost)})
                    </Button>
                    <Button
                      onClick={() => handleUpgrade5(res)}
                      disabled={store.money < upgradeCost5}
                      size="sm"
                      variant="outline"
                      className={`text-[10px] h-7 ${
                        store.money >= upgradeCost5
                          ? "border-brand/40 text-brand bg-brand/10 hover:bg-brand/20 hover:border-brand/60"
                          : "border-muted-label/30 text-muted-label bg-muted-label/20"
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      +5 (${formatNumber(upgradeCost5)})
                    </Button>
                  </div>
                </>
              )}
              {unlimited && (
                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-success">
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
                <Link2 className="w-3 h-3 text-research" />
                <span className="text-[10px] font-semibold text-research uppercase tracking-wider">
                  Production Chains — {meta.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {deps.chains.map((chainName, i) => {
                  const chain = PRODUCTION_CHAINS.find(
                    (c) => c.name === chainName,
                  );
                  return (
                    <TooltipProvider key={i}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="px-2 py-1 rounded-md text-[10px] font-medium border cursor-help"
                            style={{
                              borderColor: `${chain?.color ?? "#666"}44`,
                              backgroundColor: `${chain?.color ?? "#666"}15`,
                              color: chain?.color ?? "#999",
                            }}
                          >
                            {chainName}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="bg-muted-label border-muted-label text-subtle text-[10px]"
                        >
                          <div className="flex items-center gap-1">
                            {chain?.steps.map((step, j) => (
                              <span key={j} className="flex items-center gap-1">
                                <span
                                  style={{
                                    color:
                                      RESOURCE_META[step as ResourceType]
                                        ?.color ?? "#999",
                                  }}
                                >
                                  <GameIcon
                                    icon={
                                      RESOURCE_META[step as ResourceType]?.icon
                                    }
                                    size={14}
                                    className="inline-flex"
                                  />{" "}
                                  {RESOURCE_META[step as ResourceType]?.name ??
                                    step}
                                </span>
                                {j < chain.steps.length - 1 && (
                                  <ArrowRight className="w-2.5 h-2.5 text-muted-label" />
                                )}
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
                <CircleDot className="w-3 h-3 text-brand" />
                <span className="text-[10px] font-semibold text-brand uppercase tracking-wider">
                  Dependency Map — {meta.name}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {deps.producers.length > 0 && (
                  <div className="bg-success/10 border border-success/30 rounded-lg p-2">
                    <div className="text-[9px] text-success uppercase tracking-wider mb-1.5">
                      Produced By
                    </div>
                    <div className="space-y-1">
                      {deps.producers.slice(0, 5).map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[10px]"
                        >
                          <span className="text-subtle truncate">
                            {p.building}
                          </span>
                          <span className="text-success font-mono ml-1">
                            +{formatNumber(p.amount)}/s
                          </span>
                        </div>
                      ))}
                      {deps.producers.length > 5 && (
                        <div className="text-[9px] text-muted-label">
                          +{deps.producers.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {deps.consumers.length > 0 && (
                  <div className="bg-danger/10 border border-danger/30 rounded-lg p-2">
                    <div className="text-[9px] text-danger uppercase tracking-wider mb-1.5">
                      Consumed By
                    </div>
                    <div className="space-y-1">
                      {deps.consumers.slice(0, 5).map((c, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-[10px]"
                        >
                          <span className="text-subtle truncate">
                            {c.building}
                          </span>
                          <span className="text-danger font-mono ml-1">
                            -{formatNumber(c.amount)}/s
                          </span>
                        </div>
                      ))}
                      {deps.consumers.length > 5 && (
                        <div className="text-[9px] text-muted-label">
                          +{deps.consumers.length - 5} more
                        </div>
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
    const fillPct = unlimited
      ? 0
      : capacity > 0
        ? (amount / capacity) * 100
        : 0;
    const isExpanded = expandedResource === res;
    const hasAlert = alerts.some((a) => a.resource === res);
    const isActive = amount > 0 || prodRate > 0 || consRate > 0;

    if (!isActive && !deferredSearch.trim()) return null;

    return (
      <div key={res} className="border-b border-muted-label/30 last:border-0">
        <button
          onClick={() => toggleResource(res)}
          className={`w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-muted-label/30 text-left ${isExpanded ? "bg-muted-label/20" : ""}`}
        >
          {/* Color Dot */}
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: meta.color }}
          />

          {/* Emoji + Name */}
          <div className="flex items-center gap-1.5 min-w-30">
            <GameIcon icon={meta.icon} size={14} className="inline-flex" />
            <span className="text-xs font-medium text-subtle truncate">
              {meta.name}
            </span>
            {hasAlert && (
              <AlertCircle className="w-3 h-3 text-domain shrink-0" />
            )}
          </div>

          {/* Capacity Bar */}
          <div className="flex-1 min-w-0">
            {renderCapacityBar(amount, capacity)}
          </div>

          {/* Stock / Capacity */}
          <div className="text-right min-w-20">
            <span className="text-xs font-mono text-subtle">
              {formatNumber(amount)}
            </span>
            <span className="text-[10px] text-muted-label">/</span>
            <span className="text-[10px] text-muted-label font-mono">
              {unlimited ? "∞" : formatNumber(capacity)}
            </span>
          </div>

          {/* Net Rate (compact — detail hidden behind expand chevron) */}
          <div className="min-w-15 text-right hidden sm:block">
            {renderRateBadge(netRate, prodRate, consRate)}
          </div>

          {/* Expand Chevron */}
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-label shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-label shrink-0" />
          )}
        </button>
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="detail"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              style={{ overflow: "hidden" }}
            >
              {renderResourceDetail(res)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // ─── Alerts View ──────────────────────────────────────────────────────────
  const renderAlertsView = () => {
    const filteredAlerts =
      alertsTierFilter === null
        ? alerts
        : alerts.filter(
            (a) => RESOURCE_META[a.resource]?.tier === alertsTierFilter,
          );

    if (filteredAlerts.length === 0) {
      return (
        <div className="text-center py-12">
          <CheckCircle2 className="w-10 h-10 text-success/40 mx-auto mb-3" />
          <div className="text-sm text-subtle">No Storage Alerts</div>
          <div className="text-[10px] text-muted-label mt-1">
            All materials are in good standing
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto game-scrollbar pr-1">
        {/* Tier filter chips for alerts */}
        <div className="flex items-center gap-1 flex-wrap pb-2 border-b border-muted-label/30">
          <span className="text-[10px] text-muted-label mr-1">Tier:</span>
          <Button
            onClick={() => setAlertsTierFilter(null)}
            size="sm"
            variant="outline"
            className={`h-6 px-2 text-[10px] ${
              alertsTierFilter === null
                ? "border-brand/40 text-brand bg-brand/10 hover:bg-brand/20"
                : "border-muted-label/40 text-muted-label bg-muted-label/20 hover:text-subtle"
            }`}
          >
            All
          </Button>
          {ALL_TIERS.map((t) => (
            <Button
              key={t}
              onClick={() => setAlertsTierFilter(t)}
              size="sm"
              variant="outline"
              className={`h-6 px-2 text-[10px] ${
                alertsTierFilter === t
                  ? "border-brand/40 text-brand bg-brand/10 hover:bg-brand/20"
                  : "border-muted-label/40 text-muted-label bg-muted-label/20 hover:text-subtle"
              }`}
              style={
                alertsTierFilter === t
                  ? { borderColor: TIER_INFO[t].color }
                  : undefined
              }
            >
              T{t}
            </Button>
          ))}
        </div>
        <AnimatePresence mode="popLayout">
          {filteredAlerts.map((alert, i) => {
            const meta = RESOURCE_META[alert.resource];
            if (!meta) return null;
            const iconMap = {
              critical: <AlertCircle className="w-4 h-4 text-danger" />,
              shortage: <AlertTriangle className="w-4 h-4 text-domain" />,
              overflow: <Package className="w-4 h-4 text-warning" />,
              bottleneck: <Gauge className="w-4 h-4 text-research" />,
            };
            const colorMap = {
              critical: "border-danger/40 bg-danger/10",
              shortage: "border-domain/40 bg-domain/10",
              overflow: "border-warning/40 bg-warning/10",
              bottleneck: "border-research/40 bg-research/10",
            };
            const labelMap = {
              critical: "CRITICAL",
              shortage: "SHORTAGE",
              overflow: "OVERFLOW",
              bottleneck: "BOTTLENECK",
            };

            return (
              <motion.div
                key={alert.resource + alert.type}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={`flex items-start gap-3 p-3 rounded-lg border ${colorMap[alert.type]}`}
              >
                <div className="mt-0.5">{iconMap[alert.type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <GameIcon
                      icon={meta.icon}
                      size={14}
                      className="inline-flex"
                    />
                    <span className="text-sm font-semibold text-subtle">
                      {meta.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        alert.type === "critical"
                          ? "border-danger/40 text-danger bg-danger/10"
                          : alert.type === "shortage"
                            ? "border-domain/40 text-domain bg-domain/10"
                            : alert.type === "overflow"
                              ? "border-warning/40 text-warning bg-warning/10"
                              : "border-research/40 text-research bg-research/10"
                      }`}
                    >
                      {labelMap[alert.type]}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-subtle">{alert.message}</div>
                </div>
                <Button
                  onClick={() => {
                    setExpandedResource(alert.resource);
                    setViewMode("overview");
                  }}
                  size="sm"
                  variant="ghost"
                  className="text-[9px] h-6 text-brand hover:text-brand shrink-0 mt-1 px-2"
                >
                  View →
                </Button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  };

  // ─── Dependencies View ────────────────────────────────────────────────────
  const renderDependenciesView = () => {
    // Build a visual dependency map for all active resources
    const activeResources = allResources.filter((r) => {
      const amount = store.resources[r] ?? 0;
      const prodRate = store.productionSnapshot.production[r] ?? 0;
      const consRate = store.productionSnapshot.actualConsumption[r] ?? 0;
      return amount > 0 || prodRate > 0 || consRate > 0;
    });

    return (
      <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto game-scrollbar pr-1">
        {PRODUCTION_CHAINS.filter((chain) =>
          chain.steps.some((s) => activeResources.includes(s as ResourceType)),
        ).map((chain, ci) => {
          const allActive = chain.steps.every((s) =>
            activeResources.includes(s as ResourceType),
          );
          const bottleneck = chain.steps.find(
            (s) => !activeResources.includes(s as ResourceType),
          );

          return (
            <div
              key={chain.name}
              className={`rounded-lg border p-3 ${
                allActive
                  ? "bg-muted-label/40 border-success/30"
                  : "bg-muted-label/30 border-muted-label/30"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: chain.color }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: chain.color }}
                >
                  {chain.name}
                </span>
                {allActive ? (
                  <span className="text-[11px] bg-success/20 text-success px-1.5 py-0.5 rounded font-bold">
                    ACTIVE
                  </span>
                ) : bottleneck ? (
                  <span className="text-[11px] bg-danger/20 text-danger px-1.5 py-0.5 rounded font-bold">
                    BLOCKED
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {chain.steps.map((step, si) => {
                  const stepMeta = RESOURCE_META[step as ResourceType];
                  const stepActive = activeResources.includes(
                    step as ResourceType,
                  );
                  const stepProd =
                    store.productionSnapshot.production[step] ?? 0;
                  const stepCons =
                    store.productionSnapshot.actualConsumption[step] ?? 0;
                  const stepNet = stepProd - stepCons;

                  return (
                    <div key={step} className="flex items-center gap-1">
                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border ${
                          stepActive
                            ? "bg-muted-label/50 border-muted-label/40"
                            : "bg-danger/10 border-danger/30"
                        }`}
                      >
                        <GameIcon
                          icon={stepMeta?.icon}
                          size={14}
                          className="inline-flex"
                        />
                        <span
                          className={
                            stepActive ? "text-subtle" : "text-danger/70"
                          }
                        >
                          {stepMeta?.name ?? step}
                        </span>
                        {stepActive && (
                          <span
                            className={`inline-flex items-center gap-0.5 font-mono ${stepNet > 0 ? "text-success" : stepNet < 0 ? "text-danger" : stepProd > 0 && stepCons > 0 ? "text-brand" : "text-muted-label"}`}
                          >
                            {stepNet > 0 ? (
                              <TrendingUp className="w-2.5 h-2.5" />
                            ) : stepNet < 0 ? (
                              <TrendingDown className="w-2.5 h-2.5" />
                            ) : stepProd > 0 && stepCons > 0 ? (
                              <Minus className="w-2.5 h-2.5" />
                            ) : null}
                            {stepNet > 0 ? "+" : ""}
                            {stepNet === 0 && stepProd > 0 && stepCons > 0
                              ? "±0"
                              : formatNumber(stepNet)}
                          </span>
                        )}
                      </div>
                      {si < chain.steps.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-muted-label shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
              {!allActive && bottleneck && (
                <div className="mt-1.5 text-[10px] text-danger/70">
                  <GameIcon
                    icon="game-icons:hazard-sign"
                    size={12}
                    className="inline"
                  />{" "}
                  Blocked at{" "}
                  {RESOURCE_META[bottleneck as ResourceType]?.name ??
                    bottleneck}{" "}
                  — no production
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
      {(Object.keys(TIER_CONFIG) as unknown as number[]).map((tier) => {
        const config = TIER_CONFIG[tier];
        const resources = groupedResources[tier] ?? [];
        const activeInTier = resources.filter((r) => {
          const amount = store.resources[r] ?? 0;
          const prodRate = store.productionSnapshot.production[r] ?? 0;
          const consRate = store.productionSnapshot.actualConsumption[r] ?? 0;
          return amount > 0 || prodRate > 0 || consRate > 0;
        });

        if (activeInTier.length === 0 && !deferredSearch.trim()) return null;

        const isExpanded = expandedTier === tier;

        return (
          <div
            key={tier}
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: `${config.color}33` }}
          >
            {/* Tier Header */}
            <button
              onClick={() => toggleTier(tier)}
              className="w-full flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted-label/20"
              style={{ backgroundColor: `${config.color}08` }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              <span
                className="text-sm font-semibold"
                style={{ color: config.color }}
              >
                {config.label}
              </span>
              <span className="text-[10px] text-muted-label">
                {activeInTier.length}/{resources.length} active
              </span>
              <div className="flex-1" />
              {/* Tier aggregate net rate */}
              {(() => {
                const tierNet = activeInTier.reduce((sum, r) => {
                  return (
                    sum +
                    (store.productionSnapshot.production[r] ?? 0) -
                    (store.productionSnapshot.actualConsumption[r] ?? 0)
                  );
                }, 0);
                const tierProd = activeInTier.reduce(
                  (sum, r) =>
                    sum + (store.productionSnapshot.production[r] ?? 0),
                  0,
                );
                const tierCons = activeInTier.reduce(
                  (sum, r) =>
                    sum + (store.productionSnapshot.actualConsumption[r] ?? 0),
                  0,
                );
                const isBalanced =
                  tierNet === 0 && tierProd > 0 && tierCons > 0;
                const Icon = isBalanced
                  ? Minus
                  : tierNet > 0
                    ? TrendingUp
                    : tierNet < 0
                      ? TrendingDown
                      : null;
                const colorClass = isBalanced
                  ? "text-brand"
                  : tierNet > 0
                    ? "text-success"
                    : tierNet < 0
                      ? "text-danger"
                      : "text-muted-label";
                return (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-mono ${colorClass}`}
                  >
                    {Icon && <Icon className="w-2.5 h-2.5" />}
                    {isBalanced
                      ? "±0"
                      : tierNet >= 0
                        ? `+${formatNumber(tierNet)}`
                        : formatNumber(tierNet)}
                    /s
                  </span>
                );
              })()}
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-label" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-label" />
              )}
            </button>

            {/* Tier Resources */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  key="tier-body"
                  layout
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  style={{ overflow: "hidden" }}
                >
                  {activeInTier.length === 0 && deferredSearch.trim() ? (
                    <div className="px-3 py-4 text-center text-[10px] text-muted-label">
                      No matching resources
                    </div>
                  ) : (
                    <motion.div
                      layout
                      className="divide-y divide-muted-label/30"
                    >
                      <AnimatePresence mode="popLayout">
                        {activeInTier.map((res) => (
                          <motion.div
                            key={res}
                            layout
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                          >
                            {renderResourceRow(res)}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );

  // ─── Main Render ─────────────────────────────────────────────────────
  // Inline capacity fill % for compact title bar (mobile-collapsed view).
  const totalFillPct = unlimited
    ? 0
    : summaryStats.totalCapacity > 0
      ? Math.min(
          100,
          (summaryStats.totalStock / summaryStats.totalCapacity) * 100,
        )
      : 0;
  const fillColorClass =
    totalFillPct >= 95
      ? "text-danger"
      : totalFillPct >= 80
        ? "text-domain"
        : "text-muted-label";

  return (
    <div className="h-full flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 overflow-hidden">
      {/* ─── Title Bar (always visible, tap to toggle controls) ──────────── */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={toggleControls}
          aria-expanded={showControls}
          aria-controls="storage-controls-panel"
          aria-label="Toggle storage controls"
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-muted-label/30 border border-muted-label/40 hover:bg-muted-label/40 active:scale-[0.99] transition-all"
        >
          <Database className="w-4 h-4 text-warning shrink-0" />
          <span className="text-sm sm:text-base font-bold text-subtle neon-glow-cyan truncate">
            Storage
          </span>

          {/* Inline live stats — only shown when collapsed to save space */}
          {!showControls && (
            <>
              <span className="hidden sm:inline text-[10px] text-muted-label font-mono">
                {formatNumber(summaryStats.totalStock)}/
                {unlimited ? "∞" : formatNumber(summaryStats.totalCapacity)}
              </span>
              <span
                className={`hidden sm:inline text-[10px] font-mono ${fillColorClass}`}
              >
                {totalFillPct.toFixed(0)}%
              </span>
            </>
          )}

          <div className="flex-1" />

          {/* Alert badge — visible in both states, always important */}
          {alerts.length > 0 && (
            <Badge
              variant="outline"
              className="border-danger/40 text-danger bg-danger/10 font-mono text-[10px] px-1.5 py-0"
            >
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              {alerts.length}
            </Badge>
          )}

          {/* Active filter indicator (when controls collapsed but filters set) */}
          {!showControls && hasActiveFilter && (
            <span className="text-[10px] text-domain font-mono">●</span>
          )}

          {showControls ? (
            <ChevronUp className="w-4 h-4 text-muted-label shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-label shrink-0" />
          )}
        </button>
      </div>

      {/* ─── Collapsible Controls Panel ───────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {showControls && (
          <motion.div
            id="storage-controls-panel"
            key="controls"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
            className="shrink-0"
          >
            <div className="space-y-3 pb-1">
              {/* Summary Stats — 2 cols on mobile, 4 on desktop */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-muted-label/50 border border-muted-label/40 rounded-lg p-2 sm:p-3">
                  <div className="text-[9px] text-muted-label uppercase tracking-wider">
                    Total Stock
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono text-subtle">
                    {formatNumber(summaryStats.totalStock)}
                  </div>
                </div>
                <div className="bg-muted-label/50 border border-muted-label/40 rounded-lg p-2 sm:p-3">
                  <div className="text-[9px] text-muted-label uppercase tracking-wider">
                    Capacity
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono text-subtle">
                    {unlimited ? "∞" : formatNumber(summaryStats.totalCapacity)}
                  </div>
                </div>
                <div className="bg-muted-label/50 border border-muted-label/40 rounded-lg p-2 sm:p-3">
                  <div className="text-[9px] text-muted-label uppercase tracking-wider">
                    Active
                  </div>
                  <div className="text-base sm:text-lg font-bold font-mono text-brand">
                    {summaryStats.activeResources}
                    <span className="text-muted-label">
                      /{summaryStats.totalTypes}
                    </span>
                  </div>
                </div>
                <div className="bg-muted-label/50 border border-muted-label/40 rounded-lg p-2 sm:p-3">
                  <div className="text-[9px] text-muted-label uppercase tracking-wider">
                    Alerts
                  </div>
                  <div
                    className={`text-base sm:text-lg font-bold font-mono ${alerts.length > 0 ? "text-domain" : "text-success"}`}
                  >
                    {alerts.length}
                  </div>
                </div>
              </div>

              {/* Controls Bar */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* View Mode Tabs */}
                <div className="flex bg-muted-label/50 border border-muted-label/40 rounded-lg p-0.5">
                  {[
                    {
                      mode: "overview" as ViewMode,
                      label: "Overview",
                      icon: Layers,
                    },
                    {
                      mode: "dependencies" as ViewMode,
                      label: "Chains",
                      icon: Link2,
                    },
                    {
                      mode: "alerts" as ViewMode,
                      label: `Alerts${alerts.length > 0 ? ` (${alerts.length})` : ""}`,
                      icon: AlertTriangle,
                    },
                  ].map((tab) => (
                    <Button
                      key={tab.mode}
                      onClick={() => setViewMode(tab.mode)}
                      size="sm"
                      variant="outline"
                      className={`h-7 px-2.5 text-[10px] gap-1 rounded-md ${
                        viewMode === tab.mode
                          ? "border-brand/40 text-brand bg-brand/10 hover:bg-brand/20"
                          : "border-transparent text-muted-label bg-transparent hover:text-subtle hover:bg-transparent"
                      }`}
                    >
                      <tab.icon className="w-3 h-3" />
                      {tab.label}
                    </Button>
                  ))}
                </div>

                {/* Sort Mode (only for overview) */}
                {viewMode === "overview" && (
                  <div className="flex bg-muted-label/50 border border-muted-label/40 rounded-lg p-0.5">
                    {[
                      { mode: "tier" as SortMode, label: "Tier" },
                      { mode: "stock" as SortMode, label: "Stock" },
                      { mode: "rate" as SortMode, label: "Rate" },
                      { mode: "capacity" as SortMode, label: "Capacity" },
                    ].map((tab) => (
                      <Button
                        key={tab.mode}
                        onClick={() => setSortMode(tab.mode)}
                        size="sm"
                        variant="outline"
                        className={`h-7 px-2 text-[10px] rounded-md ${
                          sortMode === tab.mode
                            ? "border-brand/40 text-brand bg-brand/10 hover:bg-brand/20"
                            : "border-transparent text-muted-label bg-transparent hover:text-subtle hover:bg-transparent"
                        }`}
                      >
                        {tab.label}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Quick Filters (only for overview) */}
                {viewMode === "overview" && (
                  <div className="flex bg-muted-label/50 border border-muted-label/40 rounded-lg p-0.5">
                    {[
                      { mode: "all" as QuickFilter, label: "All" },
                      { mode: "inStock" as QuickFilter, label: "In Stock" },
                      { mode: "critical" as QuickFilter, label: "Critical" },
                      { mode: "overflow" as QuickFilter, label: "Overflow" },
                    ].map((tab) => (
                      <Button
                        key={tab.mode}
                        onClick={() => setQuickFilter(tab.mode)}
                        size="sm"
                        variant="outline"
                        className={`h-7 px-2 text-[10px] rounded-md ${
                          quickFilter === tab.mode
                            ? "border-domain/40 text-domain bg-domain/10 hover:bg-domain/20"
                            : "border-transparent text-muted-label bg-transparent hover:text-subtle hover:bg-transparent"
                        }`}
                      >
                        {tab.label}
                      </Button>
                    ))}
                  </div>
                )}

                {/* Reset filters button — only visible when filters active */}
                {hasActiveFilter && (
                  <Button
                    onClick={resetFilters}
                    size="sm"
                    variant="outline"
                    aria-label="Reset all filters"
                    className="h-7 px-2 text-[10px] rounded-md border-warning/40 text-warning bg-warning/10 hover:bg-warning/20"
                  >
                    <X className="w-3 h-3" />
                    Reset
                  </Button>
                )}
              </div>

              {/* Search */}
              <div className="relative w-full sm:max-w-55">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-label" />
                <input
                  type="text"
                  aria-label="Search storage"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search materials..."
                  className="w-full bg-muted-label/50 border border-muted-label/40 rounded-lg pl-7 pr-7 py-1.5 text-[10px] text-subtle placeholder-muted-label focus:outline-none focus:border-brand/40"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    aria-label="Clear search"
                  >
                    <X className="w-3 h-3 text-muted-label hover:text-subtle" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto game-scrollbar">
        {/* Sort indicator badge — only when expanded AND user customized sort/filter */}
        {showControls &&
          viewMode === "overview" &&
          (sortMode !== "tier" || quickFilter !== "all") && (
            <div className="flex items-center gap-2 mb-2 text-[10px] text-muted-label flex-wrap">
              {sortMode !== "tier" && (
                <>
                  <span>Sorted:</span>
                  <Badge
                    variant="outline"
                    className="border-brand/40 text-brand bg-brand/10 font-medium"
                  >
                    {sortMode === "stock"
                      ? "Stock"
                      : sortMode === "rate"
                        ? "Rate"
                        : "Fill %"}
                  </Badge>
                </>
              )}
              {quickFilter !== "all" && (
                <Badge
                  variant="outline"
                  className="border-domain/40 text-domain bg-domain/10 font-medium"
                >
                  {quickFilter === "inStock"
                    ? "In Stock"
                    : quickFilter === "critical"
                      ? "Critical"
                      : "Overflow"}
                </Badge>
              )}
            </div>
          )}
        {viewMode === "overview" && renderOverviewView()}
        {viewMode === "dependencies" && renderDependenciesView()}
        {viewMode === "alerts" && renderAlertsView()}
      </div>
    </div>
  );
}

// ─── Storage Level Badge ──────────────────────────────────────────────────────
function StorageLevelBadge({ level }: { level: number }) {
  // Color tier: ≥20 = success (max), ≥10 = brand (mid), else warning (low).
  const colorClass =
    level >= 20
      ? "border-success/40 text-success bg-success/10"
      : level >= 10
        ? "border-brand/40 text-brand bg-brand/10"
        : "border-warning/40 text-warning bg-warning/10";
  return (
    <Badge variant="outline" className={`text-[11px] font-bold ${colorClass}`}>
      LV{level}
    </Badge>
  );
}
