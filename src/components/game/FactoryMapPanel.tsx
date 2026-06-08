'use client';

import { useMemo, useState, useCallback, useRef, useEffect, memo } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META } from '@/lib/game/configCache';
import { BuildingInstance, BuildingType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Map as MapIcon, Zap, ChevronUp, Activity, Factory, Pickaxe,
  Hammer, X, RotateCcw, Power, PowerOff,
  ZoomIn, ZoomOut, Grid3X3, Eye, Sun, Cloud, CloudRain,
  CloudLightning, CloudFog, Snowflake, ChevronDown, ChevronRight,
  Search, Clock, Flame, GitBranch, LayoutGrid,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { GameIcon } from '@/components/game/shared/GameIcon';

// --- Constants ---
const GRID_COLS = 16;
const GRID_ROWS = 12;

// --- Category Color Mapping ---
const CATEGORY_STYLES: Record<string, { bg: string; border: string; glow: string; text: string; fill: string }> = {
  extractor: { bg: 'bg-amber-900/50', border: 'border-amber-500/50', glow: 'shadow-amber-500/30', text: 'text-amber-400', fill: '#92400e' },
  factory_t1: { bg: 'bg-cyan-900/50', border: 'border-cyan-500/50', glow: 'shadow-cyan-500/30', text: 'text-cyan-400', fill: '#164e63' },
  factory_t2: { bg: 'bg-orange-900/50', border: 'border-orange-500/50', glow: 'shadow-orange-500/30', text: 'text-orange-400', fill: '#7c2d12' },
  factory_t3: { bg: 'bg-purple-900/50', border: 'border-purple-500/50', glow: 'shadow-purple-500/30', text: 'text-purple-400', fill: '#581c87' },
  factory_t4: { bg: 'bg-emerald-900/50', border: 'border-emerald-500/50', glow: 'shadow-emerald-500/30', text: 'text-emerald-400', fill: '#064e3b' },
  power: { bg: 'bg-yellow-900/50', border: 'border-yellow-500/50', glow: 'shadow-yellow-500/30', text: 'text-yellow-400', fill: '#713f12' },
};

function getCategoryStyle(building: BuildingInstance) {
  const def = BUILDING_DEFS[building.type];
  if (!def) return CATEGORY_STYLES.extractor;
  if (def.category === 'extractor') return CATEGORY_STYLES.extractor;
  if (def.category === 'power') return CATEGORY_STYLES.power;
  if (def.category === 'factory') {
    if (def.tier === 1) return CATEGORY_STYLES.factory_t1;
    if (def.tier === 2) return CATEGORY_STYLES.factory_t2;
    if (def.tier === 3) return CATEGORY_STYLES.factory_t3;
    if (def.tier === 4) return CATEGORY_STYLES.factory_t4;
    return CATEGORY_STYLES.factory_t3;
  }
  return CATEGORY_STYLES.extractor;
}

function getEffColor(eff: number): string {
  if (eff >= 0.8) return '#4ade80';
  if (eff >= 0.5) return '#facc15';
  return '#f87171';
}

// --- Building Palette for Build Mode ---
const BUILD_CATEGORIES = [
  {
    label: <><GameIcon icon="gi:mining" size={14} className="inline" /> Extraction</>,
    types: ['miningDrill', 'oilPump', 'waterExtractor', 'quarry'] as BuildingType[],
  },
  {
    label: <><GameIcon icon="gi:flame" size={14} className="inline" /> T1 Factory</>,
    types: ['smelter', 'wireMill', 'chemicalPlant', 'glassFurnace', 'steelForge', 'carbonProcessor'] as BuildingType[],
  },
  {
    label: <><GameIcon icon="gi:big-gear" size={14} className="inline" /> T2 Factory</>,
    types: ['gearFactory', 'circuitFactory', 'engineFactory', 'batteryFactory'] as BuildingType[],
  },
  {
    label: <><GameIcon icon="gi:chemical-drop" size={14} className="inline" /> T3 Factory</>,
    types: ['aiLab', 'roboticsBay', 'quantumLab', 'alloyForge', 'nanoLab'] as BuildingType[],
  },
  {
    label: <><GameIcon icon="gi:vortex" size={14} className="inline" /> T4 Factory</>,
    types: ['singularityForge', 'darkMatterLab', 'warpDriveFactory', 'antimatterReactor', 'chronoLab', 'plasmaForge', 'megaStructureFactory', 'voidCrystallizer', 'dysonCollector', 'quantumTeleporter', 'dimensionalGateway', 'timeDistorter', 'galacticForge'] as BuildingType[],
  },
  {
    label: <><GameIcon icon="gi:lightning-frequency" size={14} className="inline" /> Power</>,
    types: ['coalGenerator', 'solarPanel', 'windTurbine', 'nuclearReactor', 'fusionReactor', 'antimatterPowerPlant'] as BuildingType[],
  },
];

// --- Weather icon helper ---
function WeatherIcon({ type }: { type: string }) {
  switch (type) {
    case 'clear': return <Sun className="w-3.5 h-3.5 text-yellow-400" />;
    case 'sunny': return <Sun className="w-3.5 h-3.5 text-orange-400" />;
    case 'rainy': return <CloudRain className="w-3.5 h-3.5 text-blue-400" />;
    case 'stormy': return <CloudLightning className="w-3.5 h-3.5 text-purple-400" />;
    case 'foggy': return <CloudFog className="w-3.5 h-3.5 text-gray-400" />;
    case 'snowy': return <Snowflake className="w-3.5 h-3.5 text-sky-300" />;
    default: return <Cloud className="w-3.5 h-3.5 text-gray-400" />;
  }
}

// --- Terrain region tint based on row ---
function getTerrainTint(row: number): { bg: string; label: string } {
  if (row < 4) return { bg: 'rgba(146, 64, 14, 0.06)', label: 'extraction' }; // earthy amber
  if (row < 8) return { bg: 'rgba(22, 78, 99, 0.06)', label: 'industrial' }; // industrial cyan
  return { bg: 'rgba(113, 63, 18, 0.06)', label: 'power' }; // electric yellow
}

// --- Decorative element for empty cells (factory floor feel) ---
function getFloorDecoration(r: number, c: number): React.ReactNode {
  const hash = (r * 31 + c * 17) % 7;
  if (hash === 0) return <div className="w-0.5 h-0.5 rounded-full bg-cyan-900/30" />; // tiny dot
  if (hash === 1) return <div className="w-1.5 h-px bg-gray-700/20" />; // dash
  if (hash === 2) return <div className="w-1 h-1 border-t border-r border-gray-700/15 rotate-45 scale-75" />; // small cross
  if (hash === 3) return <div className="w-0.5 h-0.5 rounded-sm bg-amber-900/20 rotate-45" />; // tiny diamond
  if (hash === 4) return <div className="w-1 h-px bg-cyan-800/15" />; // line
  if (hash === 5) return <div className="w-0.5 h-0.5 rounded-full bg-yellow-900/20" />; // warm dot
  return null; // some cells stay clean
}

// --- Grid cell position tracking in store ---
// We use a separate map from building.id -> {row, col} stored in component state
// This way we don't need to modify the store schema

interface BuildingPosition {
  row: number;
  col: number;
}

// --- Factory Connection Data Model ---
interface FactoryConnection {
  id: string;
  sourceBuildingId: string;
  targetBuildingId: string;
  resourceType: string;
  efficiency: number;
}

// --- Building Tile on the Map ---
const MapBuildingTile = memo(function MapBuildingTile({
  building,
  isSelected,
  onClick,
  tick,
  recentlyUpgraded,
  connectionEfficiency,
}: {
  building: BuildingInstance;
  isSelected: boolean;
  onClick: () => void;
  tick: number;
  recentlyUpgraded: boolean;
  connectionEfficiency?: number;
}) {
  const def = BUILDING_DEFS[building.type];
  if (!def) return null;

  const style = getCategoryStyle(building);
  const isPower = def.category === 'power';
  const producesPower = def.basePowerProduction > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className={`
            relative w-full h-full rounded-lg border-2 cursor-pointer overflow-hidden select-none
            ${style.bg}
            ${!building.active ? 'opacity-40 grayscale' : 'hover:brightness-125 hover:scale-[1.05]'}
          `}
          style={{ borderColor: isSelected ? '#22d3ee' : style.fill }}

        >
          {/* Power glow */}
          {isPower && building.active && (
            <div className="absolute inset-0 bg-yellow-400/10 animate-factory-map-glow" />
          )}



          {/* Production particles - 3 particles instead of 2 */}
          {building.active && building.efficiency > 0.5 && def.outputs && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {def.outputs.slice(0, 3).map((output, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: RESOURCE_META[output.resource as keyof typeof RESOURCE_META]?.color ?? '#00fff2',
                    left: `${15 + i * 30}%`,
                  }}
                  animate={{ y: [0, -8, -16, -22], opacity: [0, 0.9, 0.5, 0], scale: [0.5, 1, 0.8, 0.3] }}
                  transition={{
                    duration: 1.8 + i * 0.25,
                    repeat: Infinity,
                    delay: (tick % 100) * 0.01 + i * 0.4,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </div>
          )}

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-0.5 gap-0">
            {/* Emoji */}
            <GameIcon icon={def.icon} size={20} />
            {/* Level badge */}
            <div className="flex items-center gap-0.5 mt-0.5">
              <Badge className="text-[6px] px-0.5 py-0 h-3 min-w-[12px] bg-gray-800/80 text-gray-300 border-gray-600/50">
                {building.level}
              </Badge>
            </div>
            {/* Efficiency bar */}
            <div className="w-full h-0.5 bg-gray-800/60 rounded-full mt-0.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(building.efficiency * 100)}%`,
                  backgroundColor: getEffColor(building.efficiency),
                }}
              />
            </div>
            {/* Power indicator */}
            {producesPower && (
              <Zap className="w-2 h-2 text-yellow-400 absolute top-0 right-0 animate-factory-map-spark" />
            )}
            {/* Connection efficiency indicator */}
            {connectionEfficiency !== undefined && connectionEfficiency > 0 && (
              <div
                className="absolute bottom-0 left-0 w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: connectionEfficiency >= 0.8 ? '#4ade80' : connectionEfficiency >= 0.5 ? '#facc15' : '#f87171',
                  boxShadow: `0 0 3px ${connectionEfficiency >= 0.8 ? '#4ade80' : connectionEfficiency >= 0.5 ? '#facc15' : '#f87171'}`,
                }}
              />
            )}
          </div>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-card border-cyan-900/30 w-48 p-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <GameIcon icon={def.icon} size={14} className="inline-flex" />
            <span className={`text-[11px] font-semibold ${style.text}`}>{def.name}</span>
            <Badge variant="outline" className="text-[8px] border-gray-600 text-gray-400 h-4 px-1">
              Lv{building.level}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            <span style={{ color: getEffColor(building.efficiency) }}>
              {Math.round(building.efficiency * 100)}% eff
            </span>
            <span className={building.active ? 'text-green-400' : 'text-red-400'}>
              {building.active ? 'Active' : 'Off'}
            </span>
            {producesPower && <span className="text-yellow-400">+{def.basePowerProduction * building.level}MW</span>}
            {def.basePowerConsumption > 0 && <span className="text-yellow-600">-{def.basePowerConsumption * building.level}MW</span>}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

// --- Selected Building Detail Panel ---
function SelectedBuildingPanel({
  building,
  onClose,
}: {
  building: BuildingInstance;
  onClose: () => void;
}) {
  const store = useGameStore();
  const def = BUILDING_DEFS[building.type];
  if (!def) return null;

  const style = getCategoryStyle(building);
  const upgradeCost = def.baseCost.find(c => c.resource === 'money')
    ? Math.floor((def.baseCost.find(c => c.resource === 'money')?.amount ?? 0) * Math.pow(def.costMultiplier, building.level))
    : 0;
  const canAffordUpgrade = store.money >= upgradeCost;

  return (
    <div
      className="game-card rounded-xl bg-card p-3 border border-border space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GameIcon icon={def.icon} size={24} />
          <div>
            <h3 className={`text-sm font-semibold ${style.text}`}>{def.name}</h3>
            <p className="text-[10px] text-gray-500">
              Lv {building.level} • {building.active ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>Active</span> : <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>Off</span>}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-500" onClick={onClose}>
          <X className="w-3 h-3" />
        </Button>
      </div>

      <p className="text-[10px] text-gray-400">{def.description}</p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Efficiency</div>
          <div className="text-sm font-bold font-mono" style={{ color: getEffColor(building.efficiency) }}>
            {Math.round(building.efficiency * 100)}%
          </div>
        </div>
        <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Power</div>
          <div className={`text-sm font-bold font-mono ${building.active ? 'text-yellow-400' : 'text-gray-600'}`}>
            {def.basePowerProduction > 0
              ? `+${building.active ? def.basePowerProduction * building.level : 0}MW`
              : `-${building.active ? def.basePowerConsumption * building.level : 0}MW`}
          </div>
        </div>
      </div>

      {/* Production */}
      {def.outputs && (
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Produces</div>
          <div className="space-y-0.5">
            {def.outputs.map((output, i) => {
              const meta = RESOURCE_META[output.resource as keyof typeof RESOURCE_META];
              const rate = building.active ? output.amount * building.level * building.efficiency : 0;
              return (
                <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded px-1.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">{meta?.icon ?? ''}</span>
                    <span className="text-[9px]" style={{ color: meta?.color }}>{meta?.name ?? output.resource}</span>
                  </div>
                  <span className="text-[9px] text-green-400 font-mono">+{formatNumber(rate)}/s</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inputs */}
      {def.inputs && (
        <div>
          <div className="text-[9px] text-gray-500 mb-1">Requires</div>
          <div className="space-y-0.5">
            {def.inputs.map((input, i) => {
              const meta = RESOURCE_META[input.resource as keyof typeof RESOURCE_META];
              const needed = input.amount * building.level;
              const have = store.resources[input.resource as keyof typeof store.resources] ?? 0;
              const enough = have >= needed;
              return (
                <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded px-1.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">{meta?.icon ?? ''}</span>
                    <span className="text-[9px]" style={{ color: meta?.color }}>{meta?.name ?? input.resource}</span>
                  </div>
                  <span className={`text-[9px] font-mono ${enough ? 'text-gray-400' : 'text-red-400'}`}>
                    {formatNumber(have)}/{formatNumber(needed)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className={`flex-1 h-7 text-[10px] ${
            building.active
              ? 'border-red-800/50 text-red-400 hover:bg-red-900/20'
              : 'border-green-800/50 text-green-400 hover:bg-green-900/20'
          }`}
          onClick={() => store.toggleBuilding(building.id)}
        >
          {building.active ? <PowerOff className="w-2.5 h-2.5 mr-1" /> : <Power className="w-2.5 h-2.5 mr-1" />}
          {building.active ? 'Off' : 'On'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`flex-1 h-7 text-[10px] ${
            canAffordUpgrade
              ? 'border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20'
              : 'border-gray-700 text-gray-500'
          }`}
          onClick={() => store.upgradeBuilding(building.id)}
          disabled={!canAffordUpgrade}
        >
          <ChevronUp className="w-2.5 h-2.5 mr-1" />
          ${formatNumber(upgradeCost)}
        </Button>
      </div>
    </div>
  );
}

// --- Enhanced Connection Lines Overlay ---
function ConnectionOverlay({
  connections,
  buildingPositions,
  cellWidth,
  cellHeight,
}: {
  connections: FactoryConnection[];
  buildingPositions: Map<string, BuildingPosition>;
  cellWidth: number;
  cellHeight: number;
}) {
  if (connections.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-0"
         width={GRID_COLS * cellWidth}
         height={GRID_ROWS * cellHeight}
         role="img"
         aria-label="Factory map connection lines showing building links">
      <defs>
        {/* Glow filters */}
        <filter id="connection-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {connections.map((conn) => {
        const sourcePos = buildingPositions.get(conn.sourceBuildingId);
        const targetPos = buildingPositions.get(conn.targetBuildingId);
        if (!sourcePos || !targetPos) return null;

        const x1 = (sourcePos.col + 0.5) * cellWidth;
        const y1 = (sourcePos.row + 0.5) * cellHeight;
        const x2 = (targetPos.col + 0.5) * cellWidth;
        const y2 = (targetPos.row + 0.5) * cellHeight;

        // Bezier control point (slight curve)
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const cx = mx - dy * 0.15;
        const cy = my + dx * 0.15;
        const path = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;

        const isPower = conn.resourceType === 'power';
        const meta = RESOURCE_META[conn.resourceType as keyof typeof RESOURCE_META];
        const color = isPower ? '#facc15' : (meta?.color ?? '#00fff2');
        const effColor = conn.efficiency >= 0.8 ? '#4ade80' : conn.efficiency >= 0.5 ? '#facc15' : '#f87171';
        const strokeWidth = isPower ? 1.5 : Math.max(1, 2 * conn.efficiency);

        return (
          <g key={conn.id}>
            {/* Connection line */}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              opacity={isPower ? 0.2 : 0.3}
              filter={conn.efficiency >= 0.8 ? 'url(#connection-glow)' : undefined}
            />

            {/* Efficiency indicator dot at midpoint */}
            <circle cx={mx} cy={my} r="2" fill={effColor} opacity="0.6" />

            {/* Animated flow particles */}
            {[0, 0.33, 0.66].map((offset, j) => (
              <circle key={j} r={isPower ? 1.5 : 2} fill={color} opacity="0.7">
                <animateMotion
                  dur={`${1.5 + (1 - conn.efficiency) * 1}s`}
                  repeatCount="indefinite"
                  begin={`${offset * 1.5}s`}
                  path={path}
                />
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// --- Main FactoryMapPanel ---
export default function FactoryMapPanel() {
  const store = useGameStore();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState(false);
  const [selectedBuildType, setSelectedBuildType] = useState<BuildingType | null>(null);
  const [paletteCategory, setPaletteCategory] = useState(0);
  const [showConnections, setShowConnections] = useState(true);
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [buildSearch, setBuildSearch] = useState('');
  const [recentlyUsed, setRecentlyUsed] = useState<BuildingType[]>(() => {
    try {
      const saved = localStorage.getItem('factory-map-recent-builds');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return [];
  });
  const [upgradedBuildingIds, setUpgradedBuildingIds] = useState<Set<string>>(new Set());
  const prevBuildingLevels = useRef<Record<string, number>>({});

  // When user clicks on a cell in build mode, we store the target position here
  // then immediately call buildBuilding(), and the useMemo picks up the new building
  const [pendingPosition, setPendingPosition] = useState<{ row: number; col: number } | null>(null);

  // Persisted positions in localStorage
  const [savedPositions, setSavedPositions] = useState<Record<string, BuildingPosition>>(() => {
    try {
      const saved = localStorage.getItem('factory-map-positions');
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return {};
  });

  // Helper to save positions to localStorage
  const persistPositions = useCallback((positions: Record<string, BuildingPosition>) => {
    try {
      localStorage.setItem('factory-map-positions', JSON.stringify(positions));
    } catch { /* ignore */ }
  }, []);

  // Derive current positions from saved + current buildings + pending position
  const buildingPositions = useMemo(() => {
    const posMap = new Map<string, BuildingPosition>();
    const usedCells = new Set<string>();

    // Start with saved positions that still have buildings
    for (const b of store.buildings) {
      const saved = savedPositions[b.id];
      if (saved) {
        posMap.set(b.id, saved);
        usedCells.add(`${saved.row}-${saved.col}`);
      }
    }

    // Assign positions for buildings without saved positions
    for (const b of store.buildings) {
      if (posMap.has(b.id)) continue;

      // Check for pending placement
      if (pendingPosition) {
        posMap.set(b.id, { row: pendingPosition.row, col: pendingPosition.col });
        usedCells.add(`${pendingPosition.row}-${pendingPosition.col}`);
        continue;
      }

      // Find first empty cell
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const key = `${r}-${c}`;
          if (!usedCells.has(key)) {
            posMap.set(b.id, { row: r, col: c });
            usedCells.add(key);
            break;
          }
        }
        if (posMap.has(b.id)) break;
      }
    }

    return posMap;
  }, [store.buildings, savedPositions, pendingPosition]);

  // When positions change, persist to localStorage (via setTimeout to avoid effect-body setState)
  const lastPersistedRef = useRef<string>('');
  useEffect(() => {
    const newSaved: Record<string, BuildingPosition> = {};
    buildingPositions.forEach((v, k) => { newSaved[k] = v; });
    const newStr = JSON.stringify(newSaved);
    if (newStr !== lastPersistedRef.current) {
      lastPersistedRef.current = newStr;
      persistPositions(newSaved);
      // Update savedPositions so useMemo stays in sync (deferred to avoid cascading render)
      setTimeout(() => {
        setSavedPositions(newSaved);
        setPendingPosition(null); // Clear pending after saving
      }, 0);
    }
  }, [buildingPositions, persistPositions]);

  const selectedBuilding = useMemo(
    () => store.buildings.find(b => b.id === selectedBuildingId) ?? null,
    [store.buildings, selectedBuildingId]
  );

  // Cell dimensions (responsive)
  const cellWidth = 72;
  const cellHeight = 72;

  // Handle cell click (place building or select building)
  const handleCellClick = useCallback((row: number, col: number) => {
    if (buildMode && selectedBuildType) {
      // Check if cell is occupied
      const existingBuilding = store.buildings.find(b => {
        const pos = buildingPositions.get(b.id);
        return pos?.row === row && pos?.col === col;
      });

      if (existingBuilding) {
        // Select existing building instead
        setSelectedBuildingId(existingBuilding.id);
        return;
      }

      // Track recently used building type
      setRecentlyUsed(prev => {
        const filtered = prev.filter(t => t !== selectedBuildType);
        const updated = [selectedBuildType, ...filtered].slice(0, 3);
        try { localStorage.setItem('factory-map-recent-builds', JSON.stringify(updated)); } catch { /* ignore */ }
        return updated;
      });

      // Set the target position, then build
      setPendingPosition({ row, col });

      // Place the building (Zustand updates state synchronously)
      store.buildBuilding(selectedBuildType);

      // The useMemo will pick up the new building + pendingPosition and assign it correctly
      return;
    }

    // Not in build mode: select building at this cell
    const buildingAtCell = store.buildings.find(b => {
      const pos = buildingPositions.get(b.id);
      return pos?.row === row && pos?.col === col;
    });

    if (buildingAtCell) {
      setSelectedBuildingId(prev => prev === buildingAtCell.id ? null : buildingAtCell.id);
    } else {
      setSelectedBuildingId(null);
    }
  }, [buildMode, selectedBuildType, store, buildingPositions]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  }, [panOffset]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
    // Track hovered cell for build preview
    if (mapRef.current && buildMode) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - panOffset.x) / zoom;
      const y = (e.clientY - rect.top - panOffset.y) / zoom;
      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);
      if (row >= 0 && row < GRID_ROWS && col >= 0 && col < GRID_COLS) {
        setHoveredCell({ row, col });
      } else {
        setHoveredCell(null);
      }
    } else {
      setHoveredCell(null);
    }
  }, [isPanning, panStart, zoom, panOffset, buildMode, cellWidth, cellHeight]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom
  const handleZoomIn = () => setZoom(z => Math.min(2, z + 0.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, z - 0.2));
  const handleResetView = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); };

  // Zoom via mouse wheel (non-passive to allow preventDefault)
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.max(0.5, Math.min(2, z + delta)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Build mode: check if a build type is affordable
  const isBuildAffordable = useCallback((type: BuildingType) => {
    const def = BUILDING_DEFS[type];
    if (!def) return false;
    return def.baseCost.every(c => {
      if (c.resource === 'money') return store.money >= c.amount;
      return true;
    });
  }, [store.money]);

  // Check if building is unlocked
  const isBuildUnlocked = useCallback((type: BuildingType) => {
    const def = BUILDING_DEFS[type];
    if (!def?.unlockRequirement) return true;
    if (def.unlockRequirement.research && !store.completedResearch.includes(def.unlockRequirement.research)) return false;
    return true;
  }, [store.completedResearch]);

  // Stats
  const totalBuildings = store.buildings.length;
  const activeBuildings = store.buildings.filter(b => b.active).length;
  const extractorCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor').length;
  const factoryCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory').length;
  const powerCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power').length;

  // Detect building level upgrades for flash animation
  useEffect(() => {
    const currentLevels: Record<string, number> = {};
    const upgraded: string[] = [];
    for (const b of store.buildings) {
      currentLevels[b.id] = b.level;
      const prevLevel = prevBuildingLevels.current[b.id];
      if (prevLevel !== undefined && b.level > prevLevel) {
        upgraded.push(b.id);
      }
    }
    prevBuildingLevels.current = currentLevels;
    if (upgraded.length > 0) {
      // Defer setState to avoid cascading render within effect
      setTimeout(() => {
        setUpgradedBuildingIds(prev => {
          const next = new Set(prev);
          upgraded.forEach(id => next.add(id));
          return next;
        });
        // Clear flash after animation
        setTimeout(() => {
          setUpgradedBuildingIds(prev => {
            const next = new Set(prev);
            upgraded.forEach(id => next.delete(id));
            return next;
          });
        }, 700);
      }, 0);
    }
  }, [store.buildings]);

  // Filter building types by search
  const filteredCategories = useMemo(() => {
    if (!buildSearch.trim()) return BUILD_CATEGORIES;
    const q = buildSearch.toLowerCase();
    return BUILD_CATEGORIES.map(cat => ({
      ...cat,
      types: cat.types.filter(type => {
        const def = BUILDING_DEFS[type];
        if (!def) return false;
        return def.name.toLowerCase().includes(q) || def.icon.includes(q) || def.description.toLowerCase().includes(q);
      }),
    })).filter(cat => cat.types.length > 0);
  }, [buildSearch]);

  // --- Auto-Connect Algorithm ---
  const autoConnections = useMemo(() => {
    const conns: FactoryConnection[] = [];
    const activeBuildings = store.buildings.filter(b => b.active);

    // For each active building with inputs, find the best supplier
    for (const consumer of activeBuildings) {
      const consumerDef = BUILDING_DEFS[consumer.type];
      if (!consumerDef?.inputs) continue;
      const consumerPos = buildingPositions.get(consumer.id);
      if (!consumerPos) continue;

      for (const input of consumerDef.inputs) {
        // Find all active buildings that output this resource
        const suppliers = activeBuildings.filter(b => {
          const def = BUILDING_DEFS[b.type];
          return def?.outputs?.some(o => o.resource === input.resource);
        });

        if (suppliers.length === 0) continue;

        // Sort suppliers by distance (closest first)
        const sorted = suppliers.map(s => {
          const pos = buildingPositions.get(s.id);
          if (!pos) return { building: s, dist: Infinity };
          const dist = Math.abs(pos.row - consumerPos.row) + Math.abs(pos.col - consumerPos.col);
          return { building: s, dist };
        }).sort((a, b) => a.dist - b.dist);

        // Connect to the closest supplier
        const best = sorted[0];
        if (best.dist === Infinity) continue;

        // Efficiency based on distance: 100% at dist 1, decreasing by 10% per unit, min 20%
        const efficiency = Math.max(0.2, 1 - (best.dist - 1) * 0.1);

        conns.push({
          id: `${best.building.id}-${consumer.id}-${input.resource}`,
          sourceBuildingId: best.building.id,
          targetBuildingId: consumer.id,
          resourceType: input.resource,
          efficiency,
        });
      }
    }

    // Add power connections: connect each consumer to nearest power plant
    const powerPlants = activeBuildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');
    const nonPower = activeBuildings.filter(b => {
      const def = BUILDING_DEFS[b.type];
      return def && def.category !== 'power' && def.basePowerConsumption > 0;
    });

    for (const consumer of nonPower) {
      const consumerPos = buildingPositions.get(consumer.id);
      if (!consumerPos) continue;

      const nearest = powerPlants.map(pp => {
        const pos = buildingPositions.get(pp.id);
        if (!pos) return { building: pp, dist: Infinity };
        return { building: pp, dist: Math.abs(pos.row - consumerPos.row) + Math.abs(pos.col - consumerPos.col) };
      }).sort((a, b) => a.dist - b.dist)[0];

      if (!nearest || nearest.dist === Infinity) continue;

      // Power efficiency: 100% at dist 1, decreasing by 8% per unit, min 30%
      conns.push({
        id: `${nearest.building.id}-${consumer.id}-power`,
        sourceBuildingId: nearest.building.id,
        targetBuildingId: consumer.id,
        resourceType: 'power',
        efficiency: Math.max(0.3, 1 - (nearest.dist - 1) * 0.08),
      });
    }

    return conns;
  }, [store.buildings, buildingPositions]);

  // Average efficiency for stats display
  const avgEfficiency = autoConnections.length > 0
    ? autoConnections.reduce((sum, c) => sum + c.efficiency, 0) / autoConnections.length
    : 0;

  // Per-building connection efficiency for tile indicator
  const buildingConnEfficiency = useMemo(() => {
    const map = new Map<string, number>();
    for (const conn of autoConnections) {
      // For target buildings, track the min efficiency of their incoming connections
      const existing = map.get(conn.targetBuildingId);
      if (existing === undefined || conn.efficiency < existing) {
        map.set(conn.targetBuildingId, conn.efficiency);
      }
      // Also track for source buildings
      const existingSrc = map.get(conn.sourceBuildingId);
      if (existingSrc === undefined || conn.efficiency < existingSrc) {
        map.set(conn.sourceBuildingId, conn.efficiency);
      }
    }
    return map;
  }, [autoConnections]);

  // --- Auto-Arrange Algorithm ---
  const autoArrange = useCallback(() => {
    const newPositions: Record<string, BuildingPosition> = {};
    const usedCells = new Set<string>();

    // Helper: find nearest empty cell to target, expanding outward in a spiral
    const findNearestEmpty = (targetRow: number, targetCol: number, minRow = 0, maxRow = GRID_ROWS - 1): BuildingPosition | null => {
      for (let dist = 0; dist < Math.max(GRID_ROWS, GRID_COLS); dist++) {
        for (let dr = -dist; dr <= dist; dr++) {
          for (let dc = -dist; dc <= dist; dc++) {
            if (Math.abs(dr) + Math.abs(dc) !== dist) continue; // Only check the current ring
            const r = targetRow + dr;
            const c = targetCol + dc;
            if (r < minRow || r > maxRow || c < 0 || c >= GRID_COLS) continue;
            if (!usedCells.has(`${r}-${c}`)) {
              return { row: r, col: c };
            }
          }
        }
      }
      return null;
    };

    // Group buildings by category
    const extractors = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor');
    const t1Factories = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory' && BUILDING_DEFS[b.type]?.tier === 1);
    const t2Factories = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory' && BUILDING_DEFS[b.type]?.tier === 2);
    const t3Factories = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory' && BUILDING_DEFS[b.type]?.tier === 3);
    const powerPlants = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');

    // Place extractors at top rows (0-2), spread across columns
    let col = 0;
    let row = 0;
    for (const b of extractors) {
      const pos = findNearestEmpty(row, col, 0, 2);
      if (pos) {
        newPositions[b.id] = pos;
        usedCells.add(`${pos.row}-${pos.col}`);
      }
      col += 2; // Space extractors apart for visual clarity
      if (col >= GRID_COLS) { col = 0; row++; }
    }

    // Place T1 factories right below their supplier extractors (row offset +1)
    for (const b of t1Factories) {
      const def = BUILDING_DEFS[b.type];
      // Find the closest already-placed supplier
      let bestPos: BuildingPosition | null = null;
      let bestDist = Infinity;
      for (const e of extractors) {
        const eDef = BUILDING_DEFS[e.type];
        if (!def?.inputs?.some(inp => eDef?.outputs?.some(o => o.resource === inp.resource))) continue;
        const ePos = newPositions[e.id];
        if (!ePos) continue;
        // Target: one row below the supplier
        const targetRow = ePos.row + 1;
        const targetCol = ePos.col;
        const pos = findNearestEmpty(targetRow, targetCol, 0, 5);
        if (pos) {
          const dist = Math.abs(pos.row - targetRow) + Math.abs(pos.col - targetCol);
          if (dist < bestDist) {
            bestDist = dist;
            bestPos = pos;
          }
        }
      }
      if (bestPos) {
        newPositions[b.id] = bestPos;
        usedCells.add(`${bestPos.row}-${bestPos.col}`);
      } else {
        // Fallback: any empty cell in rows 2-5
        const pos = findNearestEmpty(3, 0, 2, 5);
        if (pos) {
          newPositions[b.id] = pos;
          usedCells.add(`${pos.row}-${pos.col}`);
        }
      }
    }

    // Place T2 factories right below their T1 suppliers (row offset +1)
    for (const b of t2Factories) {
      const def = BUILDING_DEFS[b.type];
      let bestPos: BuildingPosition | null = null;
      let bestDist = Infinity;
      for (const f of t1Factories) {
        const fDef = BUILDING_DEFS[f.type];
        if (!def?.inputs?.some(inp => fDef?.outputs?.some(o => o.resource === inp.resource))) continue;
        const fPos = newPositions[f.id];
        if (!fPos) continue;
        const targetRow = fPos.row + 1;
        const targetCol = fPos.col;
        const pos = findNearestEmpty(targetRow, targetCol, 0, 8);
        if (pos) {
          const dist = Math.abs(pos.row - targetRow) + Math.abs(pos.col - targetCol);
          if (dist < bestDist) {
            bestDist = dist;
            bestPos = pos;
          }
        }
      }
      if (bestPos) {
        newPositions[b.id] = bestPos;
        usedCells.add(`${bestPos.row}-${bestPos.col}`);
      } else {
        const pos = findNearestEmpty(5, 0, 4, 8);
        if (pos) {
          newPositions[b.id] = pos;
          usedCells.add(`${pos.row}-${pos.col}`);
        }
      }
    }

    // Place T3 factories right below their T2 suppliers (row offset +1)
    for (const b of t3Factories) {
      const def = BUILDING_DEFS[b.type];
      let bestPos: BuildingPosition | null = null;
      let bestDist = Infinity;
      for (const f of t2Factories) {
        const fDef = BUILDING_DEFS[f.type];
        if (!def?.inputs?.some(inp => fDef?.outputs?.some(o => o.resource === inp.resource))) continue;
        const fPos = newPositions[f.id];
        if (!fPos) continue;
        const targetRow = fPos.row + 1;
        const targetCol = fPos.col;
        const pos = findNearestEmpty(targetRow, targetCol, 0, 10);
        if (pos) {
          const dist = Math.abs(pos.row - targetRow) + Math.abs(pos.col - targetCol);
          if (dist < bestDist) {
            bestDist = dist;
            bestPos = pos;
          }
        }
      }
      if (bestPos) {
        newPositions[b.id] = bestPos;
        usedCells.add(`${bestPos.row}-${bestPos.col}`);
      } else {
        const pos = findNearestEmpty(7, 0, 6, 10);
        if (pos) {
          newPositions[b.id] = pos;
          usedCells.add(`${pos.row}-${pos.col}`);
        }
      }
    }

    // Place power plants ADJACENT to their consumers (not at the bottom)
    // Distribute them alongside the buildings they power
    const consumers = [...extractors, ...t1Factories, ...t2Factories, ...t3Factories]
      .filter(b => (BUILDING_DEFS[b.type]?.basePowerConsumption ?? 0) > 0);
    const placedPowerIds = new Set<string>();

    for (const consumer of consumers) {
      const cPos = newPositions[consumer.id];
      if (!cPos) continue;

      // Find an unplaced power plant
      const unplacedPower = powerPlants.find(pp => !placedPowerIds.has(pp.id));
      if (!unplacedPower) break;

      // Place it right next to the consumer (prefer right side, then below, then above)
      const pos = findNearestEmpty(cPos.row, cPos.col + 1, 0, GRID_ROWS - 1);
      if (pos) {
        newPositions[unplacedPower.id] = pos;
        usedCells.add(`${pos.row}-${pos.col}`);
        placedPowerIds.add(unplacedPower.id);
      }
    }

    // Place any remaining power plants near the center of all buildings
    const remainingPower = powerPlants.filter(pp => !placedPowerIds.has(pp.id));
    const allPlacedPositions = Object.values(newPositions);
    const centerRow = allPlacedPositions.length > 0
      ? Math.round(allPlacedPositions.reduce((s, p) => s + p.row, 0) / allPlacedPositions.length)
      : Math.floor(GRID_ROWS / 2);
    const centerCol = allPlacedPositions.length > 0
      ? Math.round(allPlacedPositions.reduce((s, p) => s + p.col, 0) / allPlacedPositions.length)
      : Math.floor(GRID_COLS / 2);

    for (const b of remainingPower) {
      const pos = findNearestEmpty(centerRow, centerCol, 0, GRID_ROWS - 1);
      if (pos) {
        newPositions[b.id] = pos;
        usedCells.add(`${pos.row}-${pos.col}`);
      }
    }

    // Apply new positions with smooth transition
    setSavedPositions(newPositions);
    persistPositions(newPositions);
  }, [store.buildings, persistPositions]);

  return (
    <div className="space-y-3">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-emerald-400 tracking-wide flex items-center gap-2">
            <MapIcon className="w-5 h-5" />
            Factory Floor
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">Build, manage, and visualize your factory on the map</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Weather indicator */}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-sky-500/30 text-sky-400 bg-sky-900/10 flex items-center gap-1">
            <WeatherIcon type={store.weather.current} />
            {store.weather.current !== 'clear' && <span>{store.weather.remaining}t</span>}
          </Badge>
          {/* Buildings count */}
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-900/10 text-[10px]">
            {totalBuildings} Buildings
          </Badge>
          {/* Overload warning */}
          {store.powerGrid.overload && (
            <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-900/20 text-[10px] neon-pulse">
              <Zap className="w-3 h-3 mr-1" /> OVERLOAD
            </Badge>
          )}
        </div>
      </div>

      {/* BUILD MODE TOOLBAR */}
      <div className="game-card rounded-xl bg-card border border-border overflow-hidden">
        {/* Top row: mode toggles + zoom */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-900/20">
          <div className="flex items-center gap-2">
            <Button
              variant={buildMode ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-[10px] ${buildMode ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'border-emerald-800/50 text-emerald-400'}`}
              onClick={() => { setBuildMode(!buildMode); setSelectedBuildType(null); }}
            >
              <Hammer className="w-3 h-3 mr-1" />
              {buildMode ? 'Building...' : 'Build'}
            </Button>
            {buildMode && selectedBuildType && (
              <Badge className="text-[9px] bg-cyan-900/30 text-cyan-400 border border-cyan-500/30 px-1.5 py-0">
                Placing: <GameIcon icon={BUILDING_DEFS[selectedBuildType]?.icon} size={14} className="inline-flex" /> {BUILDING_DEFS[selectedBuildType]?.name}
              </Badge>
            )}
            {buildMode && !selectedBuildType && (
              <span className="text-[9px] text-gray-500">Select a building type below, then click on the map to place</span>
            )}
            {buildMode && (
              <Button variant="ghost" size="sm" className="h-7 text-[10px] text-red-400 hover:text-red-300" onClick={() => { setBuildMode(false); setSelectedBuildType(null); }}>
                <X className="w-3 h-3 mr-1" /> Cancel
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Auto Connect toggle */}
            <Button
              variant={autoConnectEnabled ? 'default' : 'outline'}
              size="sm"
              className={`h-6 w-6 p-0 ${autoConnectEnabled ? 'bg-cyan-700 text-white' : 'text-gray-400'}`}
              onClick={() => setAutoConnectEnabled(!autoConnectEnabled)}
              title="Auto Connect: Automatically link buildings by production chain"
            >
              <GitBranch className="w-3 h-3" />
            </Button>
            {/* Auto Arrange button */}
            <Button
              variant="outline"
              size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-cyan-400"
              onClick={autoArrange}
              title="Auto Arrange: Reorganize buildings by production chain"
            >
              <LayoutGrid className="w-3 h-3" />
            </Button>
            {/* Connection count badge */}
            {autoConnectEnabled && autoConnections.length > 0 && (
              <Badge className="text-[7px] px-1 py-0 h-4 bg-cyan-900/40 text-cyan-400 border border-cyan-500/30">
                {autoConnections.length}
              </Badge>
            )}
            <div className="w-px h-4 bg-gray-800" />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={() => setShowConnections(!showConnections)} title="Toggle connection visibility">
              <Eye className="w-3 h-3" />
            </Button>
            <div className="w-px h-4 bg-gray-800" />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={handleZoomOut} title="Zoom out">
              <ZoomOut className="w-3 h-3" />
            </Button>
            <span className="text-[9px] text-gray-500 font-mono w-8 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={handleZoomIn} title="Zoom in">
              <ZoomIn className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={handleResetView} title="Reset view">
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Build palette (only in build mode) */}
        <>
          {buildMode && (
            <div
              className="overflow-hidden"
            >
              <div className="px-3 py-2 space-y-2">
                {/* Search/Filter input */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                  <Input
                    value={buildSearch}
                    onChange={(e) => setBuildSearch(e.target.value)}
                    placeholder="Search buildings..."
                    className="h-6 text-[10px] pl-7 pr-2 bg-[#0a0e17] border-gray-700/50 text-gray-300 placeholder:text-gray-600 focus:border-cyan-800/50"
                  />
                </div>

                {/* Recently Used section */}
                {recentlyUsed.length > 0 && !buildSearch.trim() && (
                  <div>
                    <div className="flex items-center gap-1 text-[10px] text-cyan-500/70 mb-1">
                      <Clock className="w-2.5 h-2.5" />
                      Recently Used
                    </div>
                    <div className="flex flex-wrap gap-1.5 ml-4">
                      {recentlyUsed.map(type => {
                        const def = BUILDING_DEFS[type];
                        if (!def) return null;
                        const affordable = isBuildAffordable(type);
                        const unlocked = isBuildUnlocked(type);
                        if (!unlocked) return null;
                        const isSelected = selectedBuildType === type;
                        const cost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 0;

                        return (
                          <button
                            key={`recent-${type}`}
                            className={`
                              relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-center
                              ${isSelected ? 'border-cyan-400 bg-cyan-900/30 shadow-[0_0_10px_rgba(0,255,242,0.3)]' : 'border-cyan-800/30 bg-cyan-900/10 hover:border-cyan-700/50'}
                              ${!affordable ? 'opacity-60' : ''}
                            `}
                            onClick={() => setSelectedBuildType(isSelected ? null : type)}
                          >
                            <GameIcon icon={def.icon} size={20} />
                            <span className="text-[8px] text-gray-400 leading-tight max-w-[48px] truncate">{def.name}</span>
                            <span className={`text-[7px] font-mono ${affordable ? 'text-green-400' : 'text-red-400'}`}>${formatNumber(cost)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredCategories.map((cat, catIdx) => (
                  <div key={catIdx}>
                    <button
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-300 mb-1"
                      onClick={() => setPaletteCategory(paletteCategory === catIdx ? -1 : catIdx)}
                    >
                      {paletteCategory === catIdx ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {cat.label}
                    </button>
                    {paletteCategory === catIdx && (
                      <div className="flex flex-wrap gap-1.5 ml-4">
                        {cat.types.map(type => {
                          const def = BUILDING_DEFS[type];
                          if (!def) return null;
                          const affordable = isBuildAffordable(type);
                          const unlocked = isBuildUnlocked(type);
                          const isSelected = selectedBuildType === type;
                          const cost = def.baseCost.find(c => c.resource === 'money')?.amount ?? 0;
                          const count = store.buildings.filter(b => b.type === type).length;

                          return (
                            <Tooltip key={type}>
                              <TooltipTrigger asChild>
                                <button
                                  className={`
                                    relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-center
                                    ${isSelected ? 'border-cyan-400 bg-cyan-900/30 shadow-[0_0_10px_rgba(0,255,242,0.3)]' : ''}
                                    ${!unlocked ? 'border-gray-800 bg-gray-900/20 opacity-40' : ''}
                                    ${unlocked && !isSelected ? 'border-gray-700 bg-gray-800/30 hover:border-gray-600 hover:bg-gray-800/50' : ''}
                                    ${!affordable && unlocked ? 'opacity-60' : ''}
                                  `}
                                  onClick={() => {
                                    if (!unlocked) return;
                                    setSelectedBuildType(isSelected ? null : type);
                                  }}
                                >
                                  <GameIcon icon={def.icon} size={20} />
                                  <span className="text-[8px] text-gray-400 leading-tight max-w-[48px] truncate">{def.name}</span>
                                  <span className={`text-[7px] font-mono ${affordable ? 'text-green-400' : 'text-red-400'}`}>${formatNumber(cost)}</span>
                                  {count > 0 && (
                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gray-800 text-[7px] text-gray-300 flex items-center justify-center border border-gray-600">
                                      {count}
                                    </span>
                                  )}
                                  {!unlocked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 rounded-lg">
                                      <span className="text-[8px] text-red-400"><GameIcon icon="gi:padlock" size={8} /></span>
                                    </div>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-card border-cyan-900/30 w-52 p-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <GameIcon icon={def.icon} size={16} />
                                    <span className="text-xs font-semibold text-cyan-400">{def.name}</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400">{def.description}</p>
                                  <div className="text-[9px] text-gray-500">
                                    Cost: <span className={affordable ? 'text-green-400' : 'text-red-400'}>${formatNumber(cost)}</span>
                                    {def.basePowerConsumption > 0 && <> • Power: <span className="text-yellow-400">-{def.basePowerConsumption}MW</span></>}
                                    {def.basePowerProduction > 0 && <> • Output: <span className="text-yellow-400">+{def.basePowerProduction}MW</span></>}
                                  </div>
                                  {def.outputs && (
                                    <div className="text-[8px] text-gray-500">
                                      Produces: {def.outputs.map(o => <GameIcon key={o.resource} icon={RESOURCE_META[o.resource as keyof typeof RESOURCE_META]?.icon} size={10} className="inline-flex" />)}
                                    </div>
                                  )}
                                  {def.inputs && (
                                    <div className="text-[8px] text-gray-500">
                                      Requires: {def.inputs.map(inp => <GameIcon key={inp.resource} icon={RESOURCE_META[inp.resource as keyof typeof RESOURCE_META]?.icon} size={10} className="inline-flex" />)}
                                    </div>
                                  )}
                                  {!unlocked && (
                                    <div className="text-[9px] text-red-400">
                                      <GameIcon icon="gi:padlock" size={12} className="inline" /> Requires: {def.unlockRequirement?.research ?? 'Unknown'}
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      </div>

      {/* MAP + DETAIL PANEL */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Map Area */}
        <div className="flex-1 game-card rounded-xl bg-[#0a0e17] border border-border overflow-hidden relative" style={{ minHeight: 400 }}>
          {/* Landscape hint for small screens */}
          <div className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 bg-cyan-900/20 border-b border-cyan-800/30 text-[10px] text-cyan-400">
            <GameIcon icon="gi:smartphone" size={14} />
            <span>Use landscape for best experience. Pinch or scroll to zoom.</span>
          </div>
          {/* Scrollable map wrapper for mobile */}
          <div className="overflow-x-auto">
          {/* Weather overlay */}
          {store.weather.current !== 'clear' && (
            <div className={`absolute inset-0 pointer-events-none z-20 transition-opacity duration-1000 ${
              store.weather.current === 'rainy' ? 'bg-blue-900/10' :
              store.weather.current === 'stormy' ? 'bg-purple-900/15' :
              store.weather.current === 'snowy' ? 'bg-sky-100/5' :
              store.weather.current === 'foggy' ? 'bg-gray-500/10' :
              'bg-orange-900/5'
            }`} />
          )}

          {/* Map container with zoom/pan */}
          <div
            ref={mapRef}
            className="w-full h-full overflow-hidden cursor-crosshair min-w-[600px]"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setIsPanning(false); setHoveredCell(null); }}
            style={{ minHeight: 400 }}
          >
            <div
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
                transformOrigin: 'top left',
                transition: isPanning ? 'none' : 'transform 0.2s ease-out',
                width: GRID_COLS * cellWidth,
                height: GRID_ROWS * cellHeight,
              }}
            >
              {/* Connection lines */}
              {showConnections && (
                <ConnectionOverlay
                  connections={autoConnectEnabled ? autoConnections : []}
                  buildingPositions={buildingPositions}
                  cellWidth={cellWidth}
                  cellHeight={cellHeight}
                />
              )}

              {/* Grid */}
              {Array.from({ length: GRID_ROWS }, (_, r) =>
                Array.from({ length: GRID_COLS }, (_, c) => {
                  // Find building at this position
                  const building = store.buildings.find(b => {
                    const pos = buildingPositions.get(b.id);
                    return pos?.row === r && pos?.col === c;
                  });

                  const isHovered = hoveredCell?.row === r && hoveredCell?.col === c;
                  const canPlace = buildMode && selectedBuildType && !building;

                  return (
                    <div
                      key={`${r}-${c}`}
                      className="absolute"
                      style={{
                        left: c * cellWidth,
                        top: r * cellHeight,
                        width: cellWidth,
                        height: cellHeight,
                        padding: 3,
                      }}
                    >
                      {building ? (
                        <MapBuildingTile
                          building={building}
                          isSelected={selectedBuildingId === building.id}
                          onClick={() => {
                            if (buildMode) return;
                            setSelectedBuildingId(prev => prev === building.id ? null : building.id);
                          }}
                          tick={store.gameTick}
                          recentlyUpgraded={upgradedBuildingIds.has(building.id)}
                          connectionEfficiency={buildingConnEfficiency.get(building.id)}
                        />
                      ) : (
                        <div
                          className={`
                            w-full h-full rounded-lg border factory-blueprint-grid
                            ${canPlace && isHovered
                              ? 'border-cyan-500/60 bg-cyan-900/20 shadow-[0_0_10px_rgba(0,255,242,0.2)]'
                              : canPlace
                                ? 'border-gray-700/40 hover:border-gray-600/50 hover:bg-gray-800/20'
                                : 'border-gray-800/20'
                            }
                          `}
                          style={{
                            background: canPlace && isHovered
                              ? undefined
                              : `linear-gradient(135deg, ${getTerrainTint(r).bg}, rgba(10, 15, 26, 0.5))`,
                          }}
                          onClick={() => handleCellClick(r, c)}
                          onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          {/* Build ghost preview */}
                          {canPlace && isHovered && selectedBuildType && BUILDING_DEFS[selectedBuildType] && (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-50" style={{ filter: 'drop-shadow(0 0 6px rgba(0,255,242,0.4))' }}>
                              <GameIcon icon={BUILDING_DEFS[selectedBuildType].icon} size={20} />
                              <span className="text-[7px] text-cyan-400">Place here</span>
                            </div>
                          )}
                          {/* Decorative floor element */}
                          {!canPlace && (
                            <div className="w-full h-full flex items-center justify-center">
                              {getFloorDecoration(r, c)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          </div>{/* end overflow-x-auto wrapper */}

          {/* Grid coordinates overlay */}
          <div className="absolute bottom-1 left-1 flex items-center gap-1 text-[8px] text-gray-600 font-mono">
            <Grid3X3 className="w-2.5 h-2.5" />
            {GRID_COLS}×{GRID_ROWS} • Alt+Drag to pan
          </div>
        </div>

        {/* Right Panel: Selected Building / Quick Stats */}
        <div className="lg:w-64 flex-shrink-0 space-y-3">
          <>
            {selectedBuilding ? (
              <SelectedBuildingPanel
                key={selectedBuilding.id}
                building={selectedBuilding}
                onClose={() => setSelectedBuildingId(null)}
              />
            ) : (
              <div
                className="game-card rounded-xl bg-card p-3 border border-border text-center"
              >
                <MapIcon className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-[10px] text-gray-500">Click a building on the map</p>
                <p className="text-[9px] text-gray-600 mt-0.5">to view details & actions</p>
                <p className="text-[9px] text-gray-600 mt-2">or use <span className="text-emerald-400">Build</span> mode to place new buildings</p>
              </div>
            )}
          </>

          {/* Quick Stats */}
          <div className="game-card rounded-xl bg-card p-3 border border-border">
            <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Factory Stats
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500">Buildings</div>
                <div className="text-sm font-bold text-cyan-400 font-mono">{totalBuildings}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500">Active</div>
                <div className="text-sm font-bold text-green-400 font-mono">{activeBuildings}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500 flex items-center justify-center gap-0.5">
                  <Pickaxe className="w-2 h-2" /> Extract
                </div>
                <div className="text-sm font-bold text-amber-400 font-mono">{extractorCount}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500 flex items-center justify-center gap-0.5">
                  <Factory className="w-2 h-2" /> Factory
                </div>
                <div className="text-sm font-bold text-orange-400 font-mono">{factoryCount}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500 flex items-center justify-center gap-0.5">
                  <Zap className="w-2 h-2" /> Power
                </div>
                <div className="text-sm font-bold text-yellow-400 font-mono">{powerCount}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500">Grid</div>
                <div className="text-[10px] font-bold font-mono">
                  <span className="text-green-400">{formatNumber(store.powerGrid.totalProduction)}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-yellow-400">{formatNumber(store.powerGrid.totalConsumption)}</span>
                </div>
              </div>
            </div>

            {/* Mini Power Bar - production vs consumption */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[8px] text-gray-500 flex items-center gap-0.5">
                  <Flame className="w-2 h-2" /> Power Grid
                </span>
                <span className="text-[8px] font-mono text-gray-400">
                  {store.powerGrid.overload ? (
                    <span className="text-red-400">OVERLOAD</span>
                  ) : store.powerGrid.totalConsumption > 0 ? (
                    <>
                      <span className="text-green-400">{formatNumber(store.powerGrid.totalProduction)}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-yellow-400">{formatNumber(store.powerGrid.totalConsumption)}</span> MW
                    </>
                  ) : (
                    <span className="text-gray-600">NO GRID</span>
                  )}
                </span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden relative">
                {/* Consumption bar (background) */}
                <div
                  className="absolute inset-y-0 left-0 bg-yellow-600/40 rounded-full transition-all duration-500"
                  style={{
                    width: store.powerGrid.totalProduction > 0
                      ? `${Math.min(100, (store.powerGrid.totalConsumption / store.powerGrid.totalProduction) * 100)}%`
                      : '0%',
                  }}
                />
                {/* Production bar (foreground) */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, store.powerGrid.totalProduction > 0 && store.powerGrid.totalConsumption > 0
                      ? Math.min(100, (store.powerGrid.totalProduction / Math.max(store.powerGrid.totalProduction, store.powerGrid.totalConsumption)) * 100)
                      : store.powerGrid.totalProduction > 0 ? 100 : 0)}%`,
                    backgroundColor: store.powerGrid.overload ? '#f87171' : '#4ade80',
                  }}
                />
              </div>
            </div>

            {/* Efficiency with color coding */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[8px] text-gray-500">Efficiency</span>
                <span className="text-[8px] font-mono" style={{ color: getEffColor(store.powerGrid.efficiency) }}>
                  {Math.round(store.powerGrid.efficiency * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(store.powerGrid.efficiency * 100)}%`,
                    backgroundColor: getEffColor(store.powerGrid.efficiency),
                  }}
                />
              </div>
            </div>

            {/* Tick rate indicator + Balance */}
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500 flex items-center justify-center gap-0.5">
                  <Clock className="w-2 h-2" /> Tick Rate
                </div>
                <div className={`text-[10px] font-bold font-mono ${store.paused ? 'text-red-400' : 'text-cyan-400'}`}>
                  {store.paused ? <GameIcon icon="gi:pause-button" size={14} className="inline" /> : `${store.gameSpeed}x`}
                </div>
              </div>
              <div className="bg-[#0a0e17] rounded-lg p-1.5 text-center">
                <div className="text-[8px] text-gray-500">Balance</div>
                <div className="text-[10px] font-bold text-green-400 font-mono">${formatNumber(store.money)}</div>
              </div>
            </div>

            {/* Connection Stats */}
            <div className="mt-2 pt-2 border-t border-gray-800/30">
              <div className="flex items-center gap-2 text-[9px]">
                <GitBranch className="w-3 h-3 text-cyan-400" />
                <span className="text-cyan-400">{autoConnections.length}</span>
                <span className="text-gray-500">connections</span>
                {autoConnections.length > 0 && (
                  <>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-500">avg eff</span>
                    <span className={avgEfficiency >= 0.8 ? 'text-green-400' : avgEfficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'}>
                      {Math.round(avgEfficiency * 100)}%
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="game-card rounded-xl bg-card p-3 border border-border">
            <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Legend</h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-3 rounded-sm bg-amber-900/60 border border-amber-500/40" />
                <span className="text-gray-400">Extractors</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-3 rounded-sm bg-cyan-900/60 border border-cyan-500/40" />
                <span className="text-gray-400">T1 Factory</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-3 rounded-sm bg-orange-900/60 border border-orange-500/40" />
                <span className="text-gray-400">T2 Factory</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-3 rounded-sm bg-purple-900/60 border border-purple-500/40" />
                <span className="text-gray-400">T3 Factory</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-3 rounded-sm bg-yellow-900/60 border border-yellow-500/40" />
                <span className="text-gray-400">Power</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] mt-1 pt-1 border-t border-gray-800/30">
                <div className="w-4 h-0.5 bg-yellow-400/40 rounded" style={{ borderTop: '1px dashed rgba(250,204,21,0.4)' }} />
                <span className="text-gray-500">Power Lines</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-0.5 bg-cyan-400/30 rounded" />
                <span className="text-gray-500">Resource Flow</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] mt-1 pt-1 border-t border-gray-800/30">
                <div className="w-4 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, rgba(146, 64, 14, 0.15), rgba(10, 15, 26, 0.3))' }} />
                <span className="text-gray-500">Extraction Zone</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, rgba(22, 78, 99, 0.15), rgba(10, 15, 26, 0.3))' }} />
                <span className="text-gray-500">Industrial Zone</span>
              </div>
              <div className="flex items-center gap-2 text-[9px]">
                <div className="w-4 h-3 rounded-sm" style={{ background: 'linear-gradient(135deg, rgba(113, 63, 18, 0.15), rgba(10, 15, 26, 0.3))' }} />
                <span className="text-gray-500">Power Zone</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
