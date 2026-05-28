'use client';

import { useState, useMemo, useCallback } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { TRANSPORT_DEFS, BUILDING_DEFS, RESOURCE_META, WEATHER_DEFS } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Truck, ArrowRight, ChevronUp, Power, AlertTriangle,
  Package, Route, Zap, Gauge, CircleDot, Lightbulb,
  BarChart3, X, Cloud, CheckCircle2, XCircle, Activity,
  Network, ShieldAlert, TrendingUp, TrendingDown, Minus,
  ZapOff, Play, Pause, ChevronDown, ChevronRight, Link2
} from 'lucide-react';
import { TransportType, ResourceType, BuildingInstance } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { motion, AnimatePresence } from 'framer-motion';

// --- Tier Color Map ---
const TIER_COLORS: Record<number, { fill: string; stroke: string; text: string; bg: string; label: string }> = {
  0: { fill: '#78350f', stroke: '#d97706', text: 'text-amber-400', bg: 'bg-amber-900/20', label: 'Raw' },
  1: { fill: '#164e63', stroke: '#22d3ee', text: 'text-cyan-400', bg: 'bg-cyan-900/20', label: 'T1' },
  2: { fill: '#14532d', stroke: '#4ade80', text: 'text-green-400', bg: 'bg-green-900/20', label: 'T2' },
  3: { fill: '#3b0764', stroke: '#c084fc', text: 'text-purple-400', bg: 'bg-purple-900/20', label: 'T3' },
  4: { fill: '#422006', stroke: '#fbbf24', text: 'text-yellow-400', bg: 'bg-yellow-900/20', label: 'T4' },
};

function getBuildingTier(b: BuildingInstance): number {
  const def = BUILDING_DEFS[b.type];
  if (!def) return 0;
  if (def.category === 'extractor') return 0;
  return def.tier;
}

function getTransportCost(type: TransportType): number {
  return TRANSPORT_DEFS[type].baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0);
}

function getUpgradeCost(line: { type: TransportType; level: number }): number {
  const def = TRANSPORT_DEFS[line.type];
  return Math.floor(def.baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0) * Math.pow(1.3, line.level));
}

const TRANSPORT_TYPES: TransportType[] = ['conveyorBelt', 'pipe', 'truck', 'cargoTrain', 'drone', 'cargoShip'];

const CHEAPEST_TYPE = TRANSPORT_TYPES.reduce((best, type) => {
  const cost = getTransportCost(type);
  const bestCost = getTransportCost(best);
  return cost < bestCost ? type : best;
}, 'conveyorBelt' as TransportType);

export function TransportPanel() {
  const store = useGameStore();
  const [selectedType, setSelectedType] = useState<TransportType>('conveyorBelt');
  const [fromBuilding, setFromBuilding] = useState<string>('');
  const [toBuilding, setToBuilding] = useState<string>('');
  const [carriesResource, setCarriesResource] = useState<ResourceType | ''>('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showConnectAllDialog, setShowConnectAllDialog] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ lines: true, throughput: true });

  // --- Derived Data ---
  const activeLines = useMemo(() => store.transportLines.filter(l => l.active), [store.transportLines]);
  const totalThroughput = useMemo(() => activeLines.reduce((sum, l) => sum + l.throughput, 0), [activeLines]);
  const totalMaxThroughput = useMemo(() => store.transportLines.reduce((sum, l) => sum + l.maxThroughput, 0), [store.transportLines]);

  const producingBuildings = useMemo(() =>
    store.buildings.filter(b => {
      const def = BUILDING_DEFS[b.type];
      return def?.outputs && def.outputs.length > 0 && b.active;
    }), [store.buildings]);

  const consumingBuildings = useMemo(() =>
    store.buildings.filter(b => {
      const def = BUILDING_DEFS[b.type];
      return def?.inputs && def.inputs.length > 0 && b.active;
    }), [store.buildings]);

  // --- Smart Route Builder: Filtered resources based on selected "From" ---
  const fromBuildingOutputs = useMemo(() => {
    if (!fromBuilding) return [];
    const b = store.buildings.find(bld => bld.id === fromBuilding);
    if (!b) return [];
    const def = BUILDING_DEFS[b.type];
    if (!def?.outputs) return [];
    return def.outputs
      .filter(o => o.resource !== 'money')
      .map(o => o.resource as ResourceType);
  }, [fromBuilding, store.buildings]);

  // When fromBuilding changes, reset carriesResource if not in new outputs
  const handleFromChange = useCallback((val: string) => {
    setFromBuilding(val);
    if (val) {
      const b = store.buildings.find(bld => bld.id === val);
      const def = b ? BUILDING_DEFS[b.type] : null;
      const outputs = def?.outputs?.filter(o => o.resource !== 'money').map(o => o.resource as ResourceType) ?? [];
      if (outputs.length > 0) {
        setCarriesResource(prev => (outputs.includes(prev as ResourceType) ? prev : outputs[0]));
      } else {
        setCarriesResource('');
      }
    } else {
      setCarriesResource('');
    }
    setToBuilding('');
  }, [store.buildings]);

  // --- Smart Route Builder: Filtered "To" buildings based on selected resource ---
  const filteredToBuildings = useMemo(() => {
    if (!carriesResource) return consumingBuildings;
    return consumingBuildings.filter(b => {
      const def = BUILDING_DEFS[b.type];
      return def?.inputs?.some(i => i.resource === carriesResource);
    });
  }, [carriesResource, consumingBuildings]);

  // --- Live Preview ---
  const previewData = useMemo(() => {
    if (!fromBuilding || !toBuilding || !carriesResource || fromBuilding === toBuilding) return null;
    const def = TRANSPORT_DEFS[selectedType];
    const fromB = store.buildings.find(b => b.id === fromBuilding);
    const toB = store.buildings.find(b => b.id === toBuilding);
    if (!fromB || !toB) return null;
    const fromDef = BUILDING_DEFS[fromB.type];
    const toDef = BUILDING_DEFS[toB.type];
    const outputAmount = fromDef?.outputs?.find(o => o.resource === carriesResource)?.amount ?? 0;
    const inputAmount = toDef?.inputs?.find(i => i.resource === carriesResource)?.amount ?? 0;
    const estimatedThroughput = Math.min(def.baseThroughput, outputAmount * fromB.level, inputAmount * toB.level);
    const cost = getTransportCost(selectedType);
    const canAfford = store.money >= cost;
    return { fromDef, toDef, estimatedThroughput, cost, canAfford, outputAmount, inputAmount };
  }, [fromBuilding, toBuilding, carriesResource, selectedType, store.buildings, store.money]);

  // --- Route Suggestions ---
  const routeSuggestions = useMemo(() => {
    const suggestions: { from: BuildingInstance; to: BuildingInstance; resource: ResourceType; reason: string }[] = [];
    const existingRoutes = new Set(store.transportLines.map(l => `${l.fromBuilding}-${l.toBuilding}-${l.carriesResource}`));
    consumingBuildings.forEach(consumer => {
      const consumerDef = BUILDING_DEFS[consumer.type];
      if (!consumerDef?.inputs) return;
      consumerDef.inputs.forEach(input => {
        if (input.resource === 'money') return;
        const res = input.resource as ResourceType;
        const producers = producingBuildings.filter(b => {
          const def = BUILDING_DEFS[b.type];
          return def?.outputs?.some(o => o.resource === res);
        });
        producers.forEach(producer => {
          const routeKey = `${producer.id}-${consumer.id}-${res}`;
          if (!existingRoutes.has(routeKey)) {
            suggestions.push({
              from: producer,
              to: consumer,
              resource: res,
              reason: `${BUILDING_DEFS[consumer.type]?.name} needs ${RESOURCE_META[res]?.name} from ${BUILDING_DEFS[producer.type]?.name}`,
            });
          }
        });
      });
    });
    return suggestions;
  }, [consumingBuildings, producingBuildings, store.transportLines]);

  // --- Auto-Connect All ---
  const connectAllData = useMemo(() => {
    const routes: { from: string; to: string; resource: ResourceType; fromName: string; toName: string; resName: string }[] = [];
    const existingRoutes = new Set(store.transportLines.map(l => `${l.fromBuilding}-${l.toBuilding}-${l.carriesResource}`));
    consumingBuildings.forEach(consumer => {
      const consumerDef = BUILDING_DEFS[consumer.type];
      if (!consumerDef?.inputs) return;
      consumerDef.inputs.forEach(input => {
        if (input.resource === 'money') return;
        const res = input.resource as ResourceType;
        producingBuildings.forEach(producer => {
          const def = BUILDING_DEFS[producer.type];
          if (!def?.outputs?.some(o => o.resource === res)) return;
          const routeKey = `${producer.id}-${consumer.id}-${res}`;
          if (!existingRoutes.has(routeKey)) {
            routes.push({
              from: producer.id,
              to: consumer.id,
              resource: res,
              fromName: BUILDING_DEFS[producer.type]?.name ?? '',
              toName: BUILDING_DEFS[consumer.type]?.name ?? '',
              resName: RESOURCE_META[res]?.name ?? res,
            });
          }
        });
      });
    });
    const totalCost = routes.length * getTransportCost(CHEAPEST_TYPE);
    return { routes, totalCost, canAfford: store.money >= totalCost };
  }, [consumingBuildings, producingBuildings, store.transportLines, store.money]);

  const handleConnectAll = useCallback(() => {
    connectAllData.routes.forEach(r => {
      store.buildTransportLine(CHEAPEST_TYPE, r.from, r.to, r.resource);
    });
    setShowConnectAllDialog(false);
  }, [connectAllData.routes, store]);

  const handleCreateSuggestedRoute = useCallback((from: string, to: string, resource: ResourceType) => {
    store.buildTransportLine(CHEAPEST_TYPE, from, to, resource);
  }, [store]);

  const handleBuild = useCallback(() => {
    if (!fromBuilding || !toBuilding || !carriesResource) return;
    store.buildTransportLine(selectedType, fromBuilding, toBuilding, carriesResource as ResourceType);
    setFromBuilding('');
    setToBuilding('');
    setCarriesResource('');
  }, [fromBuilding, toBuilding, carriesResource, selectedType, store]);

  // --- Production Chain Overview ---
  const productionChain = useMemo(() => {
    const tiers: { tier: number; label: string; buildings: { id: string; name: string; emoji: string; connected: boolean }[] }[] = [];
    for (let t = 0; t <= 4; t++) {
      const tierBuildings = store.buildings.filter(b => getBuildingTier(b) === t);
      if (tierBuildings.length === 0) continue;
      const items = tierBuildings.map(b => {
        const def = BUILDING_DEFS[b.type];
        const hasOut = store.transportLines.some(l => l.fromBuilding === b.id);
        const hasIn = store.transportLines.some(l => l.toBuilding === b.id);
        return {
          id: b.id,
          name: def?.name ?? '',
          emoji: def?.emoji ?? '',
          connected: hasOut || hasIn,
        };
      });
      tiers.push({ tier: t, label: TIER_COLORS[t]?.label ?? `T${t}`, buildings: items });
    }
    const totalBuildings = tiers.reduce((s, t) => s + t.buildings.length, 0);
    const connectedBuildings = tiers.reduce((s, t) => s + t.buildings.filter(b => b.connected).length, 0);
    const completeness = totalBuildings > 0 ? (connectedBuildings / totalBuildings) * 100 : 100;
    return { tiers, completeness, totalBuildings, connectedBuildings };
  }, [store.buildings, store.transportLines]);

  // --- Network Health Score ---
  const networkHealth = useMemo(() => {
    if (store.buildings.length === 0) return { score: 100, details: { connectivity: 100, activeRate: 100, utilization: 100, bottleneckPenalty: 0 } };
    const buildingsWithTransport = store.buildings.filter(b =>
      store.transportLines.some(l => l.fromBuilding === b.id || l.toBuilding === b.id)
    ).length;
    const connectivity = store.buildings.length > 0 ? (buildingsWithTransport / store.buildings.length) * 100 : 100;
    const activeRate = store.transportLines.length > 0 ? (activeLines.length / store.transportLines.length) * 100 : 100;
    const avgUtilization = store.transportLines.length > 0
      ? store.transportLines.reduce((s, l) => s + (l.throughput / l.maxThroughput), 0) / store.transportLines.length * 100
      : 100;

    // Bottleneck penalty
    let bottleneckCount = 0;
    store.buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def) return;
      if (def.outputs && def.outputs.length > 0) {
        const outLines = store.transportLines.filter(l => l.fromBuilding === b.id && l.active);
        if (outLines.length === 0 && producingBuildings.some(pb => pb.id === b.id)) bottleneckCount++;
      }
      if (def.inputs && def.inputs.length > 0) {
        def.inputs.forEach(input => {
          if (input.resource === 'money') return;
          const inLines = store.transportLines.filter(l => l.toBuilding === b.id && l.carriesResource === (input.resource as ResourceType) && l.active);
          if (inLines.length === 0) bottleneckCount++;
        });
      }
      store.transportLines.filter(l => l.fromBuilding === b.id && l.active).forEach(line => {
        if (line.throughput / line.maxThroughput > 0.85) bottleneckCount++;
      });
    });
    const bottleneckPenalty = Math.min(30, bottleneckCount * 5);
    const score = Math.max(0, Math.min(100, (connectivity * 0.35 + activeRate * 0.25 + avgUtilization * 0.25 - bottleneckPenalty + 15)));
    return { score, details: { connectivity, activeRate, utilization: avgUtilization, bottleneckPenalty } };
  }, [store.buildings, store.transportLines, activeLines, producingBuildings]);

  // --- Bottleneck Detection ---
  const bottlenecks = useMemo(() => {
    const issues: {
      building: BuildingInstance;
      reason: string;
      severity: 'critical' | 'warning' | 'info';
      solution: string;
      flowRate?: number;
      requiredRate?: number;
      type: 'under-supplied' | 'over-supplied' | 'no-route' | 'capacity' | 'power';
      action?: { label: string; onClick: () => void };
    }[] = [];

    store.buildings.forEach(b => {
      if (!b.active) return;
      const def = BUILDING_DEFS[b.type];
      if (!def) return;

      // 1. No outbound transport for producers
      if (def.outputs && def.outputs.length > 0) {
        const outLines = store.transportLines.filter(l => l.fromBuilding === b.id && l.active);
        if (outLines.length === 0 && producingBuildings.some(pb => pb.id === b.id)) {
          const outputResources = def.outputs.map(o => o.resource as ResourceType);
          const totalOutput = def.outputs.reduce((sum, o) => sum + o.amount * b.level, 0);
          const matchingConsumers = consumingBuildings.filter(cb => {
            const cbDef = BUILDING_DEFS[cb.type];
            return cbDef?.inputs?.some(i => outputResources.includes(i.resource as ResourceType));
          });
          issues.push({
            building: b,
            reason: 'No outbound transport — production may be wasted',
            severity: 'critical',
            type: 'no-route',
            flowRate: 0,
            requiredRate: totalOutput,
            solution: matchingConsumers.length > 0
              ? `Connect to ${BUILDING_DEFS[matchingConsumers[0].type]?.name} to deliver ${outputResources.map(r => RESOURCE_META[r]?.name ?? r).join(', ')}.`
              : `Build a consumer that processes ${outputResources.map(r => RESOURCE_META[r]?.name ?? r).join(', ')}.`,
            action: matchingConsumers.length > 0 ? {
              label: 'Create Route',
              onClick: () => handleCreateSuggestedRoute(b.id, matchingConsumers[0].id, outputResources[0]),
            } : undefined,
          });
        }
      }

      // 2. Transport line near capacity
      store.transportLines.filter(l => l.fromBuilding === b.id && l.active).forEach(line => {
        const util = line.throughput / line.maxThroughput;
        if (util > 0.85) {
          const lineDef = TRANSPORT_DEFS[line.type];
          const upgradeCost = getUpgradeCost(line);
          issues.push({
            building: b,
            reason: `${lineDef.name} at ${(util * 100).toFixed(0)}% capacity`,
            severity: 'warning',
            type: 'capacity',
            flowRate: line.throughput,
            requiredRate: line.maxThroughput,
            solution: `Upgrade to Lv.${line.level + 1} for $${formatNumber(upgradeCost)} or add a parallel line.`,
            action: store.money >= upgradeCost ? {
              label: `Upgrade ($${formatNumber(upgradeCost)})`,
              onClick: () => store.upgradeTransportLine(line.id),
            } : undefined,
          });
        }
      });

      // 3. Consumer missing inbound transport (Under-supplied)
      if (def.inputs && def.inputs.length > 0) {
        def.inputs.forEach(input => {
          if (input.resource === 'money') return;
          const res = input.resource as ResourceType;
          const inLines = store.transportLines.filter(l => l.toBuilding === b.id && l.carriesResource === res && l.active);
          const totalInboundRate = inLines.reduce((s, l) => s + l.throughput, 0);
          const consumptionRate = input.amount * b.level;

          if (inLines.length === 0) {
            const producers = producingBuildings.filter(pb => {
              const pbDef = BUILDING_DEFS[pb.type];
              return pbDef?.outputs?.some(o => o.resource === res);
            });
            issues.push({
              building: b,
              reason: `Missing inbound ${RESOURCE_META[res]?.name ?? res} — production stalled`,
              severity: 'critical',
              type: 'under-supplied',
              flowRate: 0,
              requiredRate: consumptionRate,
              solution: producers.length > 0
                ? `Connect ${BUILDING_DEFS[producers[0].type]?.name} to deliver ${RESOURCE_META[res]?.name ?? res}.`
                : `Build a producer for ${RESOURCE_META[res]?.name ?? res} first.`,
              action: producers.length > 0 ? {
                label: 'Create Route',
                onClick: () => handleCreateSuggestedRoute(producers[0].id, b.id, res),
              } : undefined,
            });
          } else if (totalInboundRate < consumptionRate * 0.8) {
            issues.push({
              building: b,
              reason: `Under-supplied ${RESOURCE_META[res]?.name ?? res}: ${totalInboundRate.toFixed(1)}/${consumptionRate.toFixed(1)}/t`,
              severity: 'warning',
              type: 'under-supplied',
              flowRate: totalInboundRate,
              requiredRate: consumptionRate,
              solution: `Increase inbound ${RESOURCE_META[res]?.name ?? res} transport capacity or add another route.`,
            });
          }
        });
      }

      // 4. Over-supplied detection (outbound exceeds consumer needs)
      if (def.outputs && def.outputs.length > 0) {
        def.outputs.forEach(output => {
          if (output.resource === 'money') return;
          const res = output.resource as ResourceType;
          const productionRate = output.amount * b.level;
          const outLines = store.transportLines.filter(l => l.fromBuilding === b.id && l.carriesResource === res && l.active);
          const totalOutboundCapacity = outLines.reduce((s, l) => s + l.maxThroughput, 0);
          const totalOutboundThroughput = outLines.reduce((s, l) => s + l.throughput, 0);

          if (outLines.length > 0 && totalOutboundCapacity > productionRate * 2 && totalOutboundThroughput < productionRate * 0.5) {
            issues.push({
              building: b,
              reason: `Over-supplied ${RESOURCE_META[res]?.name ?? res}: producing ${productionRate.toFixed(1)}/t but only ${totalOutboundThroughput.toFixed(1)}/t consumed`,
              severity: 'info',
              type: 'over-supplied',
              flowRate: totalOutboundThroughput,
              requiredRate: productionRate,
              solution: `Consider redirecting excess ${RESOURCE_META[res]?.name ?? res} to other consumers or deactivating redundant lines.`,
            });
          }
        });
      }

      // 5. Power overload
      if (b.efficiency < 0.5 && store.powerGrid.overload) {
        issues.push({
          building: b,
          reason: `Running at ${(b.efficiency * 100).toFixed(0)}% — power grid overloaded`,
          severity: 'warning',
          type: 'power',
          solution: 'Build more power plants or deactivate non-essential buildings.',
        });
      }
    });

    if (store.transportLines.length === 0 && store.buildings.length > 2) {
      issues.push({
        building: store.buildings[0],
        reason: 'No transport network — buildings operate independently',
        severity: 'info',
        type: 'no-route',
        solution: 'Build transport lines to connect producers to consumers.',
        action: routeSuggestions.length > 0 ? {
          label: 'Show Suggestions',
          onClick: () => setShowSuggestions(true),
        } : undefined,
      });
    }

    const severityOrder = { critical: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return issues;
  }, [store.buildings, store.transportLines, store.powerGrid.overload, producingBuildings, consumingBuildings, routeSuggestions.length, handleCreateSuggestedRoute, store]);

  // --- Resource Flow Summary ---
  const resourceFlow = useMemo(() => {
    const flowMap = new Map<ResourceType, { production: number; consumption: number; surplus: number; name: string; emoji: string; tier: number; color: string }>();

    // Calculate production rates from producing buildings
    producingBuildings.forEach(b => {
      const def = BUILDING_DEFS[b.type];
      if (!def?.outputs) return;
      def.outputs.forEach(o => {
        if (o.resource === 'money') return;
        const res = o.resource as ResourceType;
        const existing = flowMap.get(res) ?? { production: 0, consumption: 0, surplus: 0, name: RESOURCE_META[res]?.name ?? res, emoji: RESOURCE_META[res]?.emoji ?? '', tier: RESOURCE_META[res]?.tier ?? 0, color: RESOURCE_META[res]?.color ?? '#888' };
        existing.production += o.amount * b.level * b.efficiency;
        flowMap.set(res, existing);
      });
    });

    // Calculate consumption rates from consuming buildings
    consumingBuildings.forEach(b => {
      const def = BUILDING_DEFS[b.type];
      if (!def?.inputs) return;
      def.inputs.forEach(i => {
        if (i.resource === 'money') return;
        const res = i.resource as ResourceType;
        const existing = flowMap.get(res) ?? { production: 0, consumption: 0, surplus: 0, name: RESOURCE_META[res]?.name ?? res, emoji: RESOURCE_META[res]?.emoji ?? '', tier: RESOURCE_META[res]?.tier ?? 0, color: RESOURCE_META[res]?.color ?? '#888' };
        existing.consumption += i.amount * b.level * b.efficiency;
        flowMap.set(res, existing);
      });
    });

    flowMap.forEach(v => { v.surplus = v.production - v.consumption; });
    return Array.from(flowMap.entries())
      .map(([resource, data]) => ({ resource, ...data }))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  }, [producingBuildings, consumingBuildings]);

  // --- Throughput by Type ---
  const throughputByType = useMemo(() => {
    return TRANSPORT_TYPES
      .map(type => {
        const def = TRANSPORT_DEFS[type];
        const lines = store.transportLines.filter(l => l.type === type);
        const activeTypeLines = lines.filter(l => l.active);
        const throughput = activeTypeLines.reduce((s, l) => s + l.throughput, 0);
        const capacity = lines.reduce((s, l) => s + l.maxThroughput, 0);
        const utilization = capacity > 0 ? (throughput / capacity) * 100 : 0;
        const totalUpgradeCost = lines.reduce((s, l) => s + getUpgradeCost(l), 0);
        return { type, def, count: lines.length, throughput, capacity, utilization, totalUpgradeCost };
      })
      .filter(t => t.count > 0);
  }, [store.transportLines]);

  // --- Enhanced Route Diagram Nodes (organized by tier) ---
  const routeDiagram = useMemo(() => {
    const connectedBuildingIds = new Set<string>();
    store.transportLines.forEach(l => {
      connectedBuildingIds.add(l.fromBuilding);
      connectedBuildingIds.add(l.toBuilding);
    });

    const connectedBuildings = store.buildings.filter(b => connectedBuildingIds.has(b.id));
    if (connectedBuildings.length === 0) return { nodes: [], width: 300, height: 200 };

    // Group by tier
    const tierGroups = new Map<number, BuildingInstance[]>();
    connectedBuildings.forEach(b => {
      const tier = getBuildingTier(b);
      if (!tierGroups.has(tier)) tierGroups.set(tier, []);
      tierGroups.get(tier)!.push(b);
    });

    const sortedTiers = Array.from(tierGroups.entries()).sort((a, b) => a[0] - b[0]);
    const nodeW = 48;
    const nodeH = 48;
    const colGap = 140;
    const rowGap = 68;
    const padX = 40;
    const padY = 40;

    const nodes: { id: string; emoji: string; name: string; x: number; y: number; tier: number }[] = [];
    sortedTiers.forEach(([, buildings], colIdx) => {
      buildings.forEach((b, rowIdx) => {
        const def = BUILDING_DEFS[b.type];
        if (!def) return;
        nodes.push({
          id: b.id,
          emoji: def.emoji,
          name: def.name,
          x: padX + colIdx * colGap,
          y: padY + rowIdx * rowGap,
          tier: getBuildingTier(b),
        });
      });
    });

    const maxCol = sortedTiers.length - 1;
    const maxRowsInCol = Math.max(...sortedTiers.map(([, b]) => b.length));
    const width = Math.max(300, padX * 2 + maxCol * colGap + nodeW);
    const height = Math.max(200, padY * 2 + (maxRowsInCol - 1) * rowGap + nodeH);

    return { nodes, width, height };
  }, [store.buildings, store.transportLines]);

  // --- Weather Effects ---
  const weatherDef = WEATHER_DEFS[store.weather.current];

  // --- Bulk Operations ---
  const handleUpgradeAllType = useCallback((type: TransportType) => {
    store.transportLines.filter(l => l.type === type).forEach(l => {
      const cost = getUpgradeCost(l);
      if (store.money >= cost) {
        store.upgradeTransportLine(l.id);
      }
    });
  }, [store]);

  const handleActivateAll = useCallback(() => {
    store.transportLines.filter(l => !l.active).forEach(l => store.toggleTransportLine(l.id));
  }, [store]);

  const handleDeactivateAll = useCallback(() => {
    store.transportLines.filter(l => l.active).forEach(l => store.toggleTransportLine(l.id));
  }, [store]);

  const toggleSection = useCallback((key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // --- Health Gauge Color ---
  const healthColor = networkHealth.score >= 80 ? '#4ade80' : networkHealth.score >= 50 ? '#eab308' : '#ef4444';
  const healthTextColor = networkHealth.score >= 80 ? 'text-green-400' : networkHealth.score >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-cyan-400 tracking-wide" style={{ textShadow: '0 0 10px rgba(34,211,238,0.3)' }}>
            Transport & Logistics
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage supply chains and logistics networks</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Weather Indicator */}
          <Badge variant="outline" className="border-amber-800/50 text-amber-400 bg-amber-900/10 text-[10px]">
            <span className="mr-1">{weatherDef.emoji}</span>
            {weatherDef.name}
          </Badge>
          <Badge variant="outline" className="border-cyan-800/50 text-cyan-400 bg-cyan-900/10 text-xs">
            <Route className="w-3 h-3 mr-1" />
            {store.transportLines.length} lines
          </Badge>
          <Badge variant="outline" className="border-teal-800/50 text-teal-400 bg-teal-900/10 text-xs">
            <Gauge className="w-3 h-3 mr-1" />
            {formatNumber(totalThroughput)} u/t
          </Badge>
        </div>
      </div>

      {/* Network Health Gauge + Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Network Health - Large gauge */}
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-cyan-900/30 col-span-2 sm:col-span-1 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 50% 50%, #22d3ee, transparent 70%)' }} />
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-[10px] text-gray-500 mb-1">Network Health</div>
            <svg width="60" height="60" viewBox="0 0 60 60" className="mb-1">
              <circle cx="30" cy="30" r="24" fill="none" stroke="#1e293b" strokeWidth="6" />
              <circle
                cx="30" cy="30" r="24" fill="none"
                stroke={healthColor}
                strokeWidth="6"
                strokeDasharray={`${(networkHealth.score / 100) * 150.8} 150.8`}
                strokeLinecap="round"
                transform="rotate(-90 30 30)"
                style={{ filter: `drop-shadow(0 0 4px ${healthColor})` }}
              />
              <text x="30" y="34" textAnchor="middle" fontSize="14" fontWeight="bold" fill={healthColor} fontFamily="monospace">
                {networkHealth.score.toFixed(0)}
              </text>
            </svg>
            <div className={`text-[10px] font-mono font-bold ${healthTextColor}`}>
              {networkHealth.score.toFixed(0)}%
            </div>
          </div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-cyan-900/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 50%, #22d3ee, transparent 70%)' }} />
          <div className="relative z-10">
            <div className="text-[10px] text-gray-500 mb-1">Active Lines</div>
            <div className="text-lg font-bold font-mono text-cyan-400">{activeLines.length}<span className="text-xs text-gray-500">/{store.transportLines.length}</span></div>
          </div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-teal-900/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 50%, #2dd4bf, transparent 70%)' }} />
          <div className="relative z-10">
            <div className="text-[10px] text-gray-500 mb-1">Throughput</div>
            <div className="text-lg font-bold font-mono text-teal-400">{formatNumber(totalThroughput)}<span className="text-[10px] text-gray-500">/{formatNumber(totalMaxThroughput)}</span></div>
          </div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-red-900/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 50%, #ef4444, transparent 70%)' }} />
          <div className="relative z-10">
            <div className="text-[10px] text-gray-500 mb-1">Bottlenecks</div>
            <div className={`text-lg font-bold font-mono ${bottlenecks.length > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {bottlenecks.length}
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: 2/3 left + 1/3 right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">

          {/* Route Diagram */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Network className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Route Diagram</h3>
              <span className="text-[10px] text-gray-500 ml-auto">{store.transportLines.length} connections</span>
            </div>
            {store.transportLines.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-800 rounded-lg">
                <Route className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No routes built yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Build transport lines to see them visualized here</p>
              </div>
            ) : (
              <div className="bg-[#0a0e17] rounded-lg p-2 overflow-x-auto game-scrollbar">
                <svg
                  width={routeDiagram.width}
                  height={routeDiagram.height}
                  className="w-full"
                  style={{ minWidth: '300px' }}
                >
                  {/* Grid lines */}
                  {Array.from({ length: Math.ceil(routeDiagram.height / 68) }).map((_, i) => (
                    <line key={`grid-h-${i}`} x1="0" y1={40 + i * 68} x2={routeDiagram.width} y2={40 + i * 68} stroke="#1e293b" strokeWidth="0.5" strokeDasharray="4 8" />
                  ))}
                  {/* Transport connections */}
                  {store.transportLines.map(line => {
                    const fromNode = routeDiagram.nodes.find(n => n.id === line.fromBuilding);
                    const toNode = routeDiagram.nodes.find(n => n.id === line.toBuilding);
                    if (!fromNode || !toNode) return null;
                    const util = line.throughput / line.maxThroughput;
                    const lineColor = !line.active ? '#374151' : util > 0.8 ? '#ef4444' : util > 0.5 ? '#eab308' : '#22d3ee';
                    const cx1 = fromNode.x + 24;
                    const cy1 = fromNode.y + 24;
                    const cx2 = toNode.x + 24;
                    const cy2 = toNode.y + 24;
                    return (
                      <g key={line.id}>
                        <line x1={cx1} y1={cy1} x2={cx2} y2={cy2} stroke={lineColor} strokeWidth={2} strokeDasharray={line.active ? 'none' : '4 4'} opacity={line.active ? 0.7 : 0.3} />
                        {line.active && (
                          <circle r="3" fill={lineColor}>
                            <animateMotion dur="2s" repeatCount="indefinite" path={`M${cx1},${cy1} L${cx2},${cy2}`} />
                          </circle>
                        )}
                        <text
                          x={(cx1 + cx2) / 2}
                          y={(cy1 + cy2) / 2 - 8}
                          textAnchor="middle"
                          fontSize="10"
                          opacity={line.active ? 0.8 : 0.3}
                        >
                          {RESOURCE_META[line.carriesResource]?.emoji || ''}
                        </text>
                      </g>
                    );
                  })}
                  {/* Building nodes */}
                  {routeDiagram.nodes.map(node => {
                    const tc = TIER_COLORS[node.tier] ?? TIER_COLORS[0];
                    return (
                      <g key={node.id}>
                        <rect x={node.x} y={node.y} width={48} height={48} rx={6} fill={tc.fill} stroke={tc.stroke} strokeWidth={1.5} />
                        <text x={node.x + 24} y={node.y + 30} textAnchor="middle" fontSize="18">{node.emoji}</text>
                        <text x={node.x + 24} y={node.y + 58} textAnchor="middle" fontSize="7" fill="#9ca3af">
                          {node.name.length > 12 ? node.name.slice(0, 11) + '…' : node.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* Smart Route Builder */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Smart Route Builder</h3>
            </div>

            {/* Transport Type Selector */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {TRANSPORT_TYPES.map(type => {
                const def = TRANSPORT_DEFS[type];
                const isSelected = selectedType === type;
                const cost = getTransportCost(type);
                return (
                  <GameItemTooltip
                    key={type}
                    name={def.name}
                    emoji={def.emoji}
                    description={def.description}
                    category="Transport"
                    details={[
                      { label: 'Throughput', value: `${def.baseThroughput} u/t`, color: 'text-cyan-400' },
                      { label: 'Base Cost', value: `$${formatNumber(cost)}`, color: 'text-green-400' },
                      { label: 'Upgrade x', value: `${def.upgradeMultiplier}`, color: 'text-purple-400' },
                    ]}
                    side="bottom"
                  >
                    <button
                      onClick={() => setSelectedType(type)}
                      className={`p-2 rounded-lg border text-center transition-all w-full ${
                        isSelected
                          ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-400'
                          : 'border-gray-800 bg-[#0a0e17] text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="text-lg">{def.emoji}</div>
                      <div className="text-[10px] font-medium mt-0.5">{def.name}</div>
                      <div className="text-[9px] text-gray-500">${formatNumber(cost)}</div>
                    </button>
                  </GameItemTooltip>
                );
              })}
            </div>

            {/* Route Configuration - Smart Filtering */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* From Building */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">From (Producer)</label>
                  <select
                    value={fromBuilding}
                    onChange={e => handleFromChange(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                  >
                    <option value="">Select source...</option>
                    {producingBuildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {BUILDING_DEFS[b.type]?.emoji} {BUILDING_DEFS[b.type]?.name} Lv.{b.level}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Carries Resource - Filtered by From outputs */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Carries Resource</label>
                  <select
                    value={carriesResource}
                    onChange={e => { setCarriesResource(e.target.value as ResourceType); setToBuilding(''); }}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                    disabled={!fromBuilding}
                  >
                    {!fromBuilding && <option value="">Select source first...</option>}
                    {fromBuildingOutputs.map(r => (
                      <option key={r} value={r}>
                        {RESOURCE_META[r]?.emoji} {RESOURCE_META[r]?.name}
                      </option>
                    ))}
                  </select>
                </div>
                {/* To Building - Filtered by resource consumers */}
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">To (Consumer)</label>
                  <select
                    value={toBuilding}
                    onChange={e => setToBuilding(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                    disabled={!carriesResource}
                  >
                    {!carriesResource && <option value="">Select resource first...</option>}
                    {carriesResource && <option value="">Select destination...</option>}
                    {filteredToBuildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {BUILDING_DEFS[b.type]?.emoji} {BUILDING_DEFS[b.type]?.name} Lv.{b.level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live Preview */}
              {previewData && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/30"
                >
                  <div className="text-[10px] text-cyan-400 font-semibold mb-2">ROUTE PREVIEW</div>
                  <div className="flex items-center gap-2 mb-2 text-xs">
                    <span>{previewData.fromDef?.emoji}</span>
                    <span className="text-gray-300">{previewData.fromDef?.name}</span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span>{RESOURCE_META[carriesResource as ResourceType]?.emoji}</span>
                    <span className="text-gray-300">{RESOURCE_META[carriesResource as ResourceType]?.name}</span>
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                    <span>{previewData.toDef?.emoji}</span>
                    <span className="text-gray-300">{previewData.toDef?.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div>
                      <span className="text-gray-500">Est. Throughput</span>
                      <div className="text-cyan-400 font-mono font-bold">{previewData.estimatedThroughput.toFixed(1)} u/t</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Cost</span>
                      <div className={`font-mono font-bold ${previewData.canAfford ? 'text-green-400' : 'text-red-400'}`}>${formatNumber(previewData.cost)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Transport</span>
                      <div className="text-cyan-400 font-mono font-bold">{TRANSPORT_DEFS[selectedType].emoji} {TRANSPORT_DEFS[selectedType].name}</div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Build Button */}
              <Button
                onClick={handleBuild}
                disabled={!fromBuilding || !toBuilding || !carriesResource || fromBuilding === toBuilding}
                className="w-full bg-cyan-700 hover:bg-cyan-600 text-white"
                size="sm"
              >
                <Truck className="w-3.5 h-3.5 mr-1.5" />
                Build {TRANSPORT_DEFS[selectedType].name}
              </Button>
            </div>
          </div>

          {/* Active Transport Lines */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Route className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Transport Lines</h3>
              <span className="text-[10px] text-gray-500 ml-auto">{store.transportLines.length} total</span>
              <button onClick={() => toggleSection('lines')} className="text-gray-500 hover:text-gray-300">
                {expandedSections.lines ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
            <AnimatePresence>
              {expandedSections.lines && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {store.transportLines.length === 0 ? (
                    <div className="text-center py-8">
                      <Truck className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                      <p className="text-xs text-gray-500">No transport lines built yet</p>
                      <p className="text-[10px] text-gray-600 mt-1">Connect producers to consumers to optimize production</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto game-scrollbar">
                      {store.transportLines.map(line => {
                        const def = TRANSPORT_DEFS[line.type];
                        const fromB = store.buildings.find(b => b.id === line.fromBuilding);
                        const toB = store.buildings.find(b => b.id === line.toBuilding);
                        const fromDef = fromB ? BUILDING_DEFS[fromB.type] : null;
                        const toDef = toB ? BUILDING_DEFS[toB.type] : null;
                        const upgradeCost = getUpgradeCost(line);
                        const throughputPct = line.maxThroughput > 0 ? (line.throughput / line.maxThroughput) * 100 : 0;

                        return (
                          <div key={line.id} className={`bg-[#0a0e17] rounded-lg p-3 border transition-all ${line.active ? 'border-cyan-900/30 hover:border-cyan-800/50' : 'border-gray-800 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-1 bg-gray-800/50 rounded px-1.5 py-0.5 min-w-0">
                                  <span className="text-xs">{fromDef?.emoji}</span>
                                  <span className="text-[10px] text-gray-300 truncate max-w-[70px]">{fromDef?.name}</span>
                                </div>
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  <ArrowRight className="w-3 h-3 text-gray-600" />
                                  <span className="text-xs">{RESOURCE_META[line.carriesResource]?.emoji}</span>
                                  <ArrowRight className="w-3 h-3 text-cyan-400" />
                                </div>
                                <div className="flex items-center gap-1 bg-gray-800/50 rounded px-1.5 py-0.5 min-w-0">
                                  <span className="text-xs">{toDef?.emoji}</span>
                                  <span className="text-[10px] text-gray-300 truncate max-w-[70px]">{toDef?.name}</span>
                                </div>
                              </div>
                            </div>
                            {/* Throughput bar */}
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative mb-2">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  throughputPct > 80 ? 'bg-gradient-to-r from-red-700 to-red-400' :
                                  throughputPct > 50 ? 'bg-gradient-to-r from-yellow-700 to-yellow-400' :
                                  'bg-gradient-to-r from-cyan-700 to-cyan-400'
                                }`}
                                style={{ width: `${Math.min(100, throughputPct)}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{def.emoji}</span>
                                <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400 px-1">
                                  Lv.{line.level}
                                </Badge>
                                <span className="text-[9px] text-gray-500 font-mono">{line.throughput.toFixed(1)}/{line.maxThroughput.toFixed(1)}</span>
                                <button
                                  onClick={() => store.toggleTransportLine(line.id)}
                                  className={`w-5 h-5 rounded-full border text-[10px] flex items-center justify-center transition-colors ${
                                    line.active ? 'border-green-500/50 text-green-400 bg-green-900/20 hover:bg-green-900/40' : 'border-gray-600 text-gray-500 hover:bg-gray-800'
                                  }`}
                                  title={line.active ? 'Deactivate' : 'Activate'}
                                >
                                  <Power className="w-3 h-3" />
                                </button>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-2 text-cyan-400 hover:text-cyan-300"
                                onClick={() => store.upgradeTransportLine(line.id)}
                                disabled={store.money < upgradeCost}
                              >
                                <ChevronUp className="w-3 h-3 mr-0.5" />
                                ${formatNumber(upgradeCost)}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Throughput by Type */}
          {throughputByType.length > 0 && (
            <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Throughput by Type</h3>
                <button onClick={() => toggleSection('throughput')} className="text-gray-500 hover:text-gray-300 ml-auto">
                  {expandedSections.throughput ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
              <AnimatePresence>
                {expandedSections.throughput && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                    <div className="space-y-3">
                      {throughputByType.map(({ type, def, count, throughput, capacity, utilization, totalUpgradeCost }) => (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{def.emoji}</span>
                              <span className="text-xs text-gray-300">{def.name}</span>
                              <span className="text-[10px] text-gray-500">x{count}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-gray-400 font-mono">{formatNumber(throughput)}/{formatNumber(capacity)} u/t</span>
                              <span className={`text-[10px] font-mono font-bold ${
                                utilization > 80 ? 'text-red-400' : utilization > 50 ? 'text-yellow-400' : 'text-green-400'
                              }`}>
                                {utilization.toFixed(0)}%
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-[9px] px-1.5 text-purple-400 hover:text-purple-300"
                                onClick={() => handleUpgradeAllType(type)}
                                disabled={store.money < totalUpgradeCost}
                                title={`Upgrade all ${def.name} lines ($${formatNumber(totalUpgradeCost)})`}
                              >
                                <ChevronUp className="w-2.5 h-2.5 mr-0.5" />
                                All
                              </Button>
                            </div>
                          </div>
                          <div className="h-3 bg-gray-800 rounded-full overflow-hidden relative">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                utilization > 80 ? 'bg-gradient-to-r from-red-700 to-red-400' :
                                utilization > 50 ? 'bg-gradient-to-r from-yellow-700 to-yellow-400' :
                                'bg-gradient-to-r from-green-700 to-green-400'
                              }`}
                              style={{ width: `${Math.min(100, utilization)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-medium">Total Network</span>
                        <span className="text-xs text-cyan-400 font-mono font-bold">{formatNumber(totalThroughput)}/{formatNumber(totalMaxThroughput)} u/t</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="space-y-4">

          {/* Weather Effects */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-amber-900/30">
            <div className="flex items-center gap-2 mb-3">
              <Cloud className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-400">Weather Effects</h3>
            </div>
            <div className="bg-[#0a0e17] rounded-lg p-3 border border-amber-900/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{weatherDef.emoji}</span>
                <div>
                  <div className="text-xs text-gray-200 font-medium">{weatherDef.name}</div>
                  <div className="text-[10px] text-gray-500">Intensity: {(store.weather.intensity * 100).toFixed(0)}%</div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mb-2">{weatherDef.description}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[9px] text-gray-500">Production</div>
                  <div className={`text-[11px] font-mono font-bold ${weatherDef.productionMultiplier >= 1 ? 'text-green-400' : weatherDef.productionMultiplier > 0.85 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {(weatherDef.productionMultiplier * 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-gray-500">Solar</div>
                  <div className={`text-[11px] font-mono font-bold ${weatherDef.solarMultiplier >= 1 ? 'text-green-400' : weatherDef.solarMultiplier > 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {(weatherDef.solarMultiplier * 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-gray-500">Wind</div>
                  <div className={`text-[11px] font-mono font-bold ${weatherDef.windMultiplier >= 1 ? 'text-green-400' : weatherDef.windMultiplier > 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {(weatherDef.windMultiplier * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
              {store.weather.current !== 'clear' && (
                <div className="mt-2 text-[10px] text-gray-500">
                  Changes in {store.weather.remaining} ticks
                </div>
              )}
            </div>
          </div>

          {/* Production Chain Overview */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Production Chain</h3>
              <span className="text-[10px] text-gray-500 ml-auto">{productionChain.completeness.toFixed(0)}% connected</span>
            </div>
            {/* Completeness bar */}
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-700 to-cyan-400 transition-all duration-700"
                style={{ width: `${Math.min(100, productionChain.completeness)}%` }}
              />
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto game-scrollbar">
              {productionChain.tiers.map(tier => {
                const tc = TIER_COLORS[tier.tier] ?? TIER_COLORS[0];
                return (
                  <div key={tier.tier} className="bg-[#0a0e17] rounded-lg p-2 border border-gray-800/50">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className={`text-[9px] px-1.5 ${tc.text} border-current`}>
                        {tc.label}
                      </Badge>
                      <span className="text-[10px] text-gray-400">{tier.buildings.filter(b => b.connected).length}/{tier.buildings.length} connected</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {tier.buildings.map(b => (
                        <div key={b.id} className="flex items-center gap-1 text-[10px]">
                          {b.connected ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                          )}
                          <span className="truncate">{b.emoji} {b.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resource Flow Summary */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Resource Flow</h3>
            </div>
            {resourceFlow.length === 0 ? (
              <div className="text-center py-4">
                <Package className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-[10px] text-gray-500">No resource flow data yet</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto game-scrollbar">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-2 text-[9px] text-gray-500 px-1 pb-1 border-b border-gray-800">
                  <span></span>
                  <span>Resource</span>
                  <span className="text-right">Prod</span>
                  <span className="text-right">Cons</span>
                  <span className="text-right">Net</span>
                </div>
                {resourceFlow.map(r => {
                  const isSurplus = r.surplus > 0.01;
                  const isDeficit = r.surplus < -0.01;
                  return (
                    <div key={r.resource} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-2 text-[10px] items-center px-1 py-0.5 hover:bg-gray-800/30 rounded">
                      <span>{r.emoji}</span>
                      <span className="text-gray-300 truncate">{r.name}</span>
                      <span className="text-green-400 font-mono text-right">{r.production.toFixed(1)}</span>
                      <span className="text-red-400 font-mono text-right">{r.consumption.toFixed(1)}</span>
                      <span className={`font-mono font-bold text-right ${
                        isSurplus ? 'text-green-400' : isDeficit ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                        {isSurplus ? '+' : ''}{r.surplus.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottleneck Detection */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-orange-900/30">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-orange-400">Bottleneck Detection</h3>
              {bottlenecks.length > 0 && (
                <Badge variant="outline" className="text-[9px] border-red-800/50 text-red-400 ml-auto">
                  {bottlenecks.length} issue{bottlenecks.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {bottlenecks.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-8 h-8 text-green-700 mx-auto mb-2" />
                <p className="text-[10px] text-green-500">No bottlenecks detected</p>
                <p className="text-[9px] text-gray-600 mt-1">All transport lines operating normally</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar">
                {bottlenecks.map((bn, i) => {
                  const bDef = BUILDING_DEFS[bn.building.type];
                  const sevColor = bn.severity === 'critical' ? 'text-red-400 border-red-900/30' : bn.severity === 'warning' ? 'text-yellow-400 border-yellow-900/30' : 'text-gray-400 border-gray-800';
                  const sevIcon = bn.severity === 'critical' ? <XCircle className="w-3 h-3 text-red-400" /> : bn.severity === 'warning' ? <AlertTriangle className="w-3 h-3 text-yellow-400" /> : <CircleDot className="w-3 h-3 text-gray-400" />;
                  const typeIcon = bn.type === 'under-supplied' ? <TrendingDown className="w-3 h-3 text-red-400" /> : bn.type === 'over-supplied' ? <TrendingUp className="w-3 h-3 text-yellow-400" /> : bn.type === 'capacity' ? <Zap className="w-3 h-3 text-orange-400" /> : bn.type === 'power' ? <ZapOff className="w-3 h-3 text-yellow-400" /> : <Route className="w-3 h-3 text-red-400" />;
                  return (
                    <div key={i} className={`bg-[#0a0e17] rounded-lg p-2.5 border ${sevColor}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {sevIcon}
                        {typeIcon}
                        <span className="text-[10px] text-gray-300 font-medium">{bDef?.emoji} {bDef?.name}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mb-1">{bn.reason}</p>
                      {bn.flowRate !== undefined && bn.requiredRate !== undefined && (
                        <div className="text-[9px] text-gray-500 mb-1">
                          Flow: <span className="font-mono">{bn.flowRate.toFixed(1)}</span> / Required: <span className="font-mono">{bn.requiredRate.toFixed(1)}</span> /t
                        </div>
                      )}
                      <p className="text-[9px] text-gray-500">{bn.solution}</p>
                      {bn.action && (
                        <Button
                          size="sm"
                          className="h-5 text-[9px] px-2 mt-1.5 bg-cyan-700 hover:bg-cyan-600 text-white"
                          onClick={bn.action.onClick}
                        >
                          {bn.action.label}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bulk Operations + Auto-Connect */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Bulk Operations</h3>
            </div>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-[10px] border-green-800/50 text-green-400 hover:bg-green-900/20"
                onClick={handleActivateAll}
                disabled={store.transportLines.every(l => l.active)}
              >
                <Play className="w-3 h-3 mr-1" />
                Activate All Lines
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-[10px] border-yellow-800/50 text-yellow-400 hover:bg-yellow-900/20"
                onClick={handleDeactivateAll}
                disabled={store.transportLines.every(l => !l.active)}
              >
                <Pause className="w-3 h-3 mr-1" />
                Deactivate All Lines
              </Button>
              <div className="border-t border-gray-800 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-[10px] border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20"
                  onClick={() => setShowSuggestions(!showSuggestions)}
                >
                  <Lightbulb className="w-3 h-3 mr-1" />
                  Route Suggestions ({routeSuggestions.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-[10px] border-purple-800/50 text-purple-400 hover:bg-purple-900/20 mt-2"
                  onClick={() => setShowConnectAllDialog(true)}
                  disabled={connectAllData.routes.length === 0}
                >
                  <Link2 className="w-3 h-3 mr-1" />
                  Connect All ({connectAllData.routes.length} routes — ${formatNumber(connectAllData.totalCost)})
                </Button>
              </div>
            </div>
          </div>

          {/* Network Health Details */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Health Breakdown</h3>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Connectivity', value: networkHealth.details.connectivity, icon: <Network className="w-3 h-3" /> },
                { label: 'Active Rate', value: networkHealth.details.activeRate, icon: <Play className="w-3 h-3" /> },
                { label: 'Utilization', value: networkHealth.details.utilization, icon: <BarChart3 className="w-3 h-3" /> },
                { label: 'Bottleneck Penalty', value: -networkHealth.details.bottleneckPenalty, icon: <AlertTriangle className="w-3 h-3" /> },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1 text-[10px] text-gray-400">
                      {item.icon}
                      {item.label}
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${
                      item.value >= 80 ? 'text-green-400' : item.value >= 50 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {item.value.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.value >= 80 ? 'bg-green-500' : item.value >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Route Suggestions Overlay */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
          >
            <div className="game-card rounded-xl bg-[#111827] p-4 border border-cyan-900/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-cyan-400">Suggested Routes</h3>
                  <Badge variant="outline" className="text-[9px] border-cyan-800/50 text-cyan-400">{routeSuggestions.length}</Badge>
                </div>
                <button onClick={() => setShowSuggestions(false)} className="text-gray-500 hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {routeSuggestions.length === 0 ? (
                <div className="text-center py-4">
                  <CircleDot className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No suggestions available</p>
                  <p className="text-[10px] text-gray-600 mt-1">Build more producers and consumers to get route suggestions</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar">
                  {routeSuggestions.map((sug, i) => {
                    const fromDef = BUILDING_DEFS[sug.from.type];
                    const toDef = BUILDING_DEFS[sug.to.type];
                    const resMeta = RESOURCE_META[sug.resource];
                    const cheapestCost = getTransportCost(CHEAPEST_TYPE);
                    const canAfford = store.money >= cheapestCost;
                    return (
                      <div key={i} className="bg-[#0a0e17] rounded-lg p-3 border border-cyan-900/20">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">{fromDef?.emoji}</span>
                          <span className="text-xs text-gray-300 truncate max-w-[80px]">{fromDef?.name}</span>
                          <ArrowRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          <span className="text-sm">{resMeta?.emoji}</span>
                          <ArrowRight className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          <span className="text-sm">{toDef?.emoji}</span>
                          <span className="text-xs text-gray-300 truncate max-w-[80px]">{toDef?.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-500">{sug.reason}</span>
                          <Button
                            size="sm"
                            className="h-6 text-[10px] px-3 bg-cyan-600 hover:bg-cyan-500 text-white"
                            onClick={() => handleCreateSuggestedRoute(sug.from.id, sug.to.id, sug.resource)}
                            disabled={!canAfford}
                          >
                            Create (${formatNumber(cheapestCost)})
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connect All Confirmation Dialog */}
      <AnimatePresence>
        {showConnectAllDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowConnectAllDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111827] rounded-xl border border-cyan-900/50 p-6 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4">
                <Link2 className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-cyan-400">Connect All Routes</h3>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                This will create <span className="text-cyan-400 font-bold">{connectAllData.routes.length}</span> transport lines using {TRANSPORT_DEFS[CHEAPEST_TYPE].emoji} {TRANSPORT_DEFS[CHEAPEST_TYPE].name} (cheapest).
              </p>
              <div className="bg-[#0a0e17] rounded-lg p-3 mb-4 max-h-40 overflow-y-auto game-scrollbar">
                {connectAllData.routes.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-gray-400 py-0.5">
                    <span className="text-gray-500">{i + 1}.</span>
                    <span>{r.fromName}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-cyan-600" />
                    <span>{r.resName}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-cyan-600" />
                    <span>{r.toName}</span>
                  </div>
                ))}
                {connectAllData.routes.length > 20 && (
                  <div className="text-[10px] text-gray-500 mt-1">...and {connectAllData.routes.length - 20} more</div>
                )}
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-400">Total Cost:</span>
                <span className={`text-sm font-bold font-mono ${connectAllData.canAfford ? 'text-green-400' : 'text-red-400'}`}>
                  ${formatNumber(connectAllData.totalCost)}
                </span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs border-gray-700 text-gray-400 hover:bg-gray-800"
                  onClick={() => setShowConnectAllDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white"
                  onClick={handleConnectAll}
                  disabled={!connectAllData.canAfford || connectAllData.routes.length === 0}
                >
                  <Link2 className="w-3.5 h-3.5 mr-1" />
                  Connect All
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
