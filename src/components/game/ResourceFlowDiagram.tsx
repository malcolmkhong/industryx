'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/state/store';
import { useShallow } from 'zustand/react/shallow';
import { BUILDING_DEFS, PRODUCTION_CHAINS } from '@/lib/game/config/configCache';
import { RESOURCE_META } from '@/lib/game/catalog/ui/uiCatalog';
import type { ResourceType } from "@/lib/game/shared/types/types";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GameIcon } from '@/components/icons';
import { Search, GitBranch, X, ArrowRight, Zap } from 'lucide-react';

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

type BottleneckStatus = 'bottleneck' | 'nearFull' | 'notProduced' | 'ok';

function classifyResource(
  resource: ResourceType,
  prodRate: number,
  consRate: number,
  amount: number,
  capacity: number,
): BottleneckStatus {
  if (prodRate === 0 && consRate > 0) return 'notProduced';
  if (consRate > prodRate && prodRate > 0) return 'bottleneck';
  if (capacity > 0 && amount / capacity > 0.9 && prodRate > consRate) return 'nearFull';
  return 'ok';
}

const STATUS_COLORS: Record<BottleneckStatus, { border: string; bg: string; text: string; label: string }> = {
  bottleneck: { border: '#ef4444', bg: 'rgba(239,68,68,0.15)', text: '#f87171', label: 'BOTTLENECK' },
  nearFull: { border: '#eab308', bg: 'rgba(234,179,8,0.15)', text: '#facc15', label: 'NEAR FULL' },
  notProduced: { border: '#6b7280', bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', label: 'NOT PRODUCED' },
  ok: { border: '#22d3ee', bg: 'rgba(34,211,238,0.08)', text: '#22d3ee', label: '' },
};

const TIER_X = [0.05, 0.22, 0.40, 0.58, 0.76, 0.94];

export default function ResourceFlowDiagram() {
  const {
    productionSnapshot,
    buildings,
    resources,
    resourceCapacity,
  } = useGameStore(useShallow((state) => ({
    productionSnapshot: state.productionSnapshot,
    buildings: state.buildings,
    resources: state.resources,
    resourceCapacity: state.resourceCapacity,
  })));

  const [selectedResource, setSelectedResource] = useState<ResourceType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightChain, setHighlightChain] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgDims, setSvgDims] = useState({ w: 900, h: 600 });

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
          const inResRaw = input.resource;
          const outResRaw = output.resource;
          if (inResRaw === 'money' || outResRaw === 'money') continue;
          const inRes = inResRaw as ResourceType;
          const outRes = outResRaw as ResourceType;

          const rate = output.amount;

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

  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const tierGroups: Record<number, FlowNode[]> = {};
    for (const node of flowNodes) {
      if (!tierGroups[node.tier]) tierGroups[node.tier] = [];
      tierGroups[node.tier].push(node);
    }
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

  const summaryStats = useMemo(() => {
    const bottleneckCount = flowNodes.filter(n => n.status === 'bottleneck').length;
    const nearFullCount = flowNodes.filter(n => n.status === 'nearFull').length;
    const notProducedCount = flowNodes.filter(n => n.status === 'notProduced').length;

    const constrained = flowNodes
      .filter(n => n.consumptionRate > 0)
      .sort((a, b) => a.netRate - b.netRate);
    const mostConstrained = constrained[0];

    const totalThroughput = flowNodes.reduce((sum, n) => sum + n.productionRate, 0);

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

  const chainTrace = useMemo(() => {
    if (!selectedResource) return { backward: new Set<string>(), forward: new Set<string>() };

    const backward = new Set<string>();
    const forward = new Set<string>();

    const relevantChains = PRODUCTION_CHAINS.filter(chain =>
      chain.steps.includes(selectedResource)
    );

    for (const chain of relevantChains) {
      const idx = chain.steps.indexOf(selectedResource);
      for (let i = 0; i <= idx; i++) {
        backward.add(chain.steps[i]);
      }
      for (let i = idx; i < chain.steps.length; i++) {
        forward.add(chain.steps[i]);
      }
    }

    return { backward, forward };
  }, [selectedResource]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return flowNodes;
    const q = searchQuery.toLowerCase();
    return flowNodes.filter(n =>
      n.resource.toLowerCase().includes(q) ||
      RESOURCE_META[n.resource].name.toLowerCase().includes(q)
    );
  }, [flowNodes, searchQuery]);

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

  const handleNodeClick = useCallback((resource: ResourceType) => {
    setSelectedResource(prev => prev === resource ? null : resource);
    setHighlightChain(null);
  }, []);

  const getEdgeStyle = useCallback((rate: number) => {
    if (rate <= 0) return { stroke: '#ef4444', strokeWidth: 1.5, dashArray: '4 4', opacity: 0.4 };
    if (rate < 1) return { stroke: '#eab308', strokeWidth: 2, dashArray: 'none', opacity: 0.6 };
    if (rate < 5) return { stroke: '#22d3ee', strokeWidth: 2.5, dashArray: 'none', opacity: 0.7 };
    return { stroke: '#4ade80', strokeWidth: 3.5, dashArray: 'none', opacity: 0.9 };
  }, []);

  const getPath = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const dx = (to.x - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-linear-to-br from-success/70/20 to-brand/70/20 border border-brand/30 flex items-center justify-center">
          <GitBranch className="w-5 h-5 text-brand" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-brand tracking-wide">Resource Flow Diagram</h2>
          <p className="text-[10px] text-muted-label">Visualize production chains, detect bottlenecks, optimize your factory</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-card rounded-lg p-3 border border-brand/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Active Chains</p>
          <p className="text-lg font-mono font-bold text-brand">
            {summaryStats.activeChains}
            <span className="text-muted-label text-sm">/{summaryStats.totalChains}</span>
          </p>
        </div>
        <div className="bg-card rounded-lg p-3 border border-brand/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Bottlenecks</p>
          <p className={`text-lg font-mono font-bold ${summaryStats.bottleneckCount + summaryStats.notProducedCount > 0 ? 'text-danger' : 'text-success'}`}>
            {summaryStats.bottleneckCount + summaryStats.notProducedCount}
          </p>
        </div>
        <div className="bg-card rounded-lg p-3 border border-brand/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Most Constrained</p>
          <p className="text-sm font-bold text-domain truncate">
            {summaryStats.mostConstrained
              ? <><GameIcon icon={RESOURCE_META[summaryStats.mostConstrained.resource].icon} size={14} className="inline-flex" /> {RESOURCE_META[summaryStats.mostConstrained.resource].name}</>
              : '—'}
          </p>
        </div>
        <div className="bg-card rounded-lg p-3 border border-brand/20">
          <p className="text-[9px] text-muted-label uppercase tracking-wider">Throughput</p>
          <p className="text-lg font-mono font-bold text-success">{formatNumber(summaryStats.totalThroughput)}</p>
        </div>
      </div>

      <Card className="bg-background border-brand/30 overflow-hidden">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-subtle flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-brand" />
              Flow Diagram
            </CardTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-7 w-32 text-[11px] bg-card border-brand/30 text-subtle placeholder-muted-label"
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
          <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-label">
            <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-success inline-block rounded" /> High</span>
            <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-brand inline-block rounded" /> Medium</span>
            <span className="flex items-center gap-1"><span className="w-5 h-0.5 bg-warning inline-block rounded" /> Low</span>
            <span className="flex items-center gap-1"><span className="w-5 h-0.5 border-t border-dashed border-danger inline-block" /> Zero</span>
            <span className="ml-auto text-muted-label">Click a node for details</span>
          </div>
        </CardHeader>
        <CardContent className="p-0 relative max-h-150 overflow-y-auto game-scrollbar" style={{ height: Math.max(400, flowNodes.length * 8 + 100) }}>
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
              <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
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

            {['Raw', 'T1', 'T2', 'T3', 'T4', 'T5'].map((label, i) => (
              <text
                key={label}
                x={TIER_X[i] * svgDims.w}
                y={20}
                textAnchor="middle"
                className="fill-muted-label text-[10px] font-semibold uppercase tracking-wider"
              >
                {label}
              </text>
            ))}

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

                  <circle
                    r={nodeRadius}
                    fill={isDimmed ? '#0d1220' : isSelected ? 'rgba(34,211,238,0.15)' : statusInfo.bg}
                    stroke={isDimmed ? '#1e293b' : isSelected ? '#22d3ee' : meta.color}
                    strokeWidth={isSelected ? 2 : 1}
                    opacity={isDimmed ? 0.3 : 1}
                    filter={isSelected ? 'url(#glow-cyan)' : undefined}
                  />

                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isSelected ? 14 : 11}
                    opacity={isDimmed ? 0.3 : 1}
                  >
                    <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                  </text>

                  <text
                    y={nodeRadius + 12}
                    textAnchor="middle"
                    fontSize={8}
                    className="fill-muted-label/40"
                    opacity={isDimmed ? 0.2 : 0.9}
                  >
                    {meta.name.length > 10 ? meta.name.substring(0, 9) + '\u2026' : meta.name}
                  </text>

                  <text
                    y={nodeRadius + 22}
                    textAnchor="middle"
                    fontSize={7}
                    className={node.netRate > 0 ? 'fill-success' : node.netRate < 0 ? 'fill-danger/60' : 'fill-muted-label'}
                    fontFamily="monospace"
                    opacity={isDimmed ? 0.15 : 0.8}
                  >
                    {node.netRate > 0 ? `+${node.netRate.toFixed(1)}/s` : node.netRate < 0 ? `${node.netRate.toFixed(1)}/s` : '\u2014'}
                  </text>

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

      {!selectedResource && (
        <Card className="bg-card border-brand/30">
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
                      const firstActive = chain.steps.find((s: string) => {
                        const r = s as ResourceType;
                        return (productionSnapshot.production[r] ?? 0) > 0;
                      }) as ResourceType | undefined;
                      setSelectedResource(firstActive ?? (chain.steps[0] as ResourceType));
                      setHighlightChain(i);
                    }}
                    className={`text-left p-3 rounded-lg border ${
                      highlightChain === i
                        ? 'border-brand/40 bg-brand/10'
                        : chainActive
                          ? 'border-success/30 bg-success/5 hover:border-success/30'
                          : chainPartial
                            ? 'border-warning/30 bg-warning/5 hover:border-warning/70/30'
                            : 'border-muted-label bg-background hover:border-muted-label'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: chain.color }}
                      />
                      <span className="text-[11px] font-medium text-subtle truncate">{chain.name}</span>
                      {chainActive && <Badge variant="outline" className="text-[11px] h-3.5 px-1 border-success/30 text-success ml-auto">ACTIVE</Badge>}
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
