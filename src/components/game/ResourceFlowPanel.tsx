'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { useShallow } from 'zustand/react/shallow';
import { BUILDING_DEFS, RESOURCE_META, PRODUCTION_CHAINS } from '@/lib/game/configCache';
import { ResourceType, BuildingDefinition } from '@/lib/game/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, AlertTriangle, CheckCircle2,
  TrendingDown, TrendingUp, Package, GitBranch, Lightbulb,
  X, ArrowRight, Zap, AlertCircle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { GameIcon } from '@/components/game/shared/GameIcon';

// ─── Types ──────────────────────────────────────────────────────
interface FlowNode {
  resource: ResourceType;
  tier: number;
  productionRate: number;
  consumptionRate: number;
  demandRate: number;
  netRate: number;
  currentAmount: number;
  capacity: number;
  fillPercent: number;
  status: 'ok' | 'bottleneck' | 'nearFull' | 'notProduced';
}

interface FlowEdge {
  from: ResourceType;
  to: ResourceType;
  viaBuilding: string;
  viaBuildingEmoji: string;
  rate: number;
  maxRate: number;
}

interface ProducerInfo {
  def: BuildingDefinition;
  count: number;
  activeCount: number;
  rate: number;
}

interface ConsumerInfo {
  def: BuildingDefinition;
  count: number;
  activeCount: number;
  rate: number;
}

type BottleneckStatus = 'bottleneck' | 'nearFull' | 'notProduced' | 'ok';

// ─── Helper: classify a resource's bottleneck status ────────────
function classifyResource(
  resource: ResourceType,
  prodRate: number,
  consRate: number,
  amount: number,
  capacity: number,
): BottleneckStatus {
  // Not produced at all but consumed
  if (prodRate === 0 && consRate > 0) return 'notProduced';
  // Consumed faster than produced (deficit)
  if (consRate > prodRate && prodRate > 0) return 'bottleneck';
  // Near or at capacity (>90%)
  if (capacity > 0 && amount / capacity > 0.9 && prodRate > consRate) return 'nearFull';
  return 'ok';
}

// ─── Helper: format ticks to readable time ──────────────────────
function formatTicks(ticks: number): string {
  if (ticks < 60) return `${ticks}t`;
  if (ticks < 3600) return `~${Math.ceil(ticks / 60)}m`;
  return `~${(ticks / 3600).toFixed(1)}h`;
}

// ─── Colors for bottleneck status ──────────────────────────────
const STATUS_COLORS: Record<BottleneckStatus, { border: string; bg: string; text: string; label: string }> = {
  bottleneck: { border: '#ef4444', bg: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'BOTTLENECK' },
  nearFull: { border: '#eab308', bg: 'rgba(234,179,8,0.15)', text: '#facc15', label: 'NEAR FULL' },
  notProduced: { border: '#6b7280', bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', label: 'NOT PRODUCED' },
  ok: { border: '#22d3ee', bg: 'rgba(34,211,238,0.08)', text: '#22d3ee', label: '' },
};

// ─── Tier column positions ─────────────────────────────────────
const TIER_X = [0.07, 0.28, 0.50, 0.72, 0.91]; // fraction of SVG width

// ─── Main Component ─────────────────────────────────────────────
export default function ResourceFlowPanel() {
  // Use targeted selectors to avoid re-rendering on every tick
  const {
    productionSnapshot, buildings, resources, resourceCapacity, market,
  } = useGameStore(useShallow((state) => ({
    productionSnapshot: state.productionSnapshot,
    buildings: state.buildings,
    resources: state.resources,
    resourceCapacity: state.resourceCapacity,
    market: state.market,
  })));
  const [selectedResource, setSelectedResource] = useState<ResourceType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightChain, setHighlightChain] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgDims, setSvgDims] = useState({ w: 900, h: 600 });

  // Responsive SVG sizing
  useEffect(() => {
    const update = () => {
      if (svgRef.current) {
        const rect = svgRef.current.parentElement?.getBoundingClientRect();
        if (rect) {
          setSvgDims({ w: Math.max(600, rect.width), h: Math.max(400, Math.min(700, rect.height)) });
        }
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // ─── Compute all flow nodes ──────────────────────────────────
  const flowNodes = useMemo<FlowNode[]>(() => {
    const allResources = Object.keys(RESOURCE_META) as ResourceType[];
    return allResources
      .map(res => {
        const prodRate = productionSnapshot.production[res] ?? 0;
        const consRate = productionSnapshot.actualConsumption[res] ?? 0;
        const demandRate = productionSnapshot.consumption[res] ?? 0;
        const amount = resources[res] ?? 0;
        const cap = resourceCapacity[res] ?? 50;
        return {
          resource: res,
          tier: RESOURCE_META[res].tier,
          productionRate: prodRate,
          consumptionRate: consRate,
          demandRate,
          netRate: prodRate - consRate,
          currentAmount: amount,
          capacity: cap,
          fillPercent: cap > 0 ? Math.min(100, (amount / cap) * 100) : 0,
          status: classifyResource(res, prodRate, consRate, amount, cap),
        };
      })
      .filter(n => n.productionRate > 0 || n.consumptionRate > 0 || n.currentAmount > 0);
  }, [productionSnapshot.production, productionSnapshot.actualConsumption, productionSnapshot.consumption, resources, resourceCapacity]);

  // ─── Compute flow edges ──────────────────────────────────────
  const flowEdges = useMemo<FlowEdge[]>(() => {
    const edges: FlowEdge[] = [];
    const snap = productionSnapshot;

    for (const b of buildings) {
      if (!b.active) continue;
      const bSnap = snap.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
      if (bSnap.outputs.length === 0 && bSnap.inputs.length === 0) continue;

      const def = BUILDING_DEFS[b.type];
      if (!def) continue;

      for (const input of bSnap.inputs) {
        for (const output of bSnap.outputs) {
          const inRes = input.resource as ResourceType;
          const outRes = output.resource as ResourceType;
          // Skip money as resource
          if (inRes === 'money' || outRes === 'money') continue;

          // Use actual output rate from snapshot (includes all multipliers)
          const rate = output.amount;

          // Aggregate into existing edge for same from→to+building
          const existing = edges.find(e => e.from === inRes && e.to === outRes && e.viaBuilding === def.name);
          if (existing) {
            existing.rate += rate;
          } else {
            edges.push({
              from: inRes,
              to: outRes,
              viaBuilding: def.name,
              viaBuildingEmoji: def.icon,
              rate,
              maxRate: Math.max(rate, 1),
            });
          }
        }
      }
    }
    return edges.filter(e => {
      const fromMeta = RESOURCE_META[e.from as ResourceType];
      const toMeta = RESOURCE_META[e.to as ResourceType];
      return fromMeta && toMeta;
    });
  }, [buildings, productionSnapshot]);

  // ─── Node positions in SVG ───────────────────────────────────
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    // Group nodes by tier
    const tierGroups: Record<number, FlowNode[]> = {};
    for (const node of flowNodes) {
      if (!tierGroups[node.tier]) tierGroups[node.tier] = [];
      tierGroups[node.tier].push(node);
    }
    // Position each tier in a column
    const { w, h } = svgDims;
    const padding = 50;
    for (const [tier, nodes] of Object.entries(tierGroups)) {
      const t = Number(tier);
      const x = TIER_X[t] * w;
      const sortedNodes = nodes.sort((a, b) => b.netRate - a.netRate);
      const count = sortedNodes.length;
      const spacing = Math.min(60, (h - padding * 2) / Math.max(count, 1));
      const startY = Math.max(padding, (h - (count - 1) * spacing) / 2);
      sortedNodes.forEach((node, i) => {
        positions[node.resource] = { x, y: startY + i * spacing };
      });
    }
    return positions;
  }, [flowNodes, svgDims]);

  // ─── Summary Stats ───────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const bottleneckCount = flowNodes.filter(n => n.status === 'bottleneck').length;
    const nearFullCount = flowNodes.filter(n => n.status === 'nearFull').length;
    const notProducedCount = flowNodes.filter(n => n.status === 'notProduced').length;

    // Most constrained resource (lowest net rate among those with consumption > 0)
    const constrained = flowNodes
      .filter(n => n.consumptionRate > 0)
      .sort((a, b) => a.netRate - b.netRate);
    const mostConstrained = constrained[0];

    // Total throughput
    const totalThroughput = flowNodes.reduce((sum, n) => sum + n.productionRate, 0);

    // Active production chains
    const activeChains = PRODUCTION_CHAINS.filter(chain => {
      return chain.steps.every((step: string) => {
        const r = step as ResourceType;
        return productionSnapshot.production[r] > 0 || resources[r] > 0;
      });
    }).length;

    return {
      bottleneckCount,
      nearFullCount,
      notProducedCount,
      mostConstrained,
      totalThroughput,
      activeChains,
      totalChains: PRODUCTION_CHAINS.length,
    };
  }, [flowNodes, productionSnapshot.production, resources]);

  // ─── Producers/Consumers for selected resource ───────────────
  const { producers, consumers, totalProduction, totalConsumption, netRate } = useMemo(() => {
    if (!selectedResource) {
      return { producers: [], consumers: [], totalProduction: 0, totalConsumption: 0, netRate: 0 };
    }
    const producerList: ProducerInfo[] = [];
    const consumerList: ConsumerInfo[] = [];

    const snap = productionSnapshot;

    for (const def of Object.values(BUILDING_DEFS)) {
      const buildings = buildings.filter(b => b.type === def.type);
      if (buildings.length === 0) continue;

      const count = buildings.length;
      const activeBuildings = buildings.filter(b => b.active);
      const activeCount = activeBuildings.length;

      // Check outputs — use definition to identify producers, snapshot for actual rates
      if (def.outputs?.some(o => o.resource === selectedResource)) {
        let rate = 0;
        for (const b of activeBuildings) {
          const bSnap = snap.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
          const outputEntry = bSnap.outputs.find(o => o.resource === selectedResource);
          if (outputEntry) rate += outputEntry.amount;
        }
        producerList.push({ def, count, activeCount, rate });
      }

      // Check inputs — use definition to identify consumers, snapshot for actual rates
      if (def.inputs?.some(i => i.resource === selectedResource)) {
        let rate = 0;
        for (const b of activeBuildings) {
          const bSnap = snap.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
          const inputEntry = bSnap.inputs.find(i => i.resource === selectedResource);
          if (inputEntry) rate += inputEntry.amount;
        }
        consumerList.push({ def, count, activeCount, rate });
      }

      // Check fuel (power buildings are not in per-building snapshot, so use def rate)
      if (def.fuel === selectedResource && def.fuelRate) {
        // Only add if not already tracked as consumer via inputs above
        if (!def.inputs?.some(i => i.resource === selectedResource)) {
          consumerList.push({
            def,
            count,
            activeCount,
            rate: def.fuelRate * activeCount,
          });
        }
      }
    }

    const totalProd = snap.production[selectedResource] ?? 0;
    const totalCons = snap.actualConsumption[selectedResource] ?? 0;

    return {
      producers: producerList.sort((a, b) => b.rate - a.rate),
      consumers: consumerList.sort((a, b) => b.rate - a.rate),
      totalProduction: totalProd,
      totalConsumption: totalCons,
      netRate: totalProd - totalCons,
    };
  }, [selectedResource, buildings, productionSnapshot]);

  // ─── Production chain tracing ────────────────────────────────
  const chainTrace = useMemo(() => {
    if (!selectedResource) return { backward: new Set<string>(), forward: new Set<string>(), brokenChains: [] as string[] };

    const backward = new Set<string>();
    const forward = new Set<string>();
    const brokenChains: string[] = [];

    // Find all chains that include this resource
    const relevantChains = PRODUCTION_CHAINS.filter(chain =>
      chain.steps.includes(selectedResource)
    );

    for (const chain of relevantChains) {
      const idx = chain.steps.indexOf(selectedResource);
      // Trace backward (inputs)
      for (let i = 0; i <= idx; i++) {
        backward.add(chain.steps[i]);
      }
      // Trace forward (outputs)
      for (let i = idx; i < chain.steps.length; i++) {
        forward.add(chain.steps[i]);
      }
      // Check for broken chains (missing production at any step)
      for (let i = 0; i < chain.steps.length - 1; i++) {
        const step = chain.steps[i] as ResourceType;
        const prodRate = productionSnapshot.production[step] ?? 0;
        if (prodRate === 0 && resources[step] === 0) {
          brokenChains.push(chain.name);
          break;
        }
      }
    }

    return { backward, forward, brokenChains: [...new Set(brokenChains)] };
  }, [selectedResource, productionSnapshot.production, resources]);

  // ─── Market price for selected resource ──────────────────────
  const marketPrice = useMemo(() => {
    if (!selectedResource) return null;
    const entry = market.find(m => m.resource === selectedResource);
    return entry ?? null;
  }, [selectedResource, market]);

  // ─── Filtered nodes for search ───────────────────────────────
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return flowNodes;
    const q = searchQuery.toLowerCase();
    return flowNodes.filter(n =>
      n.resource.toLowerCase().includes(q) ||
      RESOURCE_META[n.resource].name.toLowerCase().includes(q)
    );
  }, [flowNodes, searchQuery]);

  // ─── Get chain resources for highlighting ────────────────────
  const highlightedResources = useMemo(() => {
    if (highlightChain !== null) {
      const chain = PRODUCTION_CHAINS[highlightChain];
      if (chain) return new Set(chain.steps as string[]);
    }
    if (selectedResource) {
      return new Set([...chainTrace.backward, ...chainTrace.forward]);
    }
    return new Set<string>();
  }, [highlightChain, selectedResource, chainTrace]);

  // ─── Handle node click ───────────────────────────────────────
  const handleNodeClick = useCallback((resource: ResourceType) => {
    setSelectedResource(prev => prev === resource ? null : resource);
    setHighlightChain(null);
  }, []);

  // ─── Determine edge throughput classification ────────────────
  const getEdgeStyle = useCallback((rate: number) => {
    if (rate <= 0) return { stroke: '#ef4444', strokeWidth: 1.5, dashArray: '4 4', opacity: 0.4 };
    if (rate < 1) return { stroke: '#eab308', strokeWidth: 2, dashArray: 'none', opacity: 0.6 };
    if (rate < 5) return { stroke: '#22d3ee', strokeWidth: 2.5, dashArray: 'none', opacity: 0.7 };
    return { stroke: '#4ade80', strokeWidth: 3.5, dashArray: 'none', opacity: 0.9 };
  }, []);

  // ─── SVG path between two nodes ──────────────────────────────
  const getPath = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = (to.x - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
  }, []);

  const selectedMeta = selectedResource ? RESOURCE_META[selectedResource] : null;
  const currentAmount = selectedResource ? (resources[selectedResource] ?? 0) : 0;
  const capacity = selectedResource ? (resourceCapacity[selectedResource] ?? 50) : 0;
  const fillPercent = capacity > 0 ? Math.min(100, (currentAmount / capacity) * 100) : 0;

  return (
    <div className="p-3 lg:p-4 space-y-3 max-w-[1400px] mx-auto">
      {/* ─── Header ────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500/20 to-cyan-600/20 border border-teal-500/30 flex items-center justify-center">
          <GitBranch className="w-5 h-5 text-teal-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-teal-400 tracking-wide">Resource Flow Tracer</h2>
          <p className="text-xs text-muted-label">Visualize production chains, detect bottlenecks, optimize your factory</p>
        </div>
      </div>

      {/* ─── Summary Stats Bar ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-card rounded-lg p-3 border border-cyan-900/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Active Chains</p>
          <p className="text-lg font-mono font-bold text-cyan-400">{summaryStats.activeChains}<span className="text-muted-label text-sm">/{summaryStats.totalChains}</span></p>
        </div>
        <div className="bg-card rounded-lg p-3 border border-cyan-900/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Bottlenecks</p>
          <p className={`text-lg font-mono font-bold ${summaryStats.bottleneckCount > 0 ? 'text-danger' : 'text-success'}`}>
            {summaryStats.bottleneckCount + summaryStats.notProducedCount}
          </p>
        </div>
        <div className="bg-card rounded-lg p-3 border border-cyan-900/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Most Constrained</p>
          <p className="text-sm font-bold text-orange-400 truncate">
            {summaryStats.mostConstrained
              ? <><GameIcon icon={RESOURCE_META[summaryStats.mostConstrained.resource].icon} size={14} className="inline-flex" /> {RESOURCE_META[summaryStats.mostConstrained.resource].name}</>
              : '—'}
          </p>
        </div>
        <div className="bg-card rounded-lg p-3 border border-cyan-900/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Throughput</p>
          <p className="text-lg font-mono font-bold text-success">{formatNumber(summaryStats.totalThroughput)}</p>
        </div>
      </div>

      {/* ─── Main Content: SVG + Detail Panel ──────────────── */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* SVG Flow Visualization */}
        <Card className="flex-1 bg-[#0a0e17] border-cyan-900/30 overflow-hidden">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-subtle flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-teal-400" />
                Flow Diagram
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-7 w-32 text-[11px] bg-card border-cyan-900/30 text-gray-200 placeholder-gray-600"
                />
                {selectedResource && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] text-muted-label hover:text-danger"
                    onClick={() => setSelectedResource(null)}
                  >
                    <X className="w-3 h-3 mr-1" />Clear
                  </Button>
                )}
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-label">
              <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-success inline-block rounded" /> High</span>
              <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-cyan-400 inline-block rounded" /> Medium</span>
              <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-warning inline-block rounded" /> Low</span>
              <span className="flex items-center gap-1"><span className="w-5 h-0.5 border-t border-dashed border-danger inline-block" /> Zero</span>
              <span className="ml-auto text-muted-label">Click a node for details</span>
            </div>
          </CardHeader>
          <CardContent className="p-0 relative max-h-[600px] overflow-y-auto game-scrollbar" style={{ height: Math.max(400, flowNodes.length * 8 + 100) }}>
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={`0 0 ${svgDims.w} ${svgDims.h}`}
              className="select-none"
              style={{ minHeight: 400 }}
              role="img"
              aria-label="Resource flow diagram showing production and consumption connections"
              tabIndex={0}
            >
              <defs>
                {/* Glow filter for selected nodes */}
                <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                {/* Arrow marker */}
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#22d3ee" opacity="0.5" />
                </marker>
                <marker id="arrowhead-green" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#4ade80" opacity="0.7" />
                </marker>
                <marker id="arrowhead-red" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#ef4444" opacity="0.5" />
                </marker>
              </defs>

              {/* Tier column labels */}
              {['Raw', 'T1', 'T2', 'T3', 'T4'].map((label, i) => (
                <text
                  key={label}
                  x={TIER_X[i] * svgDims.w}
                  y={20}
                  textAnchor="middle"
                  className="fill-gray-600 text-[10px] font-semibold uppercase tracking-wider"
                >
                  {label}
                </text>
              ))}

              {/* Tier separator lines */}
              {[0.17, 0.39, 0.61, 0.82].map((x, i) => (
                <line
                  key={`sep-${i}`}
                  x1={x * svgDims.w}
                  y1={30}
                  x2={x * svgDims.w}
                  y2={svgDims.h - 10}
                  stroke="#1e293b"
                  strokeWidth={1}
                  strokeDasharray="2 6"
                />
              ))}

              {/* ─── Flow Edges ──────────────────────────────── */}
              {flowEdges.map((edge, i) => {
                const fromPos = nodePositions[edge.from];
                const toPos = nodePositions[edge.to];
                if (!fromPos || !toPos) return null;

                const isHighlighted = selectedResource
                  ? (highlightedResources.has(edge.from) && highlightedResources.has(edge.to))
                  : true;
                const isSelectedEdge = selectedResource &&
                  (edge.from === selectedResource || edge.to === selectedResource);

                const style = getEdgeStyle(edge.rate);
                const path = getPath(fromPos, toPos);

                return (
                  <g key={`edge-${i}`}>
                    <path
                      d={path}
                      fill="none"
                      stroke={isSelectedEdge ? style.stroke : isHighlighted ? style.stroke : '#1e293b'}
                      strokeWidth={isSelectedEdge ? style.strokeWidth + 1 : isHighlighted ? style.strokeWidth : 1}
                      strokeDasharray={isSelectedEdge ? style.dashArray : isHighlighted ? style.dashArray : '2 4'}
                      opacity={isSelectedEdge ? 1 : isHighlighted ? style.opacity : 0.15}
                      markerEnd={isSelectedEdge && edge.rate > 0
                        ? edge.rate >= 5 ? 'url(#arrowhead-green)' : 'url(#arrowhead)'
                        : edge.rate <= 0 && isSelectedEdge ? 'url(#arrowhead-red)' : undefined}
                    />
                    {/* Animated particles along highlighted edges */}
                    {isSelectedEdge && edge.rate > 0 && (
                      <>
                        <circle r={2.5} fill={style.stroke} opacity={0.9}>
                          <animateMotion dur={`${Math.max(1, 4 - edge.rate * 0.3)}s`} repeatCount="indefinite" path={path} />
                        </circle>
                        <circle r={2} fill={style.stroke} opacity={0.6}>
                          <animateMotion dur={`${Math.max(1, 4 - edge.rate * 0.3)}s`} begin="1.5s" repeatCount="indefinite" path={path} />
                        </circle>
                      </>
                    )}
                  </g>
                );
              })}

              {/* ─── Resource Nodes ──────────────────────────── */}
              {filteredNodes.map(node => {
                const pos = nodePositions[node.resource];
                if (!pos) return null;
                const meta = RESOURCE_META[node.resource];
                const isSelected = selectedResource === node.resource;
                const isInChain = highlightedResources.has(node.resource);
                const statusInfo = STATUS_COLORS[node.status];
                const isDimmed = selectedResource && !isSelected && !isInChain;
                const nodeRadius = isSelected ? 18 : 14;

                return (
                  <g
                    key={node.resource}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    className="cursor-pointer"
                    onClick={() => handleNodeClick(node.resource)}
                  >
                    {/* Outer ring for status */}
                    {(node.status !== 'ok' || isSelected) && (
                      <circle
                        r={nodeRadius + 4}
                        fill="none"
                        stroke={isSelected ? '#22d3ee' : statusInfo.border}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        strokeDasharray={node.status === 'notProduced' ? '3 3' : 'none'}
                        opacity={isDimmed ? 0.2 : 0.7}
                        filter={isSelected ? 'url(#glow-cyan)' : undefined}
                      />
                    )}

                    {/* Main node circle */}
                    <circle
                      r={nodeRadius}
                      fill={isDimmed ? '#0d1220' : isSelected ? 'rgba(34,211,238,0.15)' : statusInfo.bg}
                      stroke={isDimmed ? '#1e293b' : isSelected ? '#22d3ee' : meta.color}
                      strokeWidth={isSelected ? 2 : 1}
                      opacity={isDimmed ? 0.3 : 1}
                      filter={isSelected ? 'url(#glow-cyan)' : undefined}
                    />

                    {/* Emoji icon */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={isSelected ? 14 : 11}
                      opacity={isDimmed ? 0.3 : 1}
                    >
                      <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                    </text>

                    {/* Resource name label */}
                    <text
                      y={nodeRadius + 12}
                      textAnchor="middle"
                      fontSize={8}
                      className="fill-gray-400"
                      opacity={isDimmed ? 0.2 : 0.9}
                    >
                      {meta.name.length > 10 ? meta.name.substring(0, 9) + '…' : meta.name}
                    </text>

                    {/* Net rate label */}
                    <text
                      y={nodeRadius + 22}
                      textAnchor="middle"
                      fontSize={7}
                      className={node.netRate > 0 ? 'fill-green-400' : node.netRate < 0 ? 'fill-red-400' : 'fill-gray-500'}
                      fontFamily="monospace"
                      opacity={isDimmed ? 0.15 : 0.8}
                    >
                      {node.netRate > 0 ? `+${node.netRate.toFixed(1)}/s` : node.netRate < 0 ? `${node.netRate.toFixed(1)}/s` : '—'}
                    </text>

                    {/* Bottleneck badge */}
                    {node.status !== 'ok' && !isDimmed && (
                      <g transform={`translate(${nodeRadius + 2}, ${-nodeRadius - 2})`}>
                        <rect
                          x={-20}
                          y={-6}
                          width={40}
                          height={12}
                          rx={3}
                          fill={statusInfo.bg}
                          stroke={statusInfo.border}
                          strokeWidth={0.5}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={6}
                          fill={statusInfo.text}
                          fontWeight="bold"
                        >
                          {statusInfo.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </CardContent>
        </Card>

        {/* ─── Detail Panel (right side) ───────────────────── */}
        <AnimatePresence mode="wait">
          {selectedResource && selectedMeta && (
            <motion.div
              key={selectedResource}
              className="w-full lg:w-80 flex-shrink-0 space-y-3"
            >
              {/* Selected Resource Header */}
              <Card className="bg-card border-cyan-900/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${RESOURCE_META[selectedResource].color}22, ${RESOURCE_META[selectedResource].color}08)`,
                        border: `1px solid ${RESOURCE_META[selectedResource].color}44`,
                      }}
                    >
                      <GameIcon icon={selectedMeta.icon} size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-200">{selectedMeta.name}</p>
                      <p className="text-[10px] text-muted-label">Tier {selectedMeta.tier} • {selectedResource}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {(() => {
                          const node = flowNodes.find(n => n.resource === selectedResource);
                          const status = node?.status ?? 'ok';
                          const info = STATUS_COLORS[status];
                          return status !== 'ok' ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 h-5"
                              style={{ borderColor: info.border, color: info.text, background: info.bg }}
                            >
                              {info.label}
                            </Badge>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-label" onClick={() => setSelectedResource(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  {/* Net rate */}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="bg-success/10 rounded-lg p-3 text-center border border-success/20">
                      <p className="text-[9px] text-muted-label">PROD</p>
                      <p className="text-sm font-mono font-bold text-success">+{totalProduction.toFixed(2)}</p>
                    </div>
                    <div className="bg-amber-900/10 rounded-lg p-3 text-center border border-amber-900/20">
                      <p className="text-[9px] text-muted-label">CONS</p>
                      <p className="text-sm font-mono font-bold text-warning">-{totalConsumption.toFixed(2)}</p>
                    </div>
                    <div className={`rounded-lg p-3 text-center border ${netRate >= 0 ? 'bg-success/10 border-success/20' : 'bg-danger/10 border-red-900/20'}`}>
                      <p className="text-[9px] text-muted-label">NET</p>
                      <p className={`text-sm font-mono font-bold ${netRate >= 0 ? 'text-success' : 'text-danger'}`}>
                        {netRate >= 0 ? '+' : ''}{netRate.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Storage */}
                  <div className="mt-3 flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-muted-label" />
                    <span className="text-xs text-subtle">
                      Stock: <span className="font-mono text-gray-200">{formatNumber(currentAmount)}</span>
                      <span className="text-muted-label"> / </span>
                      <span className="font-mono text-subtle">{formatNumber(capacity)}</span>
                    </span>
                    <div className="flex-1 h-1.5 bg-muted-label rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          fillPercent >= 80 ? 'bg-success' : fillPercent >= 50 ? 'bg-warning' : fillPercent >= 20 ? 'bg-orange-500' : 'bg-danger'
                        }`}
                        style={{ width: `${fillPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-label font-mono">{fillPercent.toFixed(0)}%</span>
                  </div>

                  {/* Market price */}
                  {marketPrice && (
                    <div className="mt-2 flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-muted-label" />
                      <span className="text-xs text-subtle">
                        Market: <span className="font-mono text-success">${marketPrice.currentPrice.toFixed(2)}</span>
                      </span>
                      <Badge variant="outline" className={`text-[9px] h-4 px-1 ${
                        marketPrice.trend === 'up' ? 'border-success/30 text-success' :
                        marketPrice.trend === 'down' ? 'border-danger/30 text-danger' :
                        'border-muted-label text-subtle'
                      }`}>
                        {marketPrice.trend === 'up' ? '↑' : marketPrice.trend === 'down' ? '↓' : '→'}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Producers */}
              <Card className="bg-card border-success/30">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-success" />
                    <span className="text-success">PRODUCERS</span>
                    <Badge variant="outline" className="text-[9px] border-success/30 text-success bg-success/10 ml-auto font-mono">
                      +{totalProduction.toFixed(2)}/s
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  {producers.length === 0 ? (
                    <p className="text-[11px] text-muted-label italic">No buildings produce this</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto game-scrollbar pr-1">
                      {producers.map(({ def, count, activeCount, rate }) => (
                        <div key={def.type} className="flex items-center gap-2 p-1.5 rounded-md bg-success/10 border border-success/20">
                          <GameIcon icon={def.icon} size={14} className="inline-flex" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-gray-200 truncate">{def.name}</p>
                            <p className="text-[9px] text-muted-label">{activeCount}/{count} active</p>
                          </div>
                          <span className="text-[11px] font-mono text-success">+{(rate).toFixed(2)}/s</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Consumers */}
              <Card className="bg-card border-amber-900/30">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingDown className="w-3.5 h-3.5 text-warning" />
                    <span className="text-warning">CONSUMERS</span>
                    <Badge variant="outline" className="text-[9px] border-warning/30 text-warning bg-amber-900/10 ml-auto font-mono">
                      -{(totalConsumption).toFixed(2)}/s
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  {consumers.length === 0 ? (
                    <p className="text-[11px] text-muted-label italic">No buildings consume this</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto game-scrollbar pr-1">
                      {consumers.map(({ def, count, activeCount, rate }) => (
                        <div key={def.type} className="flex items-center gap-2 p-1.5 rounded-md bg-amber-900/10 border border-amber-900/20">
                          <GameIcon icon={def.icon} size={14} className="inline-flex" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium text-gray-200 truncate">{def.name}</p>
                            <p className="text-[9px] text-muted-label">{activeCount}/{count} active{def.fuel === selectedResource ? ' (fuel)' : ''}</p>
                          </div>
                          <span className="text-[11px] font-mono text-warning">-{(rate).toFixed(2)}/s</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Production Chain Trace */}
              <Card className="bg-card border-cyan-900/30">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-teal-400">PRODUCTION CHAINS</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  {/* Chain paths */}
                  {(() => {
                    const relevantChains = PRODUCTION_CHAINS.filter(c => c.steps.includes(selectedResource));
                    if (relevantChains.length === 0) {
                      return <p className="text-[11px] text-muted-label italic">Not part of any production chain</p>;
                    }
                    return relevantChains.slice(0, 8).map((chain, ci) => {
                      const idx = chain.steps.indexOf(selectedResource);
                      const isBroken = chainTrace.brokenChains.includes(chain.name);
                      return (
                        <div key={ci} className={`p-2 rounded-lg border ${isBroken ? 'border-red-900/30 bg-danger/10' : 'border-muted-label bg-[#0a0e17]'}`}>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {isBroken ? (
                              <AlertCircle className="w-3 h-3 text-danger" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3 text-success" />
                            )}
                            <span className={`text-[10px] font-semibold ${isBroken ? 'text-danger' : 'text-subtle'}`}>{chain.name}</span>
                            {isBroken && <span className="text-[9px] text-danger ml-auto">BROKEN</span>}
                          </div>
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {chain.steps.map((step, si) => {
                              const stepRes = step as ResourceType;
                              const stepMeta = RESOURCE_META[stepRes];
                              const isCurrentStep = si === idx;
                              const isUpstream = si < idx;
                              const isDownstream = si > idx;
                              const stepProd = productionSnapshot.production[stepRes] ?? 0;
                              const stepHasStock = (resources[stepRes] ?? 0) > 0;
                              const stepActive = stepProd > 0 || stepHasStock;

                              return (
                                <div key={si} className="flex items-center gap-0.5">
                                  {si > 0 && <ArrowRight className="w-2.5 h-2.5 text-dim" />}
                                  <div
                                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] border ${
                                      isCurrentStep
                                        ? 'border-cyan-400/50 bg-cyan-900/20 text-cyan-300'
                                        : isUpstream
                                          ? stepActive ? 'border-success/30 bg-success/10 text-success' : 'border-red-900/30 bg-danger/10 text-danger'
                                          : isDownstream
                                            ? stepActive ? 'border-teal-900/30 bg-teal-900/10 text-teal-300' : 'border-muted-label bg-muted-label/20 text-muted-label'
                                            : 'border-muted-label text-muted-label'
                                    }`}
                                  >
                                    <GameIcon icon={stepMeta?.icon} size={14} className="inline-flex" />
                                    <span>{stepMeta?.name ?? step}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </CardContent>
              </Card>

              {/* Suggestions */}
              {netRate < 0 && producers.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-900/10 border border-yellow-900/20">
                  <Lightbulb className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold text-warning">Production Deficit</p>
                    <p className="text-[10px] text-warning/80">
                      Build more <GameIcon icon={producers[0].def.icon} size={14} className="inline-flex" /> {producers[0].def.name} or reduce <GameIcon icon={consumers[0]?.def.icon} size={14} className="inline-flex" /> {consumers[0]?.def.name} consumption.
                    </p>
                  </div>
                </div>
              )}
              {netRate > 0 && consumers.some(c => c.count === 0) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                  <Lightbulb className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold text-success">Surplus Available</p>
                    <p className="text-[10px] text-success/80">
                      Build <GameIcon icon={consumers.find(c => c.count === 0)?.def.icon} size={14} className="inline-flex" /> {consumers.find(c => c.count === 0)?.def.name} to use excess {selectedMeta.name}.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Chain Quick Select (when no resource selected) ──── */}
      {!selectedResource && (
        <Card className="bg-card border-cyan-900/30">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-sm font-semibold text-subtle flex items-center gap-2">
              <Zap className="w-4 h-4 text-warning" />
              Production Chain Browser
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto game-scrollbar pr-1">
              {PRODUCTION_CHAINS.map((chain, i) => {
                const chainActive = chain.steps.every((step: string) => {
                  const r = step as ResourceType;
                  return (productionSnapshot.production[r] ?? 0) > 0 || (resources[r] ?? 0) > 0;
                });
                const chainPartial = chain.steps.some((step: string) => {
                  const r = step as ResourceType;
                  return (productionSnapshot.production[r] ?? 0) > 0;
                });
                return (
                  <button
                    key={i}
                    onClick={() => {
                      // Select the first resource in the chain that has activity, or the first step
                      const firstActive = chain.steps.find((s: string) => {
                        const r = s as ResourceType;
                        return (productionSnapshot.production[r] ?? 0) > 0;
                      }) as ResourceType | undefined;
                      setSelectedResource(firstActive ?? (chain.steps[0] as ResourceType));
                      setHighlightChain(i);
                    }}
                    className={`text-left p-3 rounded-lg border ${
                      highlightChain === i
                        ? 'border-cyan-400/40 bg-cyan-900/10'
                        : chainActive
                          ? 'border-success/30 bg-success/5 hover:border-success/30'
                          : chainPartial
                            ? 'border-amber-900/30 bg-amber-900/5 hover:border-amber-700/30'
                            : 'border-muted-label bg-[#0a0e17] hover:border-muted-label'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: chain.color }}
                      />
                      <span className="text-[11px] font-medium text-subtle truncate">{chain.name}</span>
                      {chainActive && <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-success/30 text-success ml-auto">ACTIVE</Badge>}
                    </div>
                    <div className="flex items-center gap-0.5 flex-wrap">
                      {chain.steps.slice(0, 5).map((step: string, si: number) => {
                        const stepRes = step as ResourceType;
                        const stepMeta = RESOURCE_META[stepRes];
                        return (
                          <div key={si} className="flex items-center gap-0.5">
                            {si > 0 && <ArrowRight className="w-2 h-2 text-dim" />}
                            <GameIcon icon={stepMeta?.icon} size={10} className="inline-flex" />
                          </div>
                        );
                      })}
                      {chain.steps.length > 5 && <span className="text-[9px] text-muted-label">+{chain.steps.length - 5}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
