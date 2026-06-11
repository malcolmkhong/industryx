'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { TRANSPORT_DEFS, BUILDING_DEFS, RESOURCE_META, WEATHER_DEFS } from '@/lib/game/configCache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Truck, ArrowRight, ChevronUp, Power, AlertTriangle,
  Package, Route, Zap, Gauge, CircleDot, Lightbulb,
  BarChart3, X, Cloud, CheckCircle2, XCircle, Activity,
  Network, ShieldAlert, TrendingUp, TrendingDown, Minus,
  ZapOff, Play, Pause, ChevronDown, ChevronRight, Link2,
  Database, ZoomIn, ZoomOut, Maximize2, Move
} from 'lucide-react';
import { TransportType, ResourceType, BuildingInstance } from '@/lib/game/types';
import { GameItemTooltip } from '@/components/game/GameItemTooltip';
import { PanelStatCard } from '@/components/game/shared/PanelStatCard';
import { motion, AnimatePresence } from 'framer-motion';
import { GameIcon } from '@/components/game/shared/GameIcon';

// --- Tier Color Map ---
const TIER_COLORS: Record<number, { fill: string; stroke: string; text: string; bg: string; label: string }> = {
  0: { fill: '#374151', stroke: '#a0a0a0', text: 'text-subtle', bg: 'bg-muted-label/20', label: 'Raw' },
  1: { fill: '#164e63', stroke: '#22d3ee', text: 'text-brand', bg: 'bg-brand/20', label: 'T1' },
  2: { fill: '#431407', stroke: '#f97316', text: 'text-domain', bg: 'bg-domain/20', label: 'T2' },
  3: { fill: '#3b0764', stroke: '#a855f7', text: 'text-research', bg: 'bg-research/20', label: 'T3' },
  4: { fill: '#022c22', stroke: '#00ffcc', text: 'text-success', bg: 'bg-success/20', label: 'T4' },
};

// --- ERD Data Types ---
interface ERDNode {
  id: string;
  type: 'extractor' | 'factory' | 'power' | 'storage' | 'hub';
  label: string;
  buildingType: string;
  tier: number;
  icon: string;
  inputs: string[];   // resource names
  outputs: string[];  // resource names
  active: boolean;
  level: number;
}

interface ERDRelation {
  id: string;
  fromId: string;
  toId: string;
  resources: { resource: ResourceType; throughput: number; maxThroughput: number }[];
  totalThroughput: number;
  active: boolean;
  lineCount: number;
}

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

// --- Port/Anchor System for Network Graph ---
// Each node container has anchor points (ports) around its boundary for clean, precise edge routing.
// Ports prevent line overlap by distributing connections across multiple anchor positions.

type PortSide = 'top' | 'right' | 'bottom' | 'left';
type PortId = string; // e.g. 'right-top', 'right-center', 'right-bottom', 'top-left', etc.

interface PortDef {
  id: PortId;
  side: PortSide;
  /** Position as fraction along that side (0 = start, 1 = end) */
  fraction: number;
}

/** Standard port definitions for a node — 12 anchor points total */
const PORT_DEFS: PortDef[] = [
  // Right side (primary output — most edges go right in hierarchical layout)
  { id: 'right-top', side: 'right', fraction: 0.2 },
  { id: 'right-center', side: 'right', fraction: 0.5 },
  { id: 'right-bottom', side: 'right', fraction: 0.8 },
  // Left side (primary input)
  { id: 'left-top', side: 'left', fraction: 0.2 },
  { id: 'left-center', side: 'left', fraction: 0.5 },
  { id: 'left-bottom', side: 'left', fraction: 0.8 },
  // Top side (cross-tier upward, same-column)
  { id: 'top-left', side: 'top', fraction: 0.25 },
  { id: 'top-center', side: 'top', fraction: 0.5 },
  { id: 'top-right', side: 'top', fraction: 0.75 },
  // Bottom side (cross-tier downward, same-column)
  { id: 'bottom-left', side: 'bottom', fraction: 0.25 },
  { id: 'bottom-center', side: 'bottom', fraction: 0.5 },
  { id: 'bottom-right', side: 'bottom', fraction: 0.75 },
];

/** Compute absolute (x, y) for a port on a node of given dimensions */
function getPortXY(port: PortDef, w: number, h: number): { x: number; y: number } {
  switch (port.side) {
    case 'top': return { x: w * port.fraction, y: 0 };
    case 'right': return { x: w, y: h * port.fraction };
    case 'bottom': return { x: w * port.fraction, y: h };
    case 'left': return { x: 0, y: h * port.fraction };
  }
}

// --- Layout Engine Configuration ---
// The graph uses a **Hierarchical Tier-Column Layout Engine**:
// Nodes are grouped by tier (0–4) and arranged in left-to-right columns.
// Each column is vertically stacked with guaranteed minimum spacing.
// A collision detection post-pass ensures no overlap under any condition.

const LAYOUT_CONFIG = {
  // Node sizing
  collapsedWidth: 110,
  expandedWidth: 156,
  collapsedHeight: 24,
  headerHeight: 20,
  rowHeight: 13,
  nodePadding: 3,

  // Column spacing (horizontal gap between tier columns)
  columnGap: 160,

  // Row spacing (vertical gap between nodes in same column)
  rowGapCollapsed: 10,
  rowGapExpanded: 14,

  // Collision prevention — minimum guaranteed gap between ANY two node bounding boxes
  minNodeSpacing: 12,

  // Port configuration
  portPadding: 4,          // Distance from corners to nearest port
  maxPortsPerSide: 3,      // Maximum anchor points per side

  // Canvas padding
  canvasPadX: 16,
  canvasPadY: 16,
};

// --- Port Assignment Algorithm ---
// For each relation (edge), determine the best source and target port based on:
// 1. Direction: Which side of each node faces the other
// 2. Spatial position: Avoid overlapping edges by distributing across available ports
// 3. Relationship logic: Output → right ports, Input → left ports (default for left-to-right flow)

function assignPorts(
  relations: ERDRelation[],
  nodePositions: Map<string, { x: number; y: number }>,
  nodeDims: Map<string, { w: number; h: number; expanded: boolean }>,
): Map<string, { fromPort: PortDef; toPort: PortDef }> {
  const portMap = new Map<string, { fromPort: PortDef; toPort: PortDef }>();

  // Track which ports are already used per node (to distribute evenly)
  const usedPorts = new Map<string, Map<string, number>>(); // nodeId → portId → count

  const getUsedCount = (nodeId: string, portId: string): number => {
    return usedPorts.get(nodeId)?.get(portId) ?? 0;
  };

  const markUsed = (nodeId: string, portId: string) => {
    if (!usedPorts.has(nodeId)) usedPorts.set(nodeId, new Map());
    const nodePorts = usedPorts.get(nodeId)!;
    nodePorts.set(portId, (nodePorts.get(portId) ?? 0) + 1);
  };

  relations.forEach(rel => {
    const fromPos = nodePositions.get(rel.fromId);
    const toPos = nodePositions.get(rel.toId);
    const fromD = nodeDims.get(rel.fromId);
    const toD = nodeDims.get(rel.toId);

    if (!fromPos || !toPos || !fromD || !toD) return;

    const fromCX = fromPos.x + fromD.w / 2;
    const fromCY = fromPos.y + fromD.h / 2;
    const toCX = toPos.x + toD.w / 2;
    const toCY = toPos.y + toD.h / 2;

    const dx = toCX - fromCX;
    const dy = toCY - fromCY;

    // Determine the primary direction from source to target
    let fromSide: PortSide;
    let toSide: PortSide;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal dominance
      if (dx > 0) {
        // Target is to the right → source outputs right, target inputs left
        fromSide = 'right';
        toSide = 'left';
      } else {
        // Target is to the left → source outputs left, target inputs right
        fromSide = 'left';
        toSide = 'right';
      }
    } else {
      // Vertical dominance
      if (dy > 0) {
        // Target is below → source outputs bottom, target inputs top
        fromSide = 'bottom';
        toSide = 'top';
      } else {
        // Target is above → source outputs top, target inputs bottom
        fromSide = 'top';
        toSide = 'bottom';
      }
    }

    // Get available ports for the determined sides
    const fromPorts = PORT_DEFS.filter(p => p.side === fromSide);
    const toPorts = PORT_DEFS.filter(p => p.side === toSide);

    // Pick the port with the least usage (distributes edges evenly)
    // For vertical edges, also consider the relative horizontal position
    const selectBestPort = (ports: PortDef[], nodeId: string, nodeW: number, nodeH: number, relCY: number, nodeCY: number): PortDef => {
      if (ports.length === 1) return ports[0];

      // Sort by: (1) least usage count, (2) closest fraction to relative position
      const sorted = [...ports].sort((a, b) => {
        const usageDiff = getUsedCount(nodeId, a.id) - getUsedCount(nodeId, b.id);
        if (usageDiff !== 0) return usageDiff;

        // For horizontal sides (top/bottom), prefer ports closer to the target's horizontal position
        if (a.side === 'top' || a.side === 'bottom') {
          const relFractionX = Math.max(0, Math.min(1, (relCY - (nodeCY - nodeH / 2)) / nodeH));
          return Math.abs(a.fraction - relFractionX) - Math.abs(b.fraction - relFractionX);
        }
        // For vertical sides (left/right), prefer ports closer to the target's vertical position
        const relFractionY = Math.max(0, Math.min(1, (relCY - (nodeCY - nodeH / 2)) / nodeH));
        return Math.abs(a.fraction - relFractionY) - Math.abs(b.fraction - relFractionY);
      });

      return sorted[0];
    };

    const fromPort = selectBestPort(fromPorts, rel.fromId, fromD.w, fromD.h, toCY, fromCY);
    const toPort = selectBestPort(toPorts, rel.toId, toD.w, toD.h, fromCY, toCY);

    markUsed(rel.fromId, fromPort.id);
    markUsed(rel.toId, toPort.id);

    portMap.set(rel.id, { fromPort, toPort });
  });

  return portMap;
}

// --- Network Graph Component (Hierarchical Tier-Column Layout with Port-Based Edge Routing) ---
function NetworkGraph({ nodes, relations }: { nodes: ERDNode[]; relations: ERDRelation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const didDragRef = useRef(false); // Track if a drag occurred — suppress click exit if so
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  const CFG = LAYOUT_CONFIG;

  // Wheel zoom (non-passive to allow preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom(prev => Math.max(0.25, Math.min(2.5, Math.round((prev + delta) * 100) / 100)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Build adjacency map
  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    nodes.forEach(n => adj.set(n.id, new Set()));
    relations.forEach(r => {
      adj.get(r.fromId)?.add(r.toId);
      adj.get(r.toId)?.add(r.fromId);
    });
    return adj;
  }, [nodes, relations]);

  // Compute node dimensions
  const nodeDims = useMemo(() => {
    const dims = new Map<string, { w: number; h: number; expanded: boolean }>();
    nodes.forEach(n => {
      const isExpanded = expandedNodeIds.has(n.id);
      if (isExpanded) {
        let rows = 2;
        if (n.outputs.length > 0) rows += 1;
        if (n.inputs.length > 0) rows += 1;
        rows += 1;
        dims.set(n.id, { w: CFG.expandedWidth, h: CFG.headerHeight + rows * CFG.rowHeight + CFG.nodePadding * 2, expanded: true });
      } else {
        dims.set(n.id, { w: CFG.collapsedWidth, h: CFG.collapsedHeight, expanded: false });
      }
    });
    return dims;
  }, [nodes, expandedNodeIds, CFG]);

  // Compute positions by tier columns with collision-free spacing
  const nodePositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const tierGroups = new Map<number, ERDNode[]>();
    nodes.forEach(n => {
      if (!tierGroups.has(n.tier)) tierGroups.set(n.tier, []);
      tierGroups.get(n.tier)!.push(n);
    });

    const sortedTiers = Array.from(tierGroups.entries()).sort((a, b) => a[0] - b[0]);

    // Phase 1: Assign initial positions by tier column
    sortedTiers.forEach(([, tierNodes], colIdx) => {
      let yOffset = CFG.canvasPadY;
      tierNodes.forEach(n => {
        const d = nodeDims.get(n.id);
        const h = d?.h ?? CFG.collapsedHeight;
        const isExpanded = d?.expanded ?? false;
        // Use expanded gap for expanded nodes, with minimum spacing enforced
        const baseGap = isExpanded ? CFG.rowGapExpanded : CFG.rowGapCollapsed;
        const effectiveGap = Math.max(baseGap, CFG.minNodeSpacing);

        positions.set(n.id, { x: CFG.canvasPadX + colIdx * CFG.columnGap, y: yOffset });
        yOffset += h + effectiveGap;
      });
    });

    // Phase 2: Collision detection post-pass — ensure no two nodes overlap
    // Check all node pairs and push apart if bounding boxes intersect or are too close
    const allNodeIds = nodes.map(n => n.id);
    let iterations = 0;
    const MAX_ITERATIONS = 5; // Converge quickly — layout is mostly correct from Phase 1

    while (iterations < MAX_ITERATIONS) {
      let hasCollision = false;

      for (let i = 0; i < allNodeIds.length; i++) {
        for (let j = i + 1; j < allNodeIds.length; j++) {
          const idA = allNodeIds[i];
          const idB = allNodeIds[j];
          const posA = positions.get(idA);
          const posB = positions.get(idB);
          const dimA = nodeDims.get(idA);
          const dimB = nodeDims.get(idB);
          if (!posA || !posB || !dimA || !dimB) continue;

          // Bounding boxes with minimum spacing buffer
          const buffer = CFG.minNodeSpacing / 2;
          const aLeft = posA.x - buffer;
          const aRight = posA.x + dimA.w + buffer;
          const aTop = posA.y - buffer;
          const aBottom = posA.y + dimA.h + buffer;

          const bLeft = posB.x - buffer;
          const bRight = posB.x + dimB.w + buffer;
          const bTop = posB.y - buffer;
          const bBottom = posB.y + dimB.h + buffer;

          // Check for overlap (AABB intersection)
          if (aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop) {
            hasCollision = true;

            // Determine push direction — prefer vertical push for same-column, horizontal for cross-column
            const overlapX = Math.min(aRight - bLeft, bRight - aLeft);
            const overlapY = Math.min(aBottom - bTop, bBottom - aTop);

            if (overlapY <= overlapX) {
              // Push vertically — move B down (preserve column order)
              const push = overlapY + CFG.minNodeSpacing / 2;
              posB.y += push;
            } else {
              // Push horizontally — move B right
              const push = overlapX + CFG.minNodeSpacing / 2;
              posB.x += push;
            }
          }
        }
      }

      if (!hasCollision) break;
      iterations++;
    }

    return positions;
  }, [nodes, nodeDims, CFG]);

  // Assign ports to each relation (edge)
  const portAssignments = useMemo(() => {
    return assignPorts(relations, nodePositions, nodeDims);
  }, [relations, nodePositions, nodeDims]);

  // SVG content size
  const svgSize = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    nodePositions.forEach((pos, id) => {
      const d = nodeDims.get(id);
      if (pos.x + (d?.w ?? CFG.collapsedWidth) > maxX) maxX = pos.x + (d?.w ?? CFG.collapsedWidth);
      if (pos.y + (d?.h ?? CFG.collapsedHeight) > maxY) maxY = pos.y + (d?.h ?? CFG.collapsedHeight);
    });
    return { width: Math.max(400, maxX + CFG.canvasPadX), height: Math.max(250, maxY + CFG.canvasPadY) };
  }, [nodePositions, nodeDims, CFG]);

  // Nodes connected to the focused node (for dimming)
  const focusSet = useMemo(() => {
    const set = new Set<string>();
    if (focusedNodeId) {
      set.add(focusedNodeId);
      adjacency.get(focusedNodeId)?.forEach(id => set.add(id));
    }
    return set;
  }, [focusedNodeId, adjacency]);

  const hasFocus = focusSet.size > 0;

  // Click node: expand self + neighbors, collapse others
  const handleClickNode = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (expandedNodeIds.has(id) && focusedNodeId === id) {
      // Clicking same focused node: collapse all
      setExpandedNodeIds(new Set());
      setFocusedNodeId(null);
    } else {
      const next = new Set<string>();
      next.add(id);
      adjacency.get(id)?.forEach(neighborId => next.add(neighborId));
      setExpandedNodeIds(next);
      setFocusedNodeId(id);
    }
  }, [adjacency, expandedNodeIds, focusedNodeId]);

  const handleClickBg = useCallback(() => {
    setExpandedNodeIds(new Set());
    setFocusedNodeId(null);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as Element;
    if (target.closest('.ng-node') || target.closest('.ng-rel')) return;
    didDragRef.current = false; // Reset drag flag at the start of each interaction
    setIsPanning(true);
    panStartRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = (e.clientX - panStartRef.current.mx) / zoom;
    const dy = (e.clientY - panStartRef.current.my) / zoom;
    // Mark as drag if mouse moved beyond a small threshold (distinguish from click)
    if (Math.abs(e.clientX - panStartRef.current.mx) > 3 || Math.abs(e.clientY - panStartRef.current.my) > 3) {
      didDragRef.current = true;
    }
    setPan({ x: panStartRef.current.px + dx, y: panStartRef.current.py + dy });
  }, [isPanning, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  // Don't reset didDragRef here — the click event fires after mouseup,
    // so we need the flag to persist until the click handler reads it.
  }, []);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Category label (short form)
  const catLabel = (type: ERDNode['type']) => {
    const m: Record<string, string> = { extractor: 'EXT', factory: 'FAC', power: 'PWR', storage: 'STO', hub: 'HUB' };
    return m[type] ?? type;
  };

  // Tier column labels for visual reference
  const tierColumns = useMemo(() => {
    const cols = new Map<number, { x: number; label: string; color: string }>();
    const tierGroups = new Map<number, ERDNode[]>();
    nodes.forEach(n => {
      if (!tierGroups.has(n.tier)) tierGroups.set(n.tier, []);
      tierGroups.get(n.tier)!.push(n);
    });
    const sorted = Array.from(tierGroups.entries()).sort((a, b) => a[0] - b[0]);
    sorted.forEach(([, tierNodes], colIdx) => {
      if (tierNodes.length > 0) {
        const x = CFG.canvasPadX + colIdx * CFG.columnGap;
        const tc = TIER_COLORS[tierNodes[0].tier] ?? TIER_COLORS[0];
        cols.set(tierNodes[0].tier, { x, label: tc.label, color: tc.stroke });
      }
    });
    return cols;
  }, [nodes, CFG]);

  // Compute edge paths with port-based routing
  const edgePaths = useMemo(() => {
    const paths: {
      relId: string;
      fromId: string;
      toId: string;
      x1: number; y1: number;
      x2: number; y2: number;
      cx1: number; cy1: number;
      cx2: number; cy2: number;
      fromPortId: string;
      toPortId: string;
    }[] = [];

    relations.forEach(rel => {
      const fromPos = nodePositions.get(rel.fromId);
      const toPos = nodePositions.get(rel.toId);
      const fromD = nodeDims.get(rel.fromId);
      const toD = nodeDims.get(rel.toId);
      const assignment = portAssignments.get(rel.id);

      if (!fromPos || !toPos || !fromD || !toD || !assignment) return;

      // Get port anchor positions in absolute SVG coordinates
      const fromPortXY = getPortXY(assignment.fromPort, fromD.w, fromD.h);
      const toPortXY = getPortXY(assignment.toPort, toD.w, toD.h);

      const x1 = fromPos.x + fromPortXY.x;
      const y1 = fromPos.y + fromPortXY.y;
      const x2 = toPos.x + toPortXY.x;
      const y2 = toPos.y + toPortXY.y;

      // Compute intelligent Bezier control points based on port sides
      const fromSide = assignment.fromPort.side;
      const toSide = assignment.toPort.side;

      const EDGE_LEAD = 40; // How far the curve leads out from the port before bending

      let cx1: number, cy1: number, cx2: number, cy2: number;

      // Control point 1 extends from the source port's side
      switch (fromSide) {
        case 'right': cx1 = x1 + EDGE_LEAD; cy1 = y1; break;
        case 'left': cx1 = x1 - EDGE_LEAD; cy1 = y1; break;
        case 'top': cx1 = x1; cy1 = y1 - EDGE_LEAD; break;
        case 'bottom': cx1 = x1; cy1 = y1 + EDGE_LEAD; break;
      }

      // Control point 2 extends from the target port's side
      switch (toSide) {
        case 'right': cx2 = x2 + EDGE_LEAD; cy2 = y2; break;
        case 'left': cx2 = x2 - EDGE_LEAD; cy2 = y2; break;
        case 'top': cx2 = x2; cy2 = y2 - EDGE_LEAD; break;
        case 'bottom': cx2 = x2; cy2 = y2 + EDGE_LEAD; break;
      }

      paths.push({
        relId: rel.id, fromId: rel.fromId, toId: rel.toId,
        x1, y1, x2, y2, cx1, cy1, cx2, cy2,
        fromPortId: assignment.fromPort.id,
        toPortId: assignment.toPort.id,
      });
    });

    return paths;
  }, [relations, nodePositions, nodeDims, portAssignments]);

  return (
    <div
      ref={containerRef}
      className="bg-[#060a12] rounded-lg overflow-hidden relative border border-muted-label/40 w-full"
      style={{ aspectRatio: '1 / 1', maxHeight: '560px' }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          className="w-7 h-7 rounded-md bg-muted-label/90 hover:bg-muted-label text-subtle hover:text-subtle flex items-center justify-center border border-muted-label/50 transition-colors"
          onClick={() => setZoom(z => Math.min(2.5, Math.round((z + 0.15) * 100) / 100))}
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          className="w-7 h-7 rounded-md bg-muted-label/90 hover:bg-muted-label text-subtle hover:text-subtle flex items-center justify-center border border-muted-label/50 transition-colors"
          onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.15) * 100) / 100))}
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          className="w-7 h-7 rounded-md bg-muted-label/90 hover:bg-muted-label text-subtle hover:text-subtle flex items-center justify-center border border-muted-label/50 transition-colors"
          onClick={handleResetView}
          title="Reset View"
        >
          <Maximize2 className="w-3 h-3" />
        </button>
      </div>

      {/* Zoom Level Indicator */}
      <div className="absolute bottom-2 right-2 z-10 text-[9px] text-muted-label bg-muted-label/80 px-1.5 py-0.5 rounded font-mono">
        {Math.round(zoom * 100)}%
      </div>

      {/* Legend */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        {Array.from(tierColumns.values()).map(col => (
          <div key={col.label} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col.color }} />
            <span className="text-[8px] text-muted-label font-medium">{col.label}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        className="w-full h-full overflow-hidden"
        data-game-interactive
        style={{ cursor: isPanning ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onClick={(e) => {
          // If user was dragging (panning), don't exit focus — only a clean click should deactivate
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          const target = e.target as Element;
          if (!target.closest('.ng-node') && !target.closest('.ng-rel')) {
            handleClickBg();
          }
        }}
      >
        <svg
          width={svgSize.width}
          height={svgSize.height}
          style={{
            transform: `translate(${pan.x * zoom}px, ${pan.y * zoom}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isPanning ? 'none' : 'transform 0.18s ease-out',
            minWidth: svgSize.width,
          }}
        >
          {/* Defs */}
          <defs>
            <pattern id="ng-grid" width={CFG.columnGap} height={40} patternUnits="userSpaceOnUse">
              <path d={`M ${CFG.columnGap} 0 L 0 0 0 40`} fill="none" stroke="#111827" strokeWidth={0.5} />
            </pattern>
            <marker id="ng-arr" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#4b5563" />
            </marker>
            <marker id="ng-arr-act" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#2dd4bf" />
            </marker>
            <marker id="ng-arr-hl" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
              <polygon points="0 0, 6 2, 0 4" fill="#fbbf24" />
            </marker>
            {/* Port dot filter — subtle glow */}
            <filter id="port-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background grid */}
          <rect width="100%" height="100%" fill="url(#ng-grid)" opacity={0.4} />

          {/* Tier column labels */}
          {Array.from(tierColumns.entries()).map(([, col]) => (
            <text
              key={col.label}
              x={col.x + 2}
              y={10}
              fontSize="7"
              fill={col.color}
              opacity={0.3}
              fontWeight="600"
              letterSpacing="1"
            >
              {col.label}
            </text>
          ))}

          {/* Relations — only visible when a node is focused/clicked */}
          <g className="relations-layer">
            {relations.map(rel => {
              // Only show relations connected to the focused node
              const isConnected = focusedNodeId === rel.fromId || focusedNodeId === rel.toId;
              if (!isConnected) return null;

              const edge = edgePaths.find(p => p.relId === rel.id);
              if (!edge) return null;

              const isActive = rel.active;
              const lineColor = isActive ? '#fbbf24' : '#2a3040';
              const arrowUrl = isActive ? 'url(#ng-arr-hl)' : 'url(#ng-arr)';

              const pathD = `M ${edge.x1} ${edge.y1} C ${edge.cx1} ${edge.cy1}, ${edge.cx2} ${edge.cy2}, ${edge.x2} ${edge.y2}`;

              // Midpoint on the Bezier (approximate at t=0.5)
              const mx = 0.125 * edge.x1 + 0.375 * edge.cx1 + 0.375 * edge.cx2 + 0.125 * edge.x2;
              const my = 0.125 * edge.y1 + 0.375 * edge.cy1 + 0.375 * edge.cy2 + 0.125 * edge.y2;

              const resEmojis = rel.resources.slice(0, 2).map(r => RESOURCE_META[r.resource]?.icon ?? '').join('');
              const moreN = rel.resources.length > 2 ? rel.resources.length - 2 : 0;

              return (
                <g
                  key={rel.id}
                  className="ng-rel"
                  opacity={1}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Hit area (wider invisible path for easier hover) */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                  />
                  {/* Visible path — port-based routing */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth={isActive ? 2 : rel.lineCount > 1 ? 0.8 + rel.lineCount * 0.3 : 0.8}
                    markerEnd={arrowUrl}
                    strokeDasharray={!isActive ? '3 2' : undefined}
                  />
                  {/* Port anchor dots — small circles at source and target ports */}
                  <circle cx={edge.x1} cy={edge.y1} r={2} fill={lineColor} opacity={isActive ? 0.7 : 0.3} />
                  <circle cx={edge.x2} cy={edge.y2} r={2} fill={lineColor} opacity={isActive ? 0.7 : 0.3} />
                  {/* Throughput badge */}
                  <g>
                    <rect
                      x={mx - 24} y={my - 7}
                      width={48} height={13}
                      rx={3}
                      fill="#060a12"
                      fillOpacity={0.95}
                      stroke={lineColor}
                      strokeWidth={0.4}
                      strokeOpacity={0.5}
                    />
                    <text
                      x={mx} y={my + 2}
                      textAnchor="middle"
                      fontSize="6.5"
                      fill={isActive ? '#fbbf24' : '#64748b'}
                      fontWeight={isActive ? '600' : '400'}
                    >
                      {resEmojis}{moreN > 0 ? `+${moreN}` : ''} {formatNumber(rel.totalThroughput)}/s
                    </text>
                  </g>
                  {/* Line count badge */}
                  {rel.lineCount > 1 && (
                    <g>
                      <circle cx={mx} cy={my - 13} r={5} fill="#060a12" stroke={lineColor} strokeWidth={0.4} />
                      <text x={mx} y={my - 10.5} textAnchor="middle" fontSize="6" fill={lineColor} fontWeight="bold">
                        ×{rel.lineCount}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* Nodes — sorted so focused node renders last (highest z-index) */}
          <g className="nodes-layer">
            {[...nodes]
              .sort((a, b) => {
                if (a.id === focusedNodeId) return 1;
                if (b.id === focusedNodeId) return -1;
                const aInFocus = focusSet.has(a.id);
                const bInFocus = focusSet.has(b.id);
                if (aInFocus && !bInFocus) return 1;
                if (!aInFocus && bInFocus) return -1;
                return 0;
              })
              .map(node => {
              const pos = nodePositions.get(node.id);
              if (!pos) return null;
              const d = nodeDims.get(node.id);
              const isExpanded = d?.expanded ?? false;
              const w = d?.w ?? CFG.collapsedWidth;
              const h = d?.h ?? CFG.collapsedHeight;
              const tc = TIER_COLORS[node.tier] ?? TIER_COLORS[0];

              const isInFocus = hasFocus && focusSet.has(node.id);
              const isDim = hasFocus && !isInFocus;
              const isFocused = focusedNodeId === node.id;

              // Get ports used by visible relations for this node
              const activePortIds = new Set<string>();
              if (isInFocus) {
                edgePaths.forEach(ep => {
                  if (ep.fromId === node.id) activePortIds.add(ep.fromPortId);
                  if (ep.toId === node.id) activePortIds.add(ep.toPortId);
                });
              }

              return (
                <g
                  key={node.id}
                  className="ng-node"
                  style={{
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                    cursor: 'pointer',
                    opacity: isDim ? 0.15 : 1,
                    pointerEvents: isDim ? 'none' : 'auto',
                  }}
                  onClick={(e) => handleClickNode(node.id, e)}
                >
                  {/* Invisible hit area — extends clickable region beyond visible bounds */}
                  <rect
                    x={-CFG.minNodeSpacing / 2}
                    y={-CFG.minNodeSpacing / 2}
                    width={w + CFG.minNodeSpacing}
                    height={h + CFG.minNodeSpacing}
                    fill="transparent"
                    style={{ pointerEvents: 'all' }}
                  />
                  {/* Focus ring — enhanced with glow for focused node */}
                  {isFocused && (
                    <>
                      <rect x={-4} y={-4} width={w + 8} height={h + 8} rx={6}
                        fill="none" stroke={tc.stroke} strokeWidth={1.5} opacity={0.2}
                        style={{ filter: `drop-shadow(0 0 6px ${tc.stroke})` }}
                      />
                      <rect x={-2} y={-2} width={w + 4} height={h + 4} rx={5}
                        fill="none" stroke={tc.stroke} strokeWidth={1} opacity={0.5}
                      />
                    </>
                  )}
                  {/* Neighbor highlight ring */}
                  {isInFocus && !isFocused && (
                    <rect x={-1} y={-1} width={w + 2} height={h + 2} rx={4}
                      fill="none" stroke={tc.stroke} strokeWidth={0.5} opacity={0.25}
                    />
                  )}
                  {/* Node body */}
                  <rect
                    x={0} y={0} width={w} height={h} rx={3}
                    fill={isFocused ? '#0f1729' : '#0c1220'}
                    stroke={isInFocus ? tc.stroke : '#1a2030'}
                    strokeWidth={isInFocus ? (isFocused ? 1.5 : 1) : 0.5}
                    style={{ pointerEvents: 'all' }}
                  />
                  {/* Tier accent bar */}
                  <rect x={0} y={0} width={2.5} height={h} rx={1} fill={tc.stroke} opacity={0.65}
                    style={{ pointerEvents: 'none' }}
                  />

                  {/* Port anchor indicators — visible when node is in focus */}
                  {isInFocus && PORT_DEFS.map(port => {
                    const pxy = getPortXY(port, w, h);
                    const isActivePort = activePortIds.has(port.id);
                    return (
                      <g key={port.id}>
                        {/* Active port — solid dot with glow */}
                        {isActivePort && (
                          <circle
                            cx={pxy.x} cy={pxy.y} r={2.5}
                            fill={tc.stroke}
                            opacity={0.8}
                            style={{ pointerEvents: 'none', filter: isActivePort ? 'url(#port-glow)' : undefined }}
                          />
                        )}
                        {/* Inactive port — subtle hollow dot */}
                        {!isActivePort && (
                          <circle
                            cx={pxy.x} cy={pxy.y} r={1.5}
                            fill="none"
                            stroke={tc.stroke}
                            strokeWidth={0.5}
                            opacity={0.15}
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                      </g>
                    );
                  })}

                  {isExpanded ? (
                    /* ===== EXPANDED VIEW ===== */
                    <g style={{ pointerEvents: 'none' }}>
                      <rect x={2.5} y={0} width={w - 2.5} height={CFG.headerHeight} rx={0} fill={tc.fill} opacity={0.5} />
                      <rect x={2.5} y={CFG.headerHeight - 2} width={w - 2.5} height={2} fill={tc.fill} opacity={0.5} />
                      <text x={7} y={CFG.headerHeight - 5} fontSize="8" fontWeight="bold" fill="white">
                        {node.label.length > 17 ? node.label.slice(0, 16) + '…' : node.label}
                      </text>
                      <text x={w - 8} y={CFG.headerHeight - 5} fontSize="6" fill="#6b7280">▼</text>
                      <line x1={2.5} y1={CFG.headerHeight} x2={w} y2={CFG.headerHeight} stroke="#1e293b" strokeWidth={0.5} />
                      {(() => {
                        const rows: { label: string; value: string; color?: string }[] = [
                          { label: 'Type', value: catLabel(node.type) },
                          { label: 'Tier', value: tc.label, color: tc.stroke },
                        ];
                        if (node.outputs.length > 0) {
                          rows.push({ label: 'OUT', value: node.outputs.slice(0, 3).map(r => RESOURCE_META[r as ResourceType]?.icon ?? r).join(' ') + (node.outputs.length > 3 ? ' …' : '') });
                        }
                        if (node.inputs.length > 0) {
                          rows.push({ label: 'IN', value: node.inputs.slice(0, 3).map(r => RESOURCE_META[r as ResourceType]?.icon ?? r).join(' ') + (node.inputs.length > 3 ? ' …' : '') });
                        }
                        const statusIcon = node.active ? '●' : '○';
                        rows.push({ label: `Lv${node.level}`, value: `${statusIcon} ${node.active ? 'ON' : 'OFF'}`, color: node.active ? '#4ade80' : '#6b7280' });
                        return rows.map((row, idx) => (
                          <g key={idx} style={{ opacity: 1 }}>
                            <text x={7} y={CFG.headerHeight + CFG.nodePadding + idx * CFG.rowHeight + CFG.rowHeight - 2} fontSize="6.5" fill="#4b5563" fontWeight="500">
                              {row.label}
                            </text>
                            <text x={30} y={CFG.headerHeight + CFG.nodePadding + idx * CFG.rowHeight + CFG.rowHeight - 2} fontSize="6.5" fill={row.color ?? '#c9d1d9'}>
                              {row.value}
                            </text>
                          </g>
                        ));
                      })()}
                    </g>
                  ) : (
                    /* ===== COLLAPSED VIEW ===== */
                    <g style={{ pointerEvents: 'none' }}>
                      <text x={7} y={h / 2 + 3} fontSize="7.5" fontWeight="600" fill="#d1d5db">
                        {node.label.length > 11 ? node.label.slice(0, 10) + '…' : node.label}
                      </text>
                      <text x={w - 8} y={h / 2 + 2} fontSize="5" fill="#3b4252">►</text>
                      {node.active && (
                        <circle cx={w - 4} cy={4} r={2} fill="#4ade80" opacity={0.6} />
                      )}
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

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
    const tiers: { tier: number; label: string; buildings: { id: string; name: string; icon: string; connected: boolean }[] }[] = [];
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
          icon: def?.icon ?? '',
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
          const buildingSnapshot = store.productionSnapshot.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
          const totalOutput = buildingSnapshot.outputs.reduce((sum, o) => sum + o.amount, 0);
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
        const buildingSnapshot = store.productionSnapshot.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
        def.inputs.forEach(input => {
          if (input.resource === 'money') return;
          const res = input.resource as ResourceType;
          const inLines = store.transportLines.filter(l => l.toBuilding === b.id && l.carriesResource === res && l.active);
          const totalInboundRate = inLines.reduce((s, l) => s + l.throughput, 0);
          // Use snapshot input rate (includes all multipliers: efficiency, research, events)
          const consumptionRate = buildingSnapshot.inputs.find(i => i.resource === res)?.amount ?? input.amount * b.level;

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
              reason: `Under-supplied ${RESOURCE_META[res]?.name ?? res}: ${totalInboundRate.toFixed(1)}/${consumptionRate.toFixed(1)}/s`,
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
        const buildingSnapshot = store.productionSnapshot.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
        def.outputs.forEach(output => {
          if (output.resource === 'money') return;
          const res = output.resource as ResourceType;
          // Use snapshot output rate (includes all multipliers: efficiency, research, events)
          const productionRate = buildingSnapshot.outputs.find(o => o.resource === res)?.amount ?? output.amount * b.level;
          const outLines = store.transportLines.filter(l => l.fromBuilding === b.id && l.carriesResource === res && l.active);
          const totalOutboundCapacity = outLines.reduce((s, l) => s + l.maxThroughput, 0);
          const totalOutboundThroughput = outLines.reduce((s, l) => s + l.throughput, 0);

          if (outLines.length > 0 && totalOutboundCapacity > productionRate * 2 && totalOutboundThroughput < productionRate * 0.5) {
            issues.push({
              building: b,
              reason: `Over-supplied ${RESOURCE_META[res]?.name ?? res}: producing ${productionRate.toFixed(1)}/s but only ${totalOutboundThroughput.toFixed(1)}/s consumed`,
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
    const flowMap = new Map<ResourceType, { production: number; consumption: number; surplus: number; name: string; icon: string; tier: number; color: string }>();

    // Calculate production rates from producing buildings — use snapshot data
    producingBuildings.forEach(b => {
      const buildingSnapshot = store.productionSnapshot.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
      buildingSnapshot.outputs.forEach(o => {
        if (o.resource === 'money') return;
        const res = o.resource as ResourceType;
        const existing = flowMap.get(res) ?? { production: 0, consumption: 0, surplus: 0, name: RESOURCE_META[res]?.name ?? res, icon: RESOURCE_META[res]?.icon ?? '', tier: RESOURCE_META[res]?.tier ?? 0, color: RESOURCE_META[res]?.color ?? '#888' };
        existing.production += o.amount;
        flowMap.set(res, existing);
      });
    });

    // Calculate consumption rates from consuming buildings — use snapshot data
    consumingBuildings.forEach(b => {
      const buildingSnapshot = store.productionSnapshot.buildings[b.id] ?? { outputs: [], inputs: [], efficiency: 0 };
      buildingSnapshot.inputs.forEach(i => {
        if (i.resource === 'money') return;
        const res = i.resource as ResourceType;
        const existing = flowMap.get(res) ?? { production: 0, consumption: 0, surplus: 0, name: RESOURCE_META[res]?.name ?? res, icon: RESOURCE_META[res]?.icon ?? '', tier: RESOURCE_META[res]?.tier ?? 0, color: RESOURCE_META[res]?.color ?? '#888' };
        existing.consumption += i.amount;
        flowMap.set(res, existing);
      });
    });

    flowMap.forEach(v => { v.surplus = v.production - v.consumption; });
    return Array.from(flowMap.entries())
      .map(([resource, data]) => ({ resource, ...data }))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  }, [producingBuildings, consumingBuildings, store.productionSnapshot.buildings]);

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

  // --- ERD Nodes (auto-generate from buildings connected to transport) ---
  const erdNodes = useMemo(() => {
    const connectedIds = new Set<string>();
    store.transportLines.forEach(l => {
      connectedIds.add(l.fromBuilding);
      connectedIds.add(l.toBuilding);
    });

    return store.buildings
      .filter(b => connectedIds.has(b.id))
      .map(b => {
        const def = BUILDING_DEFS[b.type];
        if (!def) return null;
        const nodeType: ERDNode['type'] = (def.category === 'extractor' || def.category === 'factory' || def.category === 'power' || def.category === 'storage')
          ? def.category
          : 'hub';
        return {
          id: b.id,
          type: nodeType,
          label: def.name,
          buildingType: b.type,
          tier: getBuildingTier(b),
          icon: def.icon,
          inputs: def.inputs?.filter(i => i.resource !== 'money').map(i => i.resource as string) ?? [],
          outputs: def.outputs?.filter(o => o.resource !== 'money').map(o => o.resource as string) ?? [],
          active: b.active,
          level: b.level,
        } as ERDNode;
      })
      .filter(Boolean) as ERDNode[];
  }, [store.buildings, store.transportLines]);

  // --- ERD Relations (auto-generate from transport lines, grouped by from->to) ---
  const erdRelations = useMemo(() => {
    const relMap = new Map<string, ERDRelation>();

    store.transportLines.forEach(line => {
      const key = `${line.fromBuilding}->${line.toBuilding}`;
      if (!relMap.has(key)) {
        relMap.set(key, {
          id: key,
          fromId: line.fromBuilding,
          toId: line.toBuilding,
          resources: [],
          totalThroughput: 0,
          active: false,
          lineCount: 0,
        });
      }
      const rel = relMap.get(key)!;
      rel.lineCount += 1;
      rel.totalThroughput += line.throughput;
      if (line.active) rel.active = true;

      const existingRes = rel.resources.find(r => r.resource === line.carriesResource);
      if (existingRes) {
        existingRes.throughput += line.throughput;
        existingRes.maxThroughput += line.maxThroughput;
      } else {
        rel.resources.push({ resource: line.carriesResource, throughput: line.throughput, maxThroughput: line.maxThroughput });
      }
    });

    return Array.from(relMap.values());
  }, [store.transportLines]);

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
  const healthTextColor = networkHealth.score >= 80 ? 'text-success' : networkHealth.score >= 50 ? 'text-warning' : 'text-danger';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-brand tracking-wide neon-glow-cyan">
            Transport & Logistics
          </h2>
          <p className="text-xs text-muted-label mt-0.5">Manage supply chains and logistics networks</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Weather Indicator */}
          <Badge variant="outline" className="border-amber-800/50 text-warning bg-amber-900/10 text-[10px]">
            <GameIcon icon={weatherDef.icon} size={14} className="inline-flex mr-1" />
            {weatherDef.name}
          </Badge>
          <Badge variant="outline" className="border-brand/50 text-brand bg-brand/10 text-xs">
            <Route className="w-3 h-3 mr-1" />
            {store.transportLines.length} lines
          </Badge>
          <Badge variant="outline" className="border-brand/50 text-brand bg-brand/10 text-xs">
            <Gauge className="w-3 h-3 mr-1" />
            {formatNumber(totalThroughput)} u/s
          </Badge>
        </div>
      </div>

      {/* Network Health Gauge + Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {/* Network Health - Large gauge */}
        <div className="game-card rounded-xl bg-card p-3 border border-brand/30 col-span-2 sm:col-span-1 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 50% 50%, #22d3ee, transparent 70%)' }} />
          <div className="relative z-10 flex flex-col items-center">
            <div className="text-[10px] text-muted-label mb-1">Network Health</div>
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
        <PanelStatCard
          icon={<Route className="w-4 h-4" />}
          label="Active Lines"
          value={`${activeLines.length}/${store.transportLines.length}`}
          subtext="Transport routes"
          color="cyan"
          trend={activeLines.length > 0 ? 'up' : 'neutral'}
        />
        <PanelStatCard
          icon={<Gauge className="w-4 h-4" />}
          label="Throughput"
          value={formatNumber(totalThroughput)}
          subtext={`Max: ${formatNumber(totalMaxThroughput)}`}
          color="teal"
          trend={totalThroughput > 0 ? 'up' : 'neutral'}
        />
        <PanelStatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Bottlenecks"
          value={bottlenecks.length.toString()}
          subtext={bottlenecks.length === 0 ? 'All clear' : 'Issues found'}
          color={bottlenecks.length > 0 ? 'red' : 'green'}
          trend={bottlenecks.length > 0 ? 'down' : 'neutral'}
        />
      </div>

      {/* Network Graph — Full Width */}
      <div className="game-card rounded-xl bg-card p-4 border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-brand">Network Graph</h3>
          <span className="text-[10px] text-muted-label ml-auto">
            {erdNodes.length} nodes · {erdRelations.length} edges · click node to reveal connections · scroll to zoom · drag to pan
          </span>
        </div>
        {store.transportLines.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-muted-label rounded-lg">
            <Database className="w-10 h-10 text-dim mx-auto mb-2" />
            <p className="text-xs text-muted-label">No network connections yet</p>
            <p className="text-[10px] text-muted-label mt-1">Build transport lines to see the auto-generated network</p>
          </div>
        ) : (
          <NetworkGraph nodes={erdNodes} relations={erdRelations} />
        )}
      </div>

      {/* Weather & Production Chain — Below Graph */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Weather Effects */}
        <div className="game-card rounded-xl bg-card p-4 border border-amber-900/30">
          <div className="flex items-center gap-2 mb-3">
            <Cloud className="w-4 h-4 text-warning" />
            <h3 className="text-sm font-semibold text-warning">Weather Effects</h3>
          </div>
          <div className="bg-[#0a0e17] rounded-lg p-3 border border-amber-900/20">
            <div className="flex items-center gap-2 mb-2">
              <GameIcon icon={weatherDef.icon} size={24} />
              <div>
                <div className="text-xs text-subtle font-medium">{weatherDef.name}</div>
                <div className="text-[10px] text-muted-label">Intensity: {(store.weather.intensity * 100).toFixed(0)}%</div>
              </div>
            </div>
            <p className="text-[10px] text-subtle mb-2">{weatherDef.description}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[9px] text-muted-label">Production</div>
                <div className={`text-[11px] font-mono font-bold ${weatherDef.productionMultiplier >= 1 ? 'text-success' : weatherDef.productionMultiplier > 0.85 ? 'text-warning' : 'text-danger'}`}>
                  {(weatherDef.productionMultiplier * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-[9px] text-muted-label">Solar</div>
                <div className={`text-[11px] font-mono font-bold ${weatherDef.solarMultiplier >= 1 ? 'text-success' : weatherDef.solarMultiplier > 0.5 ? 'text-warning' : 'text-danger'}`}>
                  {(weatherDef.solarMultiplier * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-[9px] text-muted-label">Wind</div>
                <div className={`text-[11px] font-mono font-bold ${weatherDef.windMultiplier >= 1 ? 'text-success' : weatherDef.windMultiplier > 0.5 ? 'text-warning' : 'text-danger'}`}>
                  {(weatherDef.windMultiplier * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            {store.weather.current !== 'clear' && (
              <div className="mt-2 text-[10px] text-muted-label">
                Changes in {store.weather.remaining} ticks
              </div>
            )}
          </div>
        </div>

        {/* Production Chain Overview */}
        <div className="game-card rounded-xl bg-card p-4 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-semibold text-brand">Production Chain</h3>
            <span className="text-[10px] text-muted-label ml-auto">{productionChain.completeness.toFixed(0)}% connected</span>
          </div>
          {/* Completeness bar */}
          <div className="h-2 bg-muted-label rounded-full overflow-hidden mb-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-700 to-cyan-400 transition-all duration-700"
              style={{ width: `${Math.min(100, productionChain.completeness)}%` }}
            />
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto game-scrollbar">
            {productionChain.tiers.map(tier => {
              const tc = TIER_COLORS[tier.tier] ?? TIER_COLORS[0];
              return (
                <div key={tier.tier} className="bg-[#0a0e17] rounded-lg p-2 border border-muted-label/50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className={`text-[9px] px-1.5 ${tc.text} border-current`}>
                      {tc.label}
                    </Badge>
                    <span className="text-[10px] text-subtle">{tier.buildings.filter(b => b.connected).length}/{tier.buildings.length} connected</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {tier.buildings.map(b => (
                      <div key={b.id} className="flex items-center gap-1 text-[10px]">
                        {b.connected ? (
                          <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                        ) : (
                          <XCircle className="w-3 h-3 text-danger flex-shrink-0" />
                        )}
                        <span className="truncate"><GameIcon icon={b.icon} size={14} className="inline-flex" /> {b.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Layout: 2/3 left + 1/3 right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-2 space-y-4">

          {/* Smart Route Builder */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Smart Route Builder</h3>
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
                    icon={def.icon}
                    description={def.description}
                    category="Transport"
                    details={[
                      { label: 'Throughput', value: `${def.baseThroughput.toFixed(1)} u/s`, color: 'text-brand' },
                      { label: 'Base Cost', value: `$${formatNumber(cost)}`, color: 'text-success' },
                      { label: 'Upgrade x', value: `${def.upgradeMultiplier}`, color: 'text-research' },
                    ]}
                    side="bottom"
                  >
                    <button
                      onClick={() => setSelectedType(type)}
                      className={`p-2 rounded-lg border text-center w-full ${
                        isSelected
                          ? 'border-brand/50 bg-brand/20 text-brand'
                          : 'border-muted-label bg-[#0a0e17] text-subtle hover:border-muted-label'
                      }`}
                    >
                      <GameIcon icon={def.icon} size={20} />
                      <div className="text-[10px] font-medium mt-0.5">{def.name}</div>
                      <div className="text-[9px] text-muted-label">${formatNumber(cost)}</div>
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
                  <label className="text-[10px] text-muted-label mb-1 block">From (Producer)</label>
                  <select
                    value={fromBuilding}
                    onChange={e => handleFromChange(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-muted-label rounded-lg px-2 py-1.5 text-xs text-subtle focus:border-brand/50 focus:outline-none"
                  >
                    <option value="">Select source...</option>
                    {producingBuildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {BUILDING_DEFS[b.type]?.name} Lv.{b.level}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Carries Resource - Filtered by From outputs */}
                <div>
                  <label className="text-[10px] text-muted-label mb-1 block">Carries Resource</label>
                  <select
                    value={carriesResource}
                    onChange={e => { setCarriesResource(e.target.value as ResourceType); setToBuilding(''); }}
                    className="w-full bg-[#0a0e17] border border-muted-label rounded-lg px-2 py-1.5 text-xs text-subtle focus:border-brand/50 focus:outline-none"
                    disabled={!fromBuilding}
                  >
                    {!fromBuilding && <option value="">Select source first...</option>}
                    {fromBuildingOutputs.map(r => (
                      <option key={r} value={r}>
                        {RESOURCE_META[r]?.name}
                      </option>
                    ))}
                  </select>
                </div>
                {/* To Building - Filtered by resource consumers */}
                <div>
                  <label className="text-[10px] text-muted-label mb-1 block">To (Consumer)</label>
                  <select
                    value={toBuilding}
                    onChange={e => setToBuilding(e.target.value)}
                    className="w-full bg-[#0a0e17] border border-muted-label rounded-lg px-2 py-1.5 text-xs text-subtle focus:border-brand/50 focus:outline-none"
                    disabled={!carriesResource}
                  >
                    {!carriesResource && <option value="">Select resource first...</option>}
                    {carriesResource && <option value="">Select destination...</option>}
                    {filteredToBuildings.map(b => (
                      <option key={b.id} value={b.id}>
                        {BUILDING_DEFS[b.type]?.name} Lv.{b.level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Live Preview */}
              {previewData && (
                <div
                  className="bg-[#0a0e17] rounded-lg p-3 border border-brand/30"
                >
                  <div className="text-[10px] text-brand font-semibold mb-2">ROUTE PREVIEW</div>
                  <div className="flex items-center gap-2 mb-2 text-xs">
                    <GameIcon icon={previewData.fromDef?.icon} size={16} />
                    <span className="text-subtle">{previewData.fromDef?.name}</span>
                    <ArrowRight className="w-3 h-3 text-brand" />
                    <GameIcon icon={RESOURCE_META[carriesResource as ResourceType]?.icon} size={16} />
                    <span className="text-subtle">{RESOURCE_META[carriesResource as ResourceType]?.name}</span>
                    <ArrowRight className="w-3 h-3 text-brand" />
                    <GameIcon icon={previewData.toDef?.icon} size={16} />
                    <span className="text-subtle">{previewData.toDef?.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div>
                      <span className="text-muted-label">Est. Throughput</span>
                      <div className="text-brand font-mono font-bold">{previewData.estimatedThroughput.toFixed(1)} u/s</div>
                    </div>
                    <div>
                      <span className="text-muted-label">Cost</span>
                      <div className={`font-mono font-bold ${previewData.canAfford ? 'text-success' : 'text-danger'}`}>${formatNumber(previewData.cost)}</div>
                    </div>
                    <div>
                      <span className="text-muted-label">Transport</span>
                      <div className="text-brand font-mono font-bold"><GameIcon icon={TRANSPORT_DEFS[selectedType].icon} size={14} className="inline-flex" /> {TRANSPORT_DEFS[selectedType].name}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Build Button */}
              <Button
                onClick={handleBuild}
                disabled={!fromBuilding || !toBuilding || !carriesResource || fromBuilding === toBuilding}
                className="w-full bg-brand hover:bg-brand text-white"
                size="sm"
              >
                <Truck className="w-3.5 h-3.5 mr-1.5" />
                Build {TRANSPORT_DEFS[selectedType].name}
              </Button>
            </div>
          </div>

          {/* Active Transport Lines */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Route className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Transport Lines</h3>
              <span className="text-[10px] text-muted-label ml-auto">{store.transportLines.length} total</span>
              <button onClick={() => toggleSection('lines')} className="text-muted-label hover:text-subtle">
                {expandedSections.lines ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
            <>
              {expandedSections.lines && (
                <div>
                  {store.transportLines.length === 0 ? (
                    <div className="text-center py-8">
                      <Truck className="w-10 h-10 text-dim mx-auto mb-2" />
                      <p className="text-xs text-muted-label">No transport lines built yet</p>
                      <p className="text-[10px] text-muted-label mt-1">Connect producers to consumers to optimize production</p>
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
                          <div key={line.id} className={`bg-[#0a0e17] rounded-lg p-3 border ${line.active ? 'border-brand/30 hover:border-brand/50' : 'border-muted-label opacity-60'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-1 bg-muted-label/50 rounded px-1.5 py-0.5 min-w-0">
                                  <GameIcon icon={fromDef?.icon} size={12} />
                                  <span className="text-[10px] text-subtle truncate max-w-[70px]">{fromDef?.name}</span>
                                </div>
                                <div className="flex items-center gap-0.5 flex-shrink-0">
                                  <ArrowRight className="w-3 h-3 text-muted-label" />
                                  <GameIcon icon={RESOURCE_META[line.carriesResource]?.icon} size={12} />
                                  <ArrowRight className="w-3 h-3 text-brand" />
                                </div>
                                <div className="flex items-center gap-1 bg-muted-label/50 rounded px-1.5 py-0.5 min-w-0">
                                  <GameIcon icon={toDef?.icon} size={12} />
                                  <span className="text-[10px] text-subtle truncate max-w-[70px]">{toDef?.name}</span>
                                </div>
                              </div>
                            </div>
                            {/* Throughput bar */}
                            <div className="h-2 bg-muted-label rounded-full overflow-hidden relative mb-2">
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
                                <GameIcon icon={def.icon} size={14} className="inline-flex" />
                                <Badge variant="outline" className="text-[9px] border-muted-label text-subtle px-1">
                                  Lv.{line.level}
                                </Badge>
                                <span className="text-[9px] text-muted-label font-mono">{line.throughput.toFixed(1)}/{line.maxThroughput.toFixed(1)}</span>
                                <button
                                  onClick={() => store.toggleTransportLine(line.id)}
                                  className={`w-5 h-5 rounded-full border text-[10px] flex items-center justify-center ${
                                    line.active ? 'border-success/50 text-success bg-success/20 hover:bg-success/40' : 'border-muted-label text-muted-label hover:bg-muted-label'
                                  }`}
                                  title={line.active ? 'Deactivate' : 'Activate'}
                                >
                                  <Power className="w-3 h-3" />
                                </button>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-2 text-brand hover:text-brand"
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
                </div>
              )}
            </>
          </div>

          {/* Throughput by Type */}
          {throughputByType.length > 0 && (
            <div className="game-card rounded-xl bg-card p-4 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-semibold text-brand">Throughput by Type</h3>
                <button onClick={() => toggleSection('throughput')} className="text-muted-label hover:text-subtle ml-auto">
                  {expandedSections.throughput ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              </div>
              <>
                {expandedSections.throughput && (
                  <div>
                    <div className="space-y-3">
                      {throughputByType.map(({ type, def, count, throughput, capacity, utilization, totalUpgradeCost }) => (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <GameIcon icon={def.icon} size={14} className="inline-flex" />
                              <span className="text-xs text-subtle">{def.name}</span>
                              <span className="text-[10px] text-muted-label">x{count}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-subtle font-mono">{formatNumber(throughput)}/{formatNumber(capacity)} u/s</span>
                              <span className={`text-[10px] font-mono font-bold ${
                                utilization > 80 ? 'text-danger' : utilization > 50 ? 'text-warning' : 'text-success'
                              }`}>
                                {utilization.toFixed(0)}%
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-[9px] px-1.5 text-research hover:text-research"
                                onClick={() => handleUpgradeAllType(type)}
                                disabled={store.money < totalUpgradeCost}
                                title={`Upgrade all ${def.name} lines ($${formatNumber(totalUpgradeCost)})`}
                              >
                                <ChevronUp className="w-2.5 h-2.5 mr-0.5" />
                                All
                              </Button>
                            </div>
                          </div>
                          <div className="h-3 bg-muted-label rounded-full overflow-hidden relative">
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
                      <div className="pt-2 border-t border-muted-label flex items-center justify-between">
                        <span className="text-xs text-subtle font-medium">Total Network</span>
                        <span className="text-xs text-brand font-mono font-bold">{formatNumber(totalThroughput)}/{formatNumber(totalMaxThroughput)} u/s</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            </div>
          )}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="space-y-4">

          {/* Resource Flow Summary */}
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Resource Flow</h3>
            </div>
            {resourceFlow.length === 0 ? (
              <div className="text-center py-4">
                <Package className="w-8 h-8 text-dim mx-auto mb-2" />
                <p className="text-[10px] text-muted-label">No resource flow data yet</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto game-scrollbar">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-2 text-[9px] text-muted-label px-1 pb-1 border-b border-muted-label">
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
                    <div key={r.resource} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-2 text-[10px] items-center px-1 py-0.5 hover:bg-muted-label/30 rounded">
                      <GameIcon icon={r.icon} size={16} />
                      <span className="text-subtle truncate">{r.name}</span>
                      <span className="text-success font-mono text-right">{r.production.toFixed(1)}</span>
                      <span className="text-danger font-mono text-right">{r.consumption.toFixed(1)}</span>
                      <span className={`font-mono font-bold text-right ${
                        isSurplus ? 'text-success' : isDeficit ? 'text-danger' : 'text-warning'
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
          <div className="game-card rounded-xl bg-card p-4 border border-domain/30">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-domain" />
              <h3 className="text-sm font-semibold text-domain">Bottleneck Detection</h3>
              {bottlenecks.length > 0 && (
                <Badge variant="outline" className="text-[9px] border-danger/50 text-danger ml-auto">
                  {bottlenecks.length} issue{bottlenecks.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {bottlenecks.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="text-[10px] text-success">No bottlenecks detected</p>
                <p className="text-[9px] text-muted-label mt-1">All transport lines operating normally</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto game-scrollbar">
                {bottlenecks.map((bn, i) => {
                  const bDef = BUILDING_DEFS[bn.building.type];
                  const sevColor = bn.severity === 'critical' ? 'text-danger border-red-900/30' : bn.severity === 'warning' ? 'text-warning border-yellow-900/30' : 'text-subtle border-muted-label';
                  const sevIcon = bn.severity === 'critical' ? <XCircle className="w-3 h-3 text-danger" /> : bn.severity === 'warning' ? <AlertTriangle className="w-3 h-3 text-warning" /> : <CircleDot className="w-3 h-3 text-subtle" />;
                  const typeIcon = bn.type === 'under-supplied' ? <TrendingDown className="w-3 h-3 text-danger" /> : bn.type === 'over-supplied' ? <TrendingUp className="w-3 h-3 text-warning" /> : bn.type === 'capacity' ? <Zap className="w-3 h-3 text-domain" /> : bn.type === 'power' ? <ZapOff className="w-3 h-3 text-warning" /> : <Route className="w-3 h-3 text-danger" />;
                  return (
                    <div key={i} className={`bg-[#0a0e17] rounded-lg p-3 border ${sevColor}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {sevIcon}
                        {typeIcon}
                        <span className="text-[10px] text-subtle font-medium"><GameIcon icon={bDef?.icon} size={14} className="inline-flex" /> {bDef?.name}</span>
                      </div>
                      <p className="text-[10px] text-subtle mb-1">{bn.reason}</p>
                      {bn.flowRate !== undefined && bn.requiredRate !== undefined && (
                        <div className="text-[9px] text-muted-label mb-1">
                          Flow: <span className="font-mono">{bn.flowRate.toFixed(1)}</span> / Required: <span className="font-mono">{bn.requiredRate.toFixed(1)}</span> /s
                        </div>
                      )}
                      <p className="text-[9px] text-muted-label">{bn.solution}</p>
                      {bn.action && (
                        <Button
                          size="sm"
                          className="h-5 text-[9px] px-2 mt-1.5 bg-brand hover:bg-brand text-white"
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Package className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Bulk Operations</h3>
            </div>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-[10px] border-success/50 text-success hover:bg-success/20"
                onClick={handleActivateAll}
                disabled={store.transportLines.every(l => l.active)}
              >
                <Play className="w-3 h-3 mr-1" />
                Activate All Lines
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-[10px] border-yellow-800/50 text-warning hover:bg-yellow-900/20"
                onClick={handleDeactivateAll}
                disabled={store.transportLines.every(l => !l.active)}
              >
                <Pause className="w-3 h-3 mr-1" />
                Deactivate All Lines
              </Button>
              <div className="border-t border-muted-label pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-[10px] border-brand/50 text-brand hover:bg-brand/20"
                  onClick={() => setShowSuggestions(!showSuggestions)}
                >
                  <Lightbulb className="w-3 h-3 mr-1" />
                  Route Suggestions ({routeSuggestions.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-[10px] border-research/50 text-research hover:bg-research/20 mt-2"
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
          <div className="game-card rounded-xl bg-card p-4 border border-border">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-brand" />
              <h3 className="text-sm font-semibold text-brand">Health Breakdown</h3>
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
                    <div className="flex items-center gap-1 text-[10px] text-subtle">
                      <GameIcon icon={item.icon} size={16} />
                      {item.label}
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${
                      item.value >= 80 ? 'text-success' : item.value >= 50 ? 'text-warning' : 'text-danger'
                    }`}>
                      {item.value.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted-label rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        item.value >= 80 ? 'bg-success' : item.value >= 50 ? 'bg-warning' : 'bg-danger'
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
      <>
        {showSuggestions && (
          <div
          >
            <div className="game-card rounded-xl bg-card p-4 border border-brand/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-brand" />
                  <h3 className="text-sm font-semibold text-brand">Suggested Routes</h3>
                  <Badge variant="outline" className="text-[9px] border-brand/50 text-brand">{routeSuggestions.length}</Badge>
                </div>
                <button onClick={() => setShowSuggestions(false)} className="text-muted-label hover:text-subtle">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {routeSuggestions.length === 0 ? (
                <div className="text-center py-4">
                  <CircleDot className="w-8 h-8 text-dim mx-auto mb-2" />
                  <p className="text-xs text-muted-label">No suggestions available</p>
                  <p className="text-[10px] text-muted-label mt-1">Build more producers and consumers to get route suggestions</p>
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
                      <div key={i} className="bg-[#0a0e17] rounded-lg p-3 border border-brand/20">
                        <div className="flex items-center gap-2 mb-2">
                          <GameIcon icon={fromDef?.icon} size={14} className="inline-flex" />
                          <span className="text-xs text-subtle truncate max-w-[80px]">{fromDef?.name}</span>
                          <ArrowRight className="w-3 h-3 text-brand flex-shrink-0" />
                          <GameIcon icon={resMeta?.icon} size={14} className="inline-flex" />
                          <ArrowRight className="w-3 h-3 text-brand flex-shrink-0" />
                          <GameIcon icon={toDef?.icon} size={14} className="inline-flex" />
                          <span className="text-xs text-subtle truncate max-w-[80px]">{toDef?.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-label">{sug.reason}</span>
                          <Button
                            size="sm"
                            className="h-6 text-[10px] px-3 bg-brand hover:bg-brand text-white"
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
          </div>
        )}
      </>

      {/* Connect All Confirmation Dialog */}
      <>
        {showConnectAllDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowConnectAllDialog(false)}
          >
            <div
              className="bg-card rounded-xl border border-brand/50 p-6 max-w-md w-full mx-4 shadow-[0_0_40px_rgba(34,211,238,0.15)]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-4">
                <Link2 className="w-5 h-5 text-brand" />
                <h3 className="text-base font-bold text-brand">Connect All Routes</h3>
              </div>
              <p className="text-xs text-subtle mb-3">
                This will create <span className="text-brand font-bold">{connectAllData.routes.length}</span> transport lines using <GameIcon icon={TRANSPORT_DEFS[CHEAPEST_TYPE].icon} size={14} className="inline-flex" /> {TRANSPORT_DEFS[CHEAPEST_TYPE].name} (cheapest).
              </p>
              <div className="bg-[#0a0e17] rounded-lg p-3 mb-4 max-h-40 overflow-y-auto game-scrollbar">
                {connectAllData.routes.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] text-subtle py-0.5">
                    <span className="text-muted-label">{i + 1}.</span>
                    <span>{r.fromName}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-brand" />
                    <span>{r.resName}</span>
                    <ArrowRight className="w-2.5 h-2.5 text-brand" />
                    <span>{r.toName}</span>
                  </div>
                ))}
                {connectAllData.routes.length > 20 && (
                  <div className="text-[10px] text-muted-label mt-1">...and {connectAllData.routes.length - 20} more</div>
                )}
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-subtle">Total Cost:</span>
                <span className={`text-sm font-bold font-mono ${connectAllData.canAfford ? 'text-success' : 'text-danger'}`}>
                  ${formatNumber(connectAllData.totalCost)}
                </span>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs border-muted-label text-subtle hover:bg-muted-label"
                  onClick={() => setShowConnectAllDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs bg-brand hover:bg-brand text-white"
                  onClick={handleConnectAll}
                  disabled={!connectAllData.canAfford || connectAllData.routes.length === 0}
                >
                  <Link2 className="w-3.5 h-3.5 mr-1" />
                  Connect All
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    </div>
  );
}
