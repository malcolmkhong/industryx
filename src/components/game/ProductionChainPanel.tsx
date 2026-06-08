'use client';

import { useMemo, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { PRODUCTION_CHAINS, RESOURCE_META, BUILDING_DEFS } from '@/lib/game/configCache';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp,
  Factory, Eye, EyeOff
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ResourceType } from '@/lib/game/types';
import { GameIcon } from '@/components/game/shared/GameIcon';

// Tier color scheme for SVG nodes
const TIER_COLORS = [
  { fill: '#78350f', stroke: '#b45309', text: '#fbbf24', label: 'Raw' },      // Tier 0 - Amber
  { fill: '#164e63', stroke: '#0e7490', text: '#22d3ee', label: 'Tier 1' },    // Tier 1 - Cyan
  { fill: '#7c2d12', stroke: '#c2410c', text: '#fb923c', label: 'Tier 2' },    // Tier 2 - Orange
  { fill: '#581c87', stroke: '#7e22ce', text: '#c084fc', label: 'Tier 3' },    // Tier 3 - Purple
];

// Node dimensions for SVG layout
const NODE_W = 120;
const NODE_H = 90;
const GAP_X = 60;
const PADDING = 20;

interface ProductionChainPanelProps {
  productionRates: Record<string, number>;
}

export function ProductionChainPanel({ productionRates }: ProductionChainPanelProps) {
  const store = useGameStore();
  const [selectedChain, setSelectedChain] = useState(0);
  const [showDetailView, setShowDetailView] = useState(false);

  const chain = PRODUCTION_CHAINS[selectedChain];

  // Compute which buildings produce each resource step
  const stepBuildings = useMemo(() => {
    const map: Record<string, { type: string; name: string; icon: string; count: number; activeCount: number }[]> = {};
    chain.steps.forEach(step => {
      const producers: { type: string; name: string; icon: string; count: number; activeCount: number }[] = [];
      Object.values(BUILDING_DEFS).forEach(def => {
        if (def.outputs?.some(o => o.resource === step)) {
          const count = store.buildings.filter(b => b.type === def.type).length;
          const activeCount = store.buildings.filter(b => b.type === def.type && b.active).length;
          producers.push({ type: def.type, name: def.name, icon: def.icon, count, activeCount });
        }
      });
      map[step] = producers;
    });
    return map;
  }, [chain, store.buildings]);

  // Bottleneck detection for this chain
  const chainBottlenecks = useMemo(() => {
    return chain.steps.filter(step => (productionRates[step as ResourceType] ?? 0) <= 0);
  }, [chain, productionRates]);

  const hasBottleneck = chainBottlenecks.length > 0;
  const allProducing = chain.steps.every(step => (productionRates[step as ResourceType] ?? 0) > 0);

  // SVG layout calculations
  const totalWidth = chain.steps.length * NODE_W + (chain.steps.length - 1) * GAP_X + PADDING * 2;
  const svgHeight = showDetailView ? 220 : 140;

  return (
    <div
      className="game-card rounded-xl bg-card p-4 border border-border"
      style={{ borderColor: `${chain.color}33` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-4 h-4" style={{ color: chain.color }} />
          <h3 className="text-sm font-semibold" style={{ color: chain.color }}>Production Chains</h3>
        </div>
        <div className="flex items-center gap-2">
          {/* Chain status badge */}
          {allProducing && chain.steps.length > 0 ? (
            <Badge variant="outline" className="text-[9px] border-green-500/50 text-green-400 bg-green-900/20">
              <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
              CHAIN ACTIVE
            </Badge>
          ) : hasBottleneck ? (
            <Badge variant="outline" className="text-[9px] border-red-500/50 text-red-400 bg-red-900/20">
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              BOTTLENECK
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{ borderColor: `${chain.color}66`, color: chain.color, backgroundColor: `${chain.color}15` }}
          >
            {chain.name}
          </Badge>
          {/* Detail toggle */}
          <button
            onClick={() => setShowDetailView(!showDetailView)}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded border border-gray-800 hover:border-gray-600"
            title={showDetailView ? 'Compact view' : 'Detailed SVG view'}
          >
            {showDetailView ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span className="hidden sm:inline">{showDetailView ? 'Compact' : 'Detail'}</span>
          </button>
        </div>
      </div>

      {/* Chain Selector Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 game-scrollbar scroll-fade">
        {PRODUCTION_CHAINS.map((c, i) => {
          const cBottlenecks = c.steps.filter(step => (productionRates[step as ResourceType] ?? 0) <= 0);
          const cAllProducing = c.steps.every(step => (productionRates[step as ResourceType] ?? 0) > 0);
          return (
            <button
              key={c.name}
              onClick={() => setSelectedChain(i)}
              className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium border relative ${
                i === selectedChain
                  ? 'text-white border-transparent shadow-lg'
                  : 'text-gray-400 border-gray-700/50 bg-gray-800/50 hover:border-gray-600 hover:text-gray-300'
              }`}
              style={i === selectedChain ? {
                backgroundColor: `${c.color}33`,
                borderColor: `${c.color}88`,
                boxShadow: `0 0 12px ${c.color}33`,
              } : undefined}
            >
              {c.name}
              {!cAllProducing && c.steps.length > 0 && i !== selectedChain && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* SVG Flow Diagram */}
      <div
          key={chain.name + (showDetailView ? '-detail' : '-compact')}
          className="overflow-x-auto game-scrollbar max-w-full"
        >
          <svg
            width={totalWidth}
            height={svgHeight}
            viewBox={`0 0 ${totalWidth} ${svgHeight}`}
            className="min-w-full"
            style={{ maxHeight: svgHeight }}
            role="img"
            aria-label={`Production chain visualization for ${chain.name}`}
            tabIndex={0}
          >
            {/* Defs for gradients and markers */}
            <defs>
              {/* Arrow marker */}
              <marker
                id={`arrowhead-${selectedChain}`}
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 8 3, 0 6"
                  fill={chain.color}
                  opacity="0.7"
                />
              </marker>
              {/* Glow filter */}
              <filter id={`glow-${selectedChain}`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Bottleneck glow */}
              <filter id={`bottleneck-glow-${selectedChain}`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Connection arrows between nodes */}
            {chain.steps.map((step, i) => {
              if (i >= chain.steps.length - 1) return null;
              const nextStep = chain.steps[i + 1];
              const rate = productionRates[step as ResourceType] ?? 0;
              const nextRate = productionRates[nextStep as ResourceType] ?? 0;
              const isBottleneck = rate <= 0 || nextRate <= 0;

              const x1 = PADDING + i * (NODE_W + GAP_X) + NODE_W;
              const x2 = PADDING + (i + 1) * (NODE_W + GAP_X);
              const y = svgHeight / 2;

              return (
                <g key={`arrow-${i}`}>
                  {/* Connection line */}
                  <line
                    x1={x1}
                    y1={y}
                    x2={x2 - 8}
                    y2={y}
                    stroke={isBottleneck ? '#ef4444' : chain.color}
                    strokeWidth="2"
                    strokeDasharray={isBottleneck ? '6 4' : 'none'}
                    opacity={isBottleneck ? 0.3 : 0.5}
                    markerEnd={`url(#arrowhead-${selectedChain})`}
                  />
                  {/* Animated flow particle */}
                  {!isBottleneck && (
                    <circle r="3" fill={chain.color} opacity="0.8">
                      <animateMotion
                        dur="1.5s"
                        repeatCount="indefinite"
                        path={`M${x1},${y} L${x2 - 8},${y}`}
                      />
                    </circle>
                  )}
                  {/* Second particle for visual depth */}
                  {!isBottleneck && (
                    <circle r="2" fill={chain.color} opacity="0.4">
                      <animateMotion
                        dur="1.5s"
                        repeatCount="indefinite"
                        begin="0.75s"
                        path={`M${x1},${y} L${x2 - 8},${y}`}
                      />
                    </circle>
                  )}
                </g>
              );
            })}

            {/* Resource nodes */}
            {chain.steps.map((step, i) => {
              const meta = RESOURCE_META[step as ResourceType];
              if (!meta) return null;
              const rate = productionRates[step as ResourceType] ?? 0;
              const stock = store.resources[step as ResourceType] ?? 0;
              const capacity = store.resourceCapacity[step as ResourceType] ?? 0;
              const fillPct = capacity > 0 ? Math.min(100, (stock / capacity) * 100) : 0;
              const isBottleneck = rate <= 0;
              const tier = TIER_COLORS[meta.tier] ?? TIER_COLORS[0];
              const buildings = stepBuildings[step] ?? [];

              const x = PADDING + i * (NODE_W + GAP_X);
              const y = svgHeight / 2 - NODE_H / 2;

              return (
                <g key={step} filter={isBottleneck ? `url(#bottleneck-glow-${selectedChain})` : rate > 0 ? `url(#glow-${selectedChain})` : undefined}>
                  {/* Node background */}
                  <rect
                    x={x}
                    y={y}
                    width={NODE_W}
                    height={NODE_H}
                    rx="8"
                    ry="8"
                    fill={isBottleneck ? '#450a0a' : tier.fill}
                    stroke={isBottleneck ? '#ef4444' : tier.stroke}
                    strokeWidth={isBottleneck ? 2 : 1.5}
                    opacity={isBottleneck ? 1 : 0.9}
                  />

                  {/* Tier indicator bar at top */}
                  <rect
                    x={x}
                    y={y}
                    width={NODE_W}
                    height="3"
                    rx="8"
                    ry="8"
                    fill={isBottleneck ? '#ef4444' : tier.stroke}
                    opacity="0.8"
                  />

                  {/* Bottleneck warning overlay */}
                  {isBottleneck && (
                    <rect
                      x={x}
                      y={y}
                      width={NODE_W}
                      height={NODE_H}
                      rx="8"
                      ry="8"
                      fill="#ef4444"
                      opacity="0.05"
                    >
                      <animate
                        attributeName="opacity"
                        values="0.05;0.15;0.05"
                        dur="2s"
                        repeatCount="indefinite"
                      />
                    </rect>
                  )}

                  {/* Resource icon via foreignObject */}
                  <foreignObject
                    x={x + NODE_W / 2 - 12}
                    y={y + 8}
                    width={24}
                    height={24}
                  >
                    <GameIcon icon={meta.icon} size={20} color={meta.color} className="flex items-center justify-center" />
                  </foreignObject>

                  {/* Resource name */}
                  <text
                    x={x + NODE_W / 2}
                    y={y + 40}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="600"
                    fill={isBottleneck ? '#ef4444' : tier.text}
                    dominantBaseline="middle"
                  >
                    {meta.name.length > 12 ? meta.name.slice(0, 11) + '…' : meta.name}
                  </text>

                  {/* Stock amount */}
                  <text
                    x={x + NODE_W / 2}
                    y={y + 54}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#9ca3af"
                    fontFamily="monospace"
                    dominantBaseline="middle"
                  >
                    {formatNumber(stock)}
                    {capacity > 0 && <tspan fill="#6b7280">/{formatNumber(capacity)}</tspan>}
                  </text>

                  {/* Capacity bar background */}
                  {capacity > 0 && (
                    <rect
                      x={x + 10}
                      y={y + 60}
                      width={NODE_W - 20}
                      height="4"
                      rx="2"
                      fill="#1f2937"
                    />
                  )}

                  {/* Capacity bar fill */}
                  {capacity > 0 && (
                    <rect
                      x={x + 10}
                      y={y + 60}
                      width={Math.max(0, (NODE_W - 20) * (fillPct / 100))}
                      height="4"
                      rx="2"
                      fill={isBottleneck ? '#ef4444' : fillPct > 80 ? '#ef4444' : fillPct > 50 ? '#f59e0b' : chain.color}
                      opacity="0.8"
                    />
                  )}

                  {/* Production rate */}
                  {rate > 0 ? (
                    <text
                      x={x + NODE_W / 2}
                      y={y + 76}
                      textAnchor="middle"
                      fontSize="8"
                      fontWeight="bold"
                      fill="#4ade80"
                      fontFamily="monospace"
                      dominantBaseline="middle"
                    >
                      +{(rate).toFixed(1)}/s
                    </text>
                  ) : rate < 0 ? (
                    <text
                      x={x + NODE_W / 2}
                      y={y + 76}
                      textAnchor="middle"
                      fontSize="8"
                      fontWeight="bold"
                      fill="#ef4444"
                      fontFamily="monospace"
                      dominantBaseline="middle"
                    >
                      {(rate).toFixed(1)}/s
                    </text>
                  ) : (
                    <text
                      x={x + NODE_W / 2}
                      y={y + 76}
                      textAnchor="middle"
                      fontSize="8"
                      fontWeight="bold"
                      fill="#6b7280"
                      fontFamily="monospace"
                      dominantBaseline="middle"
                    >
                      —
                    </text>
                  )}

                  {/* Tier badge */}
                  <circle
                    cx={x + NODE_W - 8}
                    cy={y + 8}
                    r="7"
                    fill={isBottleneck ? '#ef4444' : tier.stroke}
                    opacity="0.9"
                  />
                  <text
                    x={x + NODE_W - 8}
                    y={y + 9}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="bold"
                    fill="white"
                    dominantBaseline="middle"
                  >
                    {meta.tier}
                  </text>

                  {/* Bottleneck badge */}
                  {isBottleneck && (
                    <>
                      <rect
                        x={x + NODE_W / 2 - 28}
                        y={y - 10}
                        width="56"
                        height="14"
                        rx="7"
                        fill="#ef4444"
                        opacity="0.9"
                      />
                      <text
                        x={x + NODE_W / 2}
                        y={y - 3}
                        textAnchor="middle"
                        fontSize="7"
                        fontWeight="bold"
                        fill="white"
                        dominantBaseline="middle"
                      >
                        BOTTLENECK
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Detailed building info (shown below SVG when toggled) */}
          <>
            {showDetailView && (
              <div
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2">
                  {chain.steps.map((step) => {
                    const meta = RESOURCE_META[step as ResourceType];
                    if (!meta) return null;
                    const rate = productionRates[step as ResourceType] ?? 0;
                    const stock = store.resources[step as ResourceType] ?? 0;
                    const isBottleneck = rate <= 0;
                    const buildings = stepBuildings[step] ?? [];
                    const tier = TIER_COLORS[meta.tier] ?? TIER_COLORS[0];

                    return (
                      <div
                        key={step}
                        className={`rounded-lg p-3 border ${
                          isBottleneck
                            ? 'bg-red-900/10 border-red-900/30'
                            : 'bg-[#0a0e17] border-gray-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <GameIcon icon={meta.icon} size={14} className="inline-flex" />
                            <span className="text-[11px] font-semibold" style={{ color: isBottleneck ? '#ef4444' : tier.text }}>
                              {meta.name}
                            </span>
                            <span
                              className="text-[8px] px-1.5 py-0.5 rounded-full font-bold"
                              style={{
                                backgroundColor: `${tier.stroke}33`,
                                color: tier.text,
                                border: `1px solid ${tier.stroke}66`,
                              }}
                            >
                              {tier.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 font-mono">
                              {formatNumber(stock)}
                            </span>
                            {rate > 0 ? (
                              <span className="text-[10px] text-green-400 font-mono font-bold">
                                +{(rate).toFixed(1)}/s
                              </span>
                            ) : rate < 0 ? (
                              <span className="text-[10px] text-red-400 font-mono font-bold">
                                {(rate).toFixed(1)}/s
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-600 font-mono">
                                —
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Building producers */}
                        {buildings.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[9px] text-gray-500">Producers:</span>
                            {buildings.map(b => (
                              <div
                                key={b.type}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border ${
                                  b.activeCount > 0
                                    ? 'border-green-900/40 bg-green-900/10 text-green-400'
                                    : 'border-gray-800 bg-gray-900/30 text-gray-500'
                                }`}
                              >
                                <GameIcon icon={b.icon} size={16} />
                                <span className="font-medium">{b.name}</span>
                                <span className="text-gray-500">
                                  ({b.activeCount}/{b.count})
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-gray-600">No buildings produce this resource</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        </div>

      {/* Chain completion summary */}
      <div className="mt-3 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-3">
          <span className="text-gray-500">
            Chain progress: <span className={allProducing ? 'text-green-400 font-bold' : 'text-orange-400 font-bold'}>
              {chain.steps.filter(s => (productionRates[s as ResourceType] ?? 0) > 0).length}/{chain.steps.length}
            </span> steps active
          </span>
          {hasBottleneck && (
            <span className="text-red-400">
              {chainBottlenecks.length} bottleneck{chainBottlenecks.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-gray-600">
          {PRODUCTION_CHAINS.length} chains
        </span>
      </div>
    </div>
  );
}
