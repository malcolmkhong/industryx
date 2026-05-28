'use client';

import { useState, useMemo, useCallback } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { TRANSPORT_DEFS, BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Truck, ArrowRight, ChevronUp, Power, AlertTriangle,
  Package, Route, Zap, Gauge, CircleDot, Lightbulb,
  BarChart3, X
} from 'lucide-react';
import { TransportType, ResourceType, BuildingInstance } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { motion, AnimatePresence } from 'framer-motion';

export function TransportPanel() {
  const store = useGameStore();
  const [selectedType, setSelectedType] = useState<TransportType>('conveyorBelt');
  const [fromBuilding, setFromBuilding] = useState<string>('');
  const [toBuilding, setToBuilding] = useState<string>('');
  const [carriesResource, setCarriesResource] = useState<ResourceType>('iron');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const activeLines = store.transportLines.filter(l => l.active);
  const inactiveLines = store.transportLines.filter(l => !l.active);
  const totalThroughput = activeLines.reduce((sum, l) => sum + l.throughput, 0);
  const totalMaxThroughput = store.transportLines.reduce((sum, l) => sum + l.maxThroughput, 0);

  const producingBuildings = store.buildings.filter(b => {
    const def = BUILDING_DEFS[b.type];
    return def?.outputs && def.outputs.length > 0 && b.active;
  });

  const consumingBuildings = store.buildings.filter(b => {
    const def = BUILDING_DEFS[b.type];
    return def?.inputs && def.inputs.length > 0 && b.active;
  });

  const availableResources = useMemo(() => {
    const resources = new Set<ResourceType>();
    producingBuildings.forEach(b => {
      BUILDING_DEFS[b.type]?.outputs?.forEach(o => {
        if (o.resource !== 'money') resources.add(o.resource as ResourceType);
      });
    });
    return Array.from(resources);
  }, [producingBuildings]);

  const transportTypes: TransportType[] = ['conveyorBelt', 'pipe', 'truck', 'cargoTrain', 'drone', 'cargoShip'];

  const handleBuild = () => {
    if (!fromBuilding || !toBuilding) return;
    store.buildTransportLine(selectedType, fromBuilding, toBuilding, carriesResource);
    setFromBuilding('');
    setToBuilding('');
  };

  const transportEfficiency = store.transportLines.length > 0
    ? (activeLines.length / store.transportLines.length) * 100
    : 100;

  // Auto-route suggestions (must be before bottlenecks)
  const routeSuggestions = useMemo(() => {
    const suggestions: { from: BuildingInstance; to: BuildingInstance; resource: ResourceType; reason: string }[] = [];
    const existingRoutes = new Set(store.transportLines.map(l => `${l.fromBuilding}-${l.toBuilding}-${l.carriesResource}`));

    consumingBuildings.forEach(consumer => {
      const consumerDef = BUILDING_DEFS[consumer.type];
      if (!consumerDef?.inputs) return;

      consumerDef.inputs.forEach(input => {
        if (input.resource === 'money') return;
        const res = input.resource as ResourceType;

        // Find producing buildings that output this resource
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

    return suggestions.slice(0, 8);
  }, [consumingBuildings, producingBuildings, store.transportLines]);

  const handleCreateSuggestedRoute = useCallback((from: string, to: string, resource: ResourceType) => {
    // Find cheapest available transport
    const cheapestType = transportTypes.reduce((best, type) => {
      const cost = TRANSPORT_DEFS[type].baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0);
      const bestCost = TRANSPORT_DEFS[best].baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0);
      return cost < bestCost ? type : best;
    }, 'conveyorBelt' as TransportType);

    store.buildTransportLine(cheapestType, from, to, resource);
  }, [store, transportTypes]);

  // Bottleneck detection with solutions
  const playerMoney = store.money;
  const isPowerOverloaded = store.powerGrid.overload;

  const bottlenecks = useMemo(() => {
    const issues: {
      building: BuildingInstance;
      reason: string;
      severity: 'critical' | 'warning' | 'info';
      solution: string;
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
          const totalOutput = def.outputs.reduce((sum, o) => sum + o.amount * b.level, 0);
          if (totalOutput > 0) {
            // Find the best consumer for this producer
            const outputResources = def.outputs.map(o => o.resource as ResourceType);
            const matchingConsumers = consumingBuildings.filter(cb => {
              const cbDef = BUILDING_DEFS[cb.type];
              return cbDef?.inputs?.some(i => outputResources.includes(i.resource as ResourceType));
            });
            const hasConsumers = matchingConsumers.length > 0;
            issues.push({
              building: b,
              reason: 'No outbound transport — production may be wasted',
              severity: 'critical',
              solution: hasConsumers
                ? `Build a transport line from ${def.name} to ${BUILDING_DEFS[matchingConsumers[0].type]?.name} to deliver ${outputResources.map(r => RESOURCE_META[r]?.name ?? r).join(', ')}.`
                : `Build a consumer building (e.g. factory) that processes ${outputResources.map(r => RESOURCE_META[r]?.name ?? r).join(', ')}, then connect it with a transport line.`,
              action: hasConsumers ? {
                label: 'Create Route',
                onClick: () => handleCreateSuggestedRoute(b.id, matchingConsumers[0].id, outputResources[0]),
              } : undefined,
            });
          }
        }
      }

      // 2. Transport line near capacity (>80% utilized)
      const buildingOutLines = store.transportLines.filter(l => l.fromBuilding === b.id && l.active);
      buildingOutLines.forEach(line => {
        const utilization = line.throughput / line.maxThroughput;
        if (utilization > 0.85) {
          const lineDef = TRANSPORT_DEFS[line.type];
          const upgradeCost = Math.floor(lineDef.baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0) * Math.pow(1.3, line.level));
          const canAfford = playerMoney >= upgradeCost;
          issues.push({
            building: b,
            reason: `${lineDef.name} at ${(utilization * 100).toFixed(0)}% capacity — risk of backup`,
            severity: 'warning',
            solution: canAfford
              ? `Upgrade this ${lineDef.name} to Lv.${line.level + 1} for $${formatNumber(upgradeCost)} to increase max throughput. Or build a parallel line.`
              : `Save up $${formatNumber(upgradeCost)} to upgrade this ${lineDef.name}, or build a parallel transport line to share the load.`,
            action: canAfford ? {
              label: `Upgrade ($${formatNumber(upgradeCost)})`,
              onClick: () => store.upgradeTransportLine(line.id),
            } : undefined,
          });
        }
      });

      // 3. Consumer missing inbound transport for an input
      if (def.inputs && def.inputs.length > 0) {
        def.inputs.forEach(input => {
          if (input.resource === 'money') return;
          const res = input.resource as ResourceType;
          const inLines = store.transportLines.filter(l => l.toBuilding === b.id && l.carriesResource === res && l.active);
          if (inLines.length === 0) {
            // Check if any producer makes this resource
            const producers = producingBuildings.filter(pb => {
              const pbDef = BUILDING_DEFS[pb.type];
              return pbDef?.outputs?.some(o => o.resource === res);
            });
            issues.push({
              building: b,
              reason: `Missing inbound ${RESOURCE_META[res]?.name ?? res} — production stalled`,
              severity: 'critical',
              solution: producers.length > 0
                ? `Connect ${BUILDING_DEFS[producers[0].type]?.name} to this ${def.name} with a transport line carrying ${RESOURCE_META[res]?.name ?? res}.`
                : `Build a producer that outputs ${RESOURCE_META[res]?.name ?? res} first, then connect it to this building.`,
              action: producers.length > 0 ? {
                label: 'Create Route',
                onClick: () => handleCreateSuggestedRoute(producers[0].id, b.id, res),
              } : undefined,
            });
          }
        });
      }

      // 4. Building has low efficiency due to power
      if (b.efficiency < 0.5 && isPowerOverloaded) {
        issues.push({
          building: b,
          reason: `Running at ${(b.efficiency * 100).toFixed(0)}% efficiency — power grid overloaded`,
          severity: 'warning',
          solution: 'Build more power plants (Power tab) or deactivate non-essential buildings to free up power for this one.',
        });
      }
    });

    // 5. No transport lines at all but buildings exist
    if (store.transportLines.length === 0 && store.buildings.length > 2) {
      issues.push({
        building: store.buildings[0], // representative
        reason: 'No transport network built — buildings operate independently',
        severity: 'info',
        solution: 'Build transport lines to connect producers to consumers. Click "Suggest Routes" above to get automatic route recommendations.',
        action: routeSuggestions.length > 0 ? {
          label: 'Show Suggestions',
          onClick: () => setShowSuggestions(true),
        } : undefined,
      });
    }

    // Sort: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return issues;
  }, [store.buildings, store.transportLines, producingBuildings, consumingBuildings, routeSuggestions, isPowerOverloaded, playerMoney]);

  // Throughput data per transport type for bar chart
  const throughputByType = useMemo(() => {
    return transportTypes
      .map(type => {
        const def = TRANSPORT_DEFS[type];
        const lines = store.transportLines.filter(l => l.type === type);
        const activeTypeLines = lines.filter(l => l.active);
        const throughput = activeTypeLines.reduce((s, l) => s + l.throughput, 0);
        const capacity = lines.reduce((s, l) => s + l.maxThroughput, 0);
        const utilization = capacity > 0 ? (throughput / capacity) * 100 : 0;
        return { type, def, count: lines.length, throughput, capacity, utilization };
      })
      .filter(t => t.count > 0);
  }, [store.transportLines, transportTypes]);

  // Route visualization data
  const routeNodes = useMemo(() => {
    const nodeMap = new Map<string, { id: string; emoji: string; name: string; x: number; y: number; type: string }>();
    const buildings = store.buildings.filter(b => {
      return store.transportLines.some(l => l.fromBuilding === b.id || l.toBuilding === b.id);
    });

    const cols = Math.ceil(Math.sqrt(buildings.length));
    buildings.forEach((b, i) => {
      const def = BUILDING_DEFS[b.type];
      if (!def) return;
      const row = Math.floor(i / Math.max(1, cols));
      const col = i % Math.max(1, cols);
      nodeMap.set(b.id, {
        id: b.id,
        emoji: def.emoji,
        name: def.name,
        x: 60 + col * 120,
        y: 50 + row * 80,
        type: def.category,
      });
    });

    return nodeMap;
  }, [store.buildings, store.transportLines]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-blue-400 neon-glow-cyan tracking-wide">Transport & Logistics</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage supply chains and logistics networks</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[10px] border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20 hover:border-cyan-500/50"
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            <Lightbulb className="w-3 h-3 mr-1" />
            Suggest Routes
          </Button>
          <Badge variant="outline" className="border-blue-500/50 text-blue-400 bg-blue-900/20 text-xs">
            <Route className="w-3 h-3 mr-1" />
            {store.transportLines.length} lines
          </Badge>
          <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-900/20 text-xs">
            <Gauge className="w-3 h-3 mr-1" />
            {formatNumber(totalThroughput)} u/t
          </Badge>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-blue-900/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 50%, #3b82f6, transparent 70%)' }} />
          <div className="relative z-10">
            <div className="text-[10px] text-gray-500 mb-1">Active Lines</div>
            <div className="text-lg font-bold font-mono text-blue-400">{activeLines.length}<span className="text-xs text-gray-500">/{store.transportLines.length}</span></div>
          </div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-cyan-900/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 50%, #06b6d4, transparent 70%)' }} />
          <div className="relative z-10">
            <div className="text-[10px] text-gray-500 mb-1">Total Throughput</div>
            <div className="text-lg font-bold font-mono text-cyan-400">{formatNumber(totalThroughput)}<span className="text-[10px] text-gray-500">/{formatNumber(totalMaxThroughput)}</span></div>
          </div>
        </div>
        <div className="game-card rounded-xl bg-[#111827] p-3 border border-green-900/30 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 50%, #22c55e, transparent 70%)' }} />
          <div className="relative z-10">
            <div className="text-[10px] text-gray-500 mb-1">Efficiency</div>
            <div className={`text-lg font-bold font-mono ${transportEfficiency >= 80 ? 'text-green-400' : transportEfficiency >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {transportEfficiency.toFixed(0)}%
            </div>
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

      {/* Auto-Route Suggestions */}
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
                    const cheapestCost = transportTypes.reduce((min, type) => {
                      const cost = TRANSPORT_DEFS[type].baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0);
                      return cost < min ? cost : min;
                    }, Infinity);
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
                            Create Route (${formatNumber(cheapestCost)})
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Build Transport */}
        <div className="lg:col-span-2 space-y-4">
          {/* Visual Route Diagram */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Route className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-blue-400">Route Diagram</h3>
              <span className="text-[10px] text-gray-500 ml-auto">{store.transportLines.length} connections</span>
            </div>
            {store.transportLines.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-800 rounded-lg">
                <Route className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No routes built yet</p>
                <p className="text-[10px] text-gray-600 mt-1">Build transport lines to see them visualized here</p>
              </div>
            ) : (
              <div className="bg-[#0a0e17] rounded-lg p-2 overflow-x-auto">
                <svg
                  width={Math.max(300, routeNodes.size * 60 + 100)}
                  height={Math.max(150, Math.ceil(routeNodes.size / 3) * 80 + 60)}
                  className="w-full"
                  style={{ minWidth: '300px' }}
                >
                  {/* Transport line connections */}
                  {store.transportLines.map(line => {
                    const fromNode = routeNodes.get(line.fromBuilding);
                    const toNode = routeNodes.get(line.toBuilding);
                    if (!fromNode || !toNode) return null;
                    const def = TRANSPORT_DEFS[line.type];
                    const isActive = line.active;

                    return (
                      <g key={line.id}>
                        {/* Line */}
                        <line
                          x1={fromNode.x + 20}
                          y1={fromNode.y + 20}
                          x2={toNode.x + 20}
                          y2={toNode.y + 20}
                          stroke={isActive ? (line.throughput / line.maxThroughput > 0.8 ? '#ef4444' : line.throughput / line.maxThroughput > 0.5 ? '#eab308' : '#06b6d4') : '#374151'}
                          strokeWidth={2}
                          strokeDasharray={isActive ? 'none' : '4 4'}
                          opacity={isActive ? 0.7 : 0.3}
                        />
                        {/* Animated arrow */}
                        {isActive && (
                          <>
                            <circle r="3" fill={def.emoji === '🚁' ? '#a855f7' : '#06b6d4'}>
                              <animateMotion
                                dur={`${2}s`}
                                repeatCount="indefinite"
                                path={`M${fromNode.x + 20},${fromNode.y + 20} L${toNode.x + 20},${toNode.y + 20}`}
                              />
                            </circle>
                          </>
                        )}
                        {/* Resource emoji at midpoint */}
                        <text
                          x={(fromNode.x + toNode.x) / 2 + 20}
                          y={(fromNode.y + toNode.y) / 2 + 20 - 8}
                          textAnchor="middle"
                          fontSize="10"
                          opacity={isActive ? 0.8 : 0.3}
                        >
                          {RESOURCE_META[line.carriesResource]?.emoji || ''}
                        </text>
                      </g>
                    );
                  })}
                  {/* Building nodes */}
                  {Array.from(routeNodes.values()).map(node => (
                    <g key={node.id}>
                      <rect
                        x={node.x}
                        y={node.y}
                        width={40}
                        height={40}
                        rx={6}
                        fill={
                          node.type === 'extractor' ? '#78350f' :
                          node.type === 'factory' ? '#1e3a5f' :
                          node.type === 'power' ? '#422006' : '#1f2937'
                        }
                        stroke={
                          node.type === 'extractor' ? '#92400e' :
                          node.type === 'factory' ? '#1d4ed8' :
                          node.type === 'power' ? '#a16207' : '#374151'
                        }
                        strokeWidth={1.5}
                      />
                      <text
                        x={node.x + 20}
                        y={node.y + 26}
                        textAnchor="middle"
                        fontSize="16"
                      >
                        {node.emoji}
                      </text>
                      <text
                        x={node.x + 20}
                        y={node.y + 52}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#9ca3af"
                      >
                        {node.name.length > 10 ? node.name.slice(0, 9) + '…' : node.name}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}
          </div>

          {/* Transport Type Selection & Build */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-blue-400">Build Transport Line</h3>
            </div>

            {/* Type selector */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {transportTypes.map(type => {
                const def = TRANSPORT_DEFS[type];
                const isSelected = selectedType === type;
                const cost = def.baseCost.reduce((sum, c) => sum + (c.resource === 'money' ? c.amount : 0), 0);
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
                      { label: 'Upgrade Multiplier', value: `x${def.upgradeMultiplier}`, color: 'text-purple-400' },
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

            {/* Selected type info */}
            <div className="bg-[#0a0e17] rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-300">{TRANSPORT_DEFS[selectedType].description}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-gray-500">Throughput</div>
                  <div className="text-sm font-bold text-cyan-400 font-mono">{TRANSPORT_DEFS[selectedType].baseThroughput} u/t</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Cost</div>
                  <div className="text-sm font-bold text-green-400 font-mono">${formatNumber(TRANSPORT_DEFS[selectedType].baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0))}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-500">Upgrade x</div>
                  <div className="text-sm font-bold text-purple-400 font-mono">{TRANSPORT_DEFS[selectedType].upgradeMultiplier}</div>
                </div>
              </div>
            </div>

            {/* Route Configuration */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">From (Producer)</label>
                  <select
                    value={fromBuilding}
                    onChange={e => setFromBuilding(e.target.value)}
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
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">Carries Resource</label>
                  <select
                    value={carriesResource}
                    onChange={e => setCarriesResource(e.target.value as ResourceType)}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                  >
                    {availableResources.map(r => (
                      <option key={r} value={r}>
                        {RESOURCE_META[r].emoji} {RESOURCE_META[r].name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 mb-1 block">To (Consumer)</label>
                  <select
                    value={toBuilding}
                    onChange={e => setToBuilding(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:border-cyan-500/50 focus:outline-none"
                  >
                    <option value="">Select destination...</option>
                    {consumingBuildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {BUILDING_DEFS[b.type]?.emoji} {BUILDING_DEFS[b.type]?.name} Lv.{b.level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                onClick={handleBuild}
                disabled={!fromBuilding || !toBuilding || fromBuilding === toBuilding}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                size="sm"
              >
                <Truck className="w-3.5 h-3.5 mr-1.5" />
                Build {TRANSPORT_DEFS[selectedType].name}
              </Button>
            </div>
          </div>

          {/* Throughput Bar Chart */}
          {throughputByType.length > 0 && (
            <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-cyan-400">Throughput by Type</h3>
              </div>
              <div className="space-y-3">
                {throughputByType.map(({ type, def, count, throughput, capacity, utilization }) => (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{def.emoji}</span>
                        <span className="text-xs text-gray-300">{def.name}</span>
                        <span className="text-[10px] text-gray-500">×{count}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 font-mono">{formatNumber(throughput)}/{formatNumber(capacity)} u/t</span>
                        <span className={`text-[10px] font-mono font-bold ${
                          utilization > 80 ? 'text-red-400' : utilization > 50 ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {utilization.toFixed(0)}%
                        </span>
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
                      >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                      </div>
                    </div>
                  </div>
                ))}
                {/* Total */}
                <div className="pt-2 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium">Total Network</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-cyan-400 font-mono font-bold">{formatNumber(totalThroughput)}/{formatNumber(totalMaxThroughput)} u/t</span>
                      <span className={`text-[10px] font-mono ${
                        totalMaxThroughput > 0 && (totalThroughput / totalMaxThroughput) > 0.8 ? 'text-red-400' : 'text-cyan-400'
                      }`}>
                        {totalMaxThroughput > 0 ? ((totalThroughput / totalMaxThroughput) * 100).toFixed(0) + '%' : '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Transport Lines - Improved Cards */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Route className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Active Transport Lines</h3>
            </div>
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
                  const upgradeCost = Math.floor(def.baseCost.reduce((s, c) => s + (c.resource === 'money' ? c.amount : 0), 0) * Math.pow(1.3, line.level));
                  const throughputPct = (line.throughput / line.maxThroughput) * 100;

                  return (
                    <div key={line.id} className={`bg-[#0a0e17] rounded-lg p-3 border transition-all ${line.active ? 'border-cyan-900/30 hover:border-cyan-800/50' : 'border-gray-800 opacity-60'}`}>
                      {/* Route visualization */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {/* From building */}
                          <div className="flex items-center gap-1 bg-gray-800/50 rounded px-1.5 py-0.5 min-w-0">
                            <span className="text-xs">{fromDef?.emoji}</span>
                            <span className="text-[10px] text-gray-300 truncate max-w-[70px]">{fromDef?.name}</span>
                          </div>
                          {/* Arrow with resource */}
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <ArrowRight className="w-3 h-3 text-gray-600" />
                            <span className="text-xs">{RESOURCE_META[line.carriesResource]?.emoji}</span>
                            <ArrowRight className="w-3 h-3 text-cyan-400" />
                          </div>
                          {/* To building */}
                          <div className="flex items-center gap-1 bg-gray-800/50 rounded px-1.5 py-0.5 min-w-0">
                            <span className="text-xs">{toDef?.emoji}</span>
                            <span className="text-[10px] text-gray-300 truncate max-w-[70px]">{toDef?.name}</span>
                          </div>
                        </div>
                      </div>

                      {/* Controls row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{def.emoji}</span>
                          <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-400 px-1">
                            Lv.{line.level}
                          </Badge>
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

                      {/* Throughput bar */}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              throughputPct > 80 ? 'bg-gradient-to-r from-red-600 to-red-400' :
                              throughputPct > 50 ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' :
                              'bg-gradient-to-r from-cyan-600 to-cyan-400'
                            }`}
                            style={{ width: `${throughputPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">{formatNumber(line.throughput)}/{formatNumber(line.maxThroughput)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Bottleneck Detection */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-orange-400">Bottleneck Detection</h3>
              {bottlenecks.length > 0 && (
                <div className="flex items-center gap-1 ml-auto">
                  {bottlenecks.filter(b => b.severity === 'critical').length > 0 && (
                    <Badge className="text-[8px] bg-red-900/30 text-red-400 border-0 px-1.5">
                      {bottlenecks.filter(b => b.severity === 'critical').length} critical
                    </Badge>
                  )}
                  {bottlenecks.filter(b => b.severity === 'warning').length > 0 && (
                    <Badge className="text-[8px] bg-yellow-900/30 text-yellow-400 border-0 px-1.5">
                      {bottlenecks.filter(b => b.severity === 'warning').length} warning
                    </Badge>
                  )}
                </div>
              )}
            </div>
            {bottlenecks.length === 0 ? (
              <div className="text-center py-4">
                <CircleDot className="w-8 h-8 text-green-800 mx-auto mb-1.5" />
                <p className="text-xs text-green-400">No bottlenecks detected</p>
                <p className="text-[10px] text-gray-600 mt-0.5">All buildings properly connected</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto game-scrollbar">
                {bottlenecks.map((bn, i) => {
                  const severityStyles = {
                    critical: 'bg-red-900/10 border-red-900/30',
                    warning: 'bg-yellow-900/10 border-yellow-900/20',
                    info: 'bg-blue-900/10 border-blue-900/20',
                  };
                  const severityColors = {
                    critical: 'text-red-400',
                    warning: 'text-yellow-400',
                    info: 'text-blue-400',
                  };
                  const severityIcons = {
                    critical: '🔴',
                    warning: '🟡',
                    info: '🔵',
                  };
                  return (
                    <div key={i} className={`${severityStyles[bn.severity]} border rounded-lg p-3`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px]">{severityIcons[bn.severity]}</span>
                        <span className="text-sm">{BUILDING_DEFS[bn.building.type]?.emoji}</span>
                        <span className={`text-xs ${severityColors[bn.severity]} font-medium`}>
                          {BUILDING_DEFS[bn.building.type]?.name} Lv.{bn.building.level}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-300 mb-1.5">{bn.reason}</p>
                      <div className="bg-[#0a0e17] rounded px-2.5 py-1.5 mb-2 border border-gray-800/50">
                        <div className="flex items-start gap-1.5">
                          <Lightbulb className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-cyan-300/80 leading-relaxed">{bn.solution}</p>
                        </div>
                      </div>
                      {bn.action && (
                        <Button
                          size="sm"
                          className={`h-6 text-[10px] px-3 ${
                            bn.severity === 'critical'
                              ? 'bg-red-600 hover:bg-red-500 text-white'
                              : bn.severity === 'warning'
                                ? 'bg-yellow-600 hover:bg-yellow-500 text-black'
                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                          }`}
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

          {/* Transport Efficiency */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-cyan-400">Logistics Network</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-400">Line Utilization</span>
                  <span className="text-cyan-400 font-mono">{transportEfficiency.toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      transportEfficiency >= 80 ? 'bg-green-500' : transportEfficiency >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${transportEfficiency}%` }}
                  />
                </div>
              </div>

              {/* Transport type breakdown */}
              {transportTypes.filter(t => store.transportLines.some(l => l.type === t)).map(type => {
                const lines = store.transportLines.filter(l => l.type === type);
                const def = TRANSPORT_DEFS[type];
                return (
                  <div key={type} className="flex items-center justify-between text-xs bg-[#0a0e17] rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{def.emoji}</span>
                      <span className="text-gray-300">{def.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono">{lines.length}</span>
                      <span className="text-cyan-400 font-mono">{formatNumber(lines.reduce((s, l) => s + l.throughput, 0))} u/t</span>
                    </div>
                  </div>
                );
              })}

              {store.transportLines.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-2">Build transport lines to see breakdown</p>
              )}
            </div>
          </div>

          {/* Quick Tips */}
          <div className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b]">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-400">Logistics Tips</h3>
            </div>
            <div className="space-y-2 text-[11px] text-gray-500">
              <p>• Connect extractors to factories for smooth production</p>
              <p>• Upgrade lines when throughput is near max capacity</p>
              <p>• Drones are fast but low capacity — great for rare materials</p>
              <p>• Cargo ships are slow but massive — ideal for bulk</p>
              <p>• Use &quot;Suggest Routes&quot; to find missing connections</p>
              <p>• Research logistics to boost throughput +20-50%</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
