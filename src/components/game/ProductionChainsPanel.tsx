"use client";

import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Factory,
  Gauge,
  GitBranch,
  Pickaxe,
  Search,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductionChainPanel } from "@/components/game/ProductionChainPanel";
import { GameIcon } from "@/components/icons";
import { BUILDING_DEFS, PRODUCTION_CHAINS, RESOURCE_META } from "@/lib/game/configCache";
import { formatNumber, useGameStore } from "@/lib/game/store";
import type { ResourceType } from "@/lib/game/types";
import { useNavigateToTab } from "@/lib/hooks/page/useNavigateToTab";

type ChainCategory = "all" | "raw" | "components" | "energy" | "blocked" | "active";

const CHAIN_CATEGORIES: Array<{ id: ChainCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "raw", label: "Raw" },
  { id: "components", label: "Components" },
  { id: "energy", label: "Energy" },
  { id: "blocked", label: "Blocked" },
  { id: "active", label: "Active" },
];

function isEnergyStep(step: string) {
  const value = step.toLowerCase();
  return value.includes("power") || value.includes("energy") || value.includes("fuel") || value.includes("coal") || value.includes("oil");
}

function matchesCategory(
  chain: { isActive: boolean; bottleneckSteps: number; maxTier: number; steps: string[] },
  category: ChainCategory,
) {
  if (category === "active") return chain.isActive;
  if (category === "blocked") return chain.bottleneckSteps > 0;
  if (category === "raw") return chain.maxTier <= 1;
  if (category === "components") return chain.maxTier >= 2 && !chain.steps.some(isEnergyStep);
  if (category === "energy") return chain.steps.some(isEnergyStep);
  return true;
}

export function ProductionChainsPanel() {
  const navigateToTab = useNavigateToTab();
  const store = useGameStore(
    useShallow((s) => ({
      buildings: s.buildings,
      productionSnapshot: s.productionSnapshot,
      resources: s.resources,
      resourceCapacity: s.resourceCapacity,
      powerGrid: s.powerGrid,
    })),
  );
  const [category, setCategory] = useState<ChainCategory>("all");
  const [selectedChain, setSelectedChain] = useState(0);

  const productionRates = store.productionSnapshot.production;
  const consumptionRates = store.productionSnapshot.actualConsumption;

  const chainSummaries = useMemo(() => {
    return PRODUCTION_CHAINS.map((chain) => {
      const activeSteps = chain.steps.filter(
        (step) => (productionRates[step as ResourceType] ?? 0) > 0,
      ).length;
      const bottleneckSteps = chain.steps.filter(
        (step) => (productionRates[step as ResourceType] ?? 0) <= 0,
      ).length;
      const throughput = chain.steps.reduce(
        (sum, step) => sum + Math.max(0, productionRates[step as ResourceType] ?? 0),
        0,
      );
      const maxTier = chain.steps.reduce((tier, step) => {
        const meta = RESOURCE_META[step as ResourceType];
        return Math.max(tier, meta?.tier ?? 0);
      }, 0);

      return {
        name: chain.name,
        color: chain.color,
        steps: chain.steps,
        activeSteps,
        bottleneckSteps,
        throughput,
        maxTier,
        isActive: activeSteps === chain.steps.length && chain.steps.length > 0,
      };
    });
  }, [productionRates]);

  const filteredChains = useMemo(() => {
    return chainSummaries
      .map((chain, index) => ({ ...chain, index }))
      .filter((chain) => matchesCategory(chain, category));
  }, [category, chainSummaries]);

  const handleCategoryChange = (nextCategory: ChainCategory) => {
    setCategory(nextCategory);
    const nextChain = chainSummaries
      .map((chain, index) => ({ ...chain, index }))
      .find((chain) => matchesCategory(chain, nextCategory));
    if (nextChain) setSelectedChain(nextChain.index);
  };

  const totalThroughput = chainSummaries.reduce((sum, chain) => sum + chain.throughput, 0);
  const activeChains = chainSummaries.filter((chain) => chain.isActive).length;
  const blockedChains = chainSummaries.filter((chain) => chain.bottleneckSteps > 0).length;
  const topBottlenecks = useMemo(() => {
    const missingSteps = new Map<ResourceType, { count: number; producerNames: string[] }>();

    chainSummaries.forEach((chain) => {
      chain.steps.forEach((step) => {
        const resource = step as ResourceType;
        if ((productionRates[resource] ?? 0) > 0) return;

        const producers = Object.values(BUILDING_DEFS)
          .filter((def) => def.outputs?.some((output) => output.resource === resource))
          .map((def) => def.name);
        const current = missingSteps.get(resource) ?? { count: 0, producerNames: [] };
        missingSteps.set(resource, {
          count: current.count + 1,
          producerNames: [...new Set([...current.producerNames, ...producers])],
        });
      });
    });

    return [...missingSteps.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4);
  }, [chainSummaries, productionRates]);

  const resourceFlow = useMemo(() => {
    const resources = new Set<ResourceType>([
      ...(Object.keys(productionRates) as ResourceType[]),
      ...(Object.keys(consumptionRates) as ResourceType[]),
    ]);

    return [...resources]
      .map((resource) => ({
        resource,
        production: productionRates[resource] ?? 0,
        consumption: consumptionRates[resource] ?? 0,
        stock: store.resources[resource] ?? 0,
        capacity: store.resourceCapacity[resource] ?? 0,
      }))
      .filter((row) => row.production > 0 || row.consumption > 0 || row.stock > 0)
      .sort((a, b) => b.production + b.consumption - (a.production + a.consumption))
      .slice(0, 8);
  }, [consumptionRates, productionRates, store.resourceCapacity, store.resources]);

  const selectedChainSummary = chainSummaries[selectedChain];
  const selectedBottleneck = selectedChainSummary?.steps.find(
    (step) => (productionRates[step as ResourceType] ?? 0) <= 0,
  ) as ResourceType | undefined;
  const selectedStoragePressure = selectedChainSummary?.steps.find((step) => {
    const resource = step as ResourceType;
    const capacity = store.resourceCapacity[resource] ?? 0;
    if (capacity <= 0) return false;
    return ((store.resources[resource] ?? 0) / capacity) > 0.9;
  }) as ResourceType | undefined;
  const powerMargin = store.powerGrid.totalProduction - store.powerGrid.totalConsumption;
  const selectedAction = (() => {
    if (powerMargin < 0) {
      return {
        label: "Build Power",
        icon: <Zap className="w-3 h-3 mr-1" />,
        onClick: () => navigateToTab("power", "build-power"),
      };
    }

    if (selectedBottleneck) {
      const producer = Object.values(BUILDING_DEFS).find((def) =>
        def.outputs?.some((output) => output.resource === selectedBottleneck),
      );
      const targetTab = producer?.category === "extractor" ? "resources" : "factories";
      return {
        label: targetTab === "resources" ? "Build Extractor" : "Build Factory",
        icon: targetTab === "resources" ? <Pickaxe className="w-3 h-3 mr-1" /> : <Factory className="w-3 h-3 mr-1" />,
        onClick: () => navigateToTab(targetTab, targetTab === "resources" ? "build-extractors" : undefined),
      };
    }

    if (selectedStoragePressure) {
      return {
        label: "Upgrade Storage",
        icon: <Database className="w-3 h-3 mr-1" />,
        onClick: () => navigateToTab("storage"),
      };
    }

    return {
      label: "Open Factories",
      icon: <Factory className="w-3 h-3 mr-1" />,
      onClick: () => navigateToTab("factories"),
    };
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-brand neon-glow-cyan tracking-wide flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Production Chains
          </h2>
          <p className="text-xs text-muted-label mt-0.5">
            Trace resource flow, bottlenecks, and producer coverage across the factory.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] border-warning/50 text-warning"
            onClick={() => navigateToTab("resources", "build-extractors")}
          >
            <Pickaxe className="w-3 h-3 mr-1" />
            Extraction
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] border-domain/50 text-domain"
            onClick={() => navigateToTab("factories")}
          >
            <Factory className="w-3 h-3 mr-1" />
            Factories
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] border-warning/50 text-warning"
            onClick={() => navigateToTab("power", "build-power")}
          >
            <Zap className="w-3 h-3 mr-1" />
            Power
          </Button>
        </div>
      </div>

      <div
        className={`rounded-xl border p-3 ${
          blockedChains > 0 || powerMargin < 0
            ? "border-warning/40 bg-warning/10"
            : "border-success/30 bg-success/10"
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            {blockedChains > 0 || powerMargin < 0 ? (
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-subtle">
                {powerMargin < 0
                  ? "Power shortage is limiting production"
                  : selectedBottleneck
                    ? `${RESOURCE_META[selectedBottleneck]?.name ?? selectedBottleneck} is blocking this chain`
                    : selectedStoragePressure
                      ? `${RESOURCE_META[selectedStoragePressure]?.name ?? selectedStoragePressure} storage is nearly full`
                      : "Selected chain has no critical blocker"}
              </p>
              <p className="text-[10px] text-muted-label mt-0.5">
                {selectedChainSummary
                  ? `${selectedChainSummary.name}: ${selectedChainSummary.activeSteps}/${selectedChainSummary.steps.length} steps active`
                  : "Production chain data is loading"}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] border-brand/40 text-brand shrink-0"
            onClick={selectedAction.onClick}
          >
            {selectedAction.icon}
            {selectedAction.label}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryTile icon={<CheckCircle2 className="w-4 h-4" />} label="Active Chains" value={`${activeChains}/${chainSummaries.length}`} tone="success" />
        <SummaryTile icon={<AlertTriangle className="w-4 h-4" />} label="Blocked Chains" value={String(blockedChains)} tone={blockedChains > 0 ? "danger" : "muted"} />
        <SummaryTile icon={<Gauge className="w-4 h-4" />} label="Throughput" value={`${formatNumber(totalThroughput)}/s`} tone="brand" />
        <SummaryTile icon={<Zap className="w-4 h-4" />} label="Power Margin" value={`${formatNumber(store.powerGrid.totalProduction - store.powerGrid.totalConsumption)} MW`} tone={store.powerGrid.totalProduction >= store.powerGrid.totalConsumption ? "success" : "danger"} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 game-scrollbar">
        {CHAIN_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleCategoryChange(item.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-semibold border transition-colors ${
              category === item.id
                ? "border-brand/70 bg-brand/20 text-brand"
                : "border-border bg-card text-muted-label hover:text-subtle hover:border-brand/30"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <ProductionChainPanel
            productionRates={productionRates}
            selectedChain={selectedChain}
            onSelectedChainChange={setSelectedChain}
          />

          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-brand">Chain Index</h3>
              </div>
              <Badge variant="outline" className="text-[9px] border-brand/40 text-brand">
                {filteredChains.length} shown
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredChains.map((chain) => (
                <button
                  key={chain.name}
                  type="button"
                  onClick={() => setSelectedChain(chain.index)}
                  aria-pressed={selectedChain === chain.index}
                  className={`rounded-lg border bg-background p-3 text-left transition-colors ${
                    selectedChain === chain.index
                      ? "border-brand/50 shadow-[0_0_16px_rgba(0,255,242,0.08)]"
                      : "border-border hover:border-brand/30"
                  }`}
                  style={{ borderColor: selectedChain === chain.index ? `${chain.color}88` : `${chain.color}33` }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: chain.color }}>
                        {chain.name}
                      </p>
                      <p className="text-[10px] text-muted-label">
                        {chain.activeSteps}/{chain.steps.length} steps active
                      </p>
                    </div>
                    {chain.isActive ? (
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto game-scrollbar pb-1">
                    {chain.steps.map((step, index) => {
                      const resource = step as ResourceType;
                      const meta = RESOURCE_META[resource];
                      const isProducing = (productionRates[resource] ?? 0) > 0;
                      return (
                        <div key={step} className="flex items-center gap-1 shrink-0">
                          <div
                            className={`h-8 w-8 rounded-lg border flex items-center justify-center ${
                              isProducing ? "border-success/40 bg-success/10" : "border-danger/40 bg-danger/10"
                            }`}
                            title={meta?.name ?? step}
                          >
                            {meta ? <GameIcon icon={meta.icon} size={16} /> : null}
                          </div>
                          {index < chain.steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-label" />}
                        </div>
                      );
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <h3 className="text-sm font-semibold text-warning">Top Bottlenecks</h3>
            </div>
            {topBottlenecks.length === 0 ? (
              <p className="text-xs text-muted-label">No bottlenecks detected in visible chains.</p>
            ) : (
              <div className="space-y-2">
                {topBottlenecks.map(([resource, info]) => {
                  const meta = RESOURCE_META[resource];
                  return (
                    <div key={resource} className="rounded-lg border border-border bg-background p-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {meta ? <GameIcon icon={meta.icon} size={16} /> : null}
                          <span className="text-xs font-semibold text-subtle truncate">{meta?.name ?? resource}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] border-danger/40 text-danger">
                          {info.count}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-label mt-1 truncate">
                        Build: {info.producerNames.join(", ") || "producer unavailable"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Resource Flow</h3>
            </div>
            <div className="space-y-2">
              {resourceFlow.map((row) => {
                const meta = RESOURCE_META[row.resource];
                const net = row.production - row.consumption;
                return (
                  <div key={row.resource} className="rounded-lg border border-border bg-background p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {meta ? <GameIcon icon={meta.icon} size={16} /> : null}
                        <span className="text-xs font-semibold text-subtle truncate">{meta?.name ?? row.resource}</span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold ${net >= 0 ? "text-success" : "text-danger"}`}>
                        {net >= 0 ? "+" : ""}{formatNumber(net)}/s
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-label mt-1">
                      {formatNumber(row.stock)} / {formatNumber(row.capacity)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "brand" | "success" | "danger" | "muted";
}) {
  const toneClass = {
    brand: "text-brand border-brand/30 bg-brand/10",
    success: "text-success border-success/30 bg-success/10",
    danger: "text-danger border-danger/30 bg-danger/10",
    muted: "text-muted-label border-border bg-card",
  }[tone];

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0">{icon}</span>
        <span className="text-lg font-bold font-mono truncate">{value}</span>
      </div>
      <p className="text-[10px] text-muted-label mt-1">{label}</p>
    </div>
  );
}
