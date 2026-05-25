'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import { BuildingInstance, BuildingType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Map, Zap, ChevronUp, Activity, Factory, Pickaxe,
  Hammer, X, RotateCcw, Power, PowerOff,
  ZoomIn, ZoomOut, Grid3X3, Eye, Sun, Cloud, CloudRain,
  CloudLightning, CloudFog, Snowflake, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// --- Constants ---
const GRID_COLS = 16;
const GRID_ROWS = 12;

// --- Category Color Mapping ---
const CATEGORY_STYLES: Record<string, { bg: string; border: string; glow: string; text: string; fill: string }> = {
  extractor: { bg: 'bg-amber-900/50', border: 'border-amber-500/50', glow: 'shadow-amber-500/30', text: 'text-amber-400', fill: '#92400e' },
  factory_t1: { bg: 'bg-cyan-900/50', border: 'border-cyan-500/50', glow: 'shadow-cyan-500/30', text: 'text-cyan-400', fill: '#164e63' },
  factory_t2: { bg: 'bg-orange-900/50', border: 'border-orange-500/50', glow: 'shadow-orange-500/30', text: 'text-orange-400', fill: '#7c2d12' },
  factory_t3: { bg: 'bg-purple-900/50', border: 'border-purple-500/50', glow: 'shadow-purple-500/30', text: 'text-purple-400', fill: '#581c87' },
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
    label: '⛏️ Extraction',
    types: ['miningDrill', 'oilPump', 'waterExtractor', 'quarry'] as BuildingType[],
  },
  {
    label: '🔥 T1 Factory',
    types: ['smelter', 'wireMill', 'chemicalPlant', 'glassFurnace', 'steelForge', 'carbonProcessor'] as BuildingType[],
  },
  {
    label: '⚙️ T2 Factory',
    types: ['gearFactory', 'circuitFactory', 'engineFactory', 'batteryFactory'] as BuildingType[],
  },
  {
    label: '🧪 T3 Factory',
    types: ['aiLab', 'roboticsBay', 'quantumLab', 'alloyForge', 'nanoLab'] as BuildingType[],
  },
  {
    label: '⚡ Power',
    types: ['coalGenerator', 'solarPanel', 'windTurbine', 'nuclearReactor', 'fusionReactor'] as BuildingType[],
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

// --- Grid cell position tracking in store ---
// We use a separate map from building.id -> {row, col} stored in component state
// This way we don't need to modify the store schema

interface BuildingPosition {
  row: number;
  col: number;
}

// --- Building Tile on the Map ---
function MapBuildingTile({
  building,
  isSelected,
  onClick,
  tick,
}: {
  building: BuildingInstance;
  isSelected: boolean;
  onClick: () => void;
  tick: number;
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
            relative w-full h-full rounded-md border-2 cursor-pointer transition-all duration-200 overflow-hidden select-none
            ${style.bg} ${isSelected ? 'ring-2 ring-cyan-400 shadow-[0_0_20px_rgba(0,255,242,0.6)]' : ''}
            ${!building.active ? 'opacity-40 grayscale' : 'hover:brightness-125 hover:scale-[1.05]'}
          `}
          style={{ borderColor: isSelected ? '#22d3ee' : style.fill }}
          whileTap={{ scale: 0.92 }}
          animate={building.active ? {
            boxShadow: isPower
              ? [`0 0 6px rgba(250,204,21,0.2)`, `0 0 16px rgba(250,204,21,0.5)`, `0 0 6px rgba(250,204,21,0.2)`]
              : [`0 0 3px rgba(0,255,242,0.1)`, `0 0 8px rgba(0,255,242,0.3)`, `0 0 3px rgba(0,255,242,0.1)`],
          } : {}}
          transition={building.active ? { boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' } } : {}}
        >
          {/* Power glow */}
          {isPower && building.active && (
            <div className="absolute inset-0 bg-yellow-400/10 animate-factory-map-glow" />
          )}

          {/* Production particles */}
          {building.active && building.efficiency > 0.5 && def.outputs && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {def.outputs.slice(0, 2).map((output, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: RESOURCE_META[output.resource as keyof typeof RESOURCE_META]?.color ?? '#00fff2',
                    left: `${20 + i * 40}%`,
                  }}
                  animate={{ y: [0, -10, -18], opacity: [0, 0.8, 0] }}
                  transition={{
                    duration: 1.5 + i * 0.3,
                    repeat: Infinity,
                    delay: (tick % 100) * 0.01 + i * 0.5,
                    ease: 'easeOut',
                  }}
                />
              ))}
            </div>
          )}

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-0.5 gap-0">
            {/* Emoji */}
            <span className="text-lg leading-none">{def.emoji}</span>
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
          </div>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-[#111827] border-cyan-900/30 w-48 p-2">
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm">{def.emoji}</span>
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
}

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
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b] space-y-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{def.emoji}</span>
          <div>
            <h3 className={`text-sm font-semibold ${style.text}`}>{def.name}</h3>
            <p className="text-[10px] text-gray-500">
              Lv {building.level} • {building.active ? '🟢 Active' : '🔴 Off'}
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
        <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Efficiency</div>
          <div className="text-sm font-bold font-mono" style={{ color: getEffColor(building.efficiency) }}>
            {Math.round(building.efficiency * 100)}%
          </div>
        </div>
        <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
          <div className="text-[8px] text-gray-500">Power</div>
          <div className="text-sm font-bold font-mono text-yellow-400">
            {def.basePowerProduction > 0
              ? `+${def.basePowerProduction * building.level}MW`
              : `-${def.basePowerConsumption * building.level}MW`}
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
              const rate = output.amount * building.level * building.efficiency;
              return (
                <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded px-1.5 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px]">{meta?.emoji ?? ''}</span>
                    <span className="text-[9px]" style={{ color: meta?.color }}>{meta?.name ?? output.resource}</span>
                  </div>
                  <span className="text-[9px] text-green-400 font-mono">+{formatNumber(rate)}/t</span>
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
                    <span className="text-[10px]">{meta?.emoji ?? ''}</span>
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
    </motion.div>
  );
}

// --- Connection Lines Overlay ---
function ConnectionOverlay({
  buildingPositions,
  buildings,
  cellWidth,
  cellHeight,
}: {
  buildingPositions: Map<string, BuildingPosition>;
  buildings: BuildingInstance[];
  cellWidth: number;
  cellHeight: number;
}) {
  // Power lines from power plants to consumers
  const powerPlants = buildings.filter(b => {
    const def = BUILDING_DEFS[b.type];
    return def?.category === 'power' && b.active;
  });
  const consumers = buildings.filter(b => {
    const def = BUILDING_DEFS[b.type];
    return def && def.category !== 'power' && def.basePowerConsumption > 0 && b.active;
  });

  const lines: { x1: number; y1: number; x2: number; y2: number; type: 'power' | 'flow' }[] = [];

  // Power lines
  powerPlants.forEach(pp => {
    const ppPos = buildingPositions.get(pp.id);
    if (!ppPos) return;
    // Connect to nearest 3 consumers
    const nearest = consumers
      .map(c => {
        const cPos = buildingPositions.get(c.id);
        if (!cPos) return null;
        return { ...cPos, dist: Math.abs(cPos.row - ppPos.row) + Math.abs(cPos.col - ppPos.col) };
      })
      .filter(Boolean)
      .sort((a, b) => (a?.dist ?? 0) - (b?.dist ?? 0))
      .slice(0, 3);

    nearest.forEach(c => {
      if (!c) return;
      lines.push({
        x1: (ppPos.col + 0.5) * cellWidth,
        y1: (ppPos.row + 0.5) * cellHeight,
        x2: (c.col + 0.5) * cellWidth,
        y2: (c.row + 0.5) * cellHeight,
        type: 'power',
      });
    });
  });

  // Resource flow lines (adjacent buildings in same row/col)
  const activeBuildings = buildings.filter(b => b.active);
  for (let i = 0; i < activeBuildings.length; i++) {
    const a = activeBuildings[i];
    const aPos = buildingPositions.get(a.id);
    if (!aPos) continue;
    const aDef = BUILDING_DEFS[a.type];
    if (!aDef?.outputs) continue;

    for (let j = i + 1; j < activeBuildings.length; j++) {
      const b = activeBuildings[j];
      const bPos = buildingPositions.get(b.id);
      if (!bPos) continue;
      const bDef = BUILDING_DEFS[b.type];
      if (!bDef?.inputs) continue;

      // Check if a's outputs feed b's inputs
      const hasConnection = aDef.outputs.some(o =>
        bDef.inputs?.some(inp => inp.resource === o.resource)
      );

      if (hasConnection) {
        const dist = Math.abs(aPos.row - bPos.row) + Math.abs(aPos.col - bPos.col);
        if (dist <= 4) {
          lines.push({
            x1: (aPos.col + 0.5) * cellWidth,
            y1: (aPos.row + 0.5) * cellHeight,
            x2: (bPos.col + 0.5) * cellWidth,
            y2: (bPos.row + 0.5) * cellHeight,
            type: 'flow',
          });
        }
      }
    }
  }

  if (lines.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none z-0" width={GRID_COLS * cellWidth} height={GRID_ROWS * cellHeight}>
      {lines.map((line, i) => (
        <g key={i}>
          {line.type === 'power' ? (
            <line
              x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
              stroke="rgba(250, 204, 21, 0.15)" strokeWidth="1.5" strokeDasharray="6 4"
            >
              <animate attributeName="strokeDashoffset" from="0" to="-10" dur="1s" repeatCount="indefinite" />
            </line>
          ) : (
            <>
              <line
                x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}
                stroke="rgba(0, 255, 242, 0.1)" strokeWidth="2"
              />
              <circle r="2" fill="rgba(0, 255, 242, 0.5)">
                <animateMotion dur="2s" repeatCount="indefinite" path={`M${line.x1},${line.y1} L${line.x2},${line.y2}`} />
              </circle>
            </>
          )}
        </g>
      ))}
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
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="space-y-3">
      {/* HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-emerald-400 tracking-wide flex items-center gap-2">
            <Map className="w-5 h-5" />
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
      <div className="game-card rounded-xl bg-[#111827] border border-[#1e293b] overflow-hidden">
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
                Placing: {BUILDING_DEFS[selectedBuildType]?.emoji} {BUILDING_DEFS[selectedBuildType]?.name}
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
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400" onClick={() => setShowConnections(!showConnections)} title="Toggle connections">
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
        <AnimatePresence>
          {buildMode && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-3 py-2 space-y-2">
                {BUILD_CATEGORIES.map((cat, catIdx) => (
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
                                    relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md border transition-all text-center
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
                                  <span className="text-lg leading-none">{def.emoji}</span>
                                  <span className="text-[8px] text-gray-400 leading-tight max-w-[48px] truncate">{def.name}</span>
                                  <span className="text-[7px] text-green-500/70 font-mono">${formatNumber(cost)}</span>
                                  {count > 0 && (
                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gray-800 text-[7px] text-gray-300 flex items-center justify-center border border-gray-600">
                                      {count}
                                    </span>
                                  )}
                                  {!unlocked && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 rounded-md">
                                      <span className="text-[8px] text-red-400">🔒</span>
                                    </div>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-[#111827] border-cyan-900/30 w-52 p-2">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span>{def.emoji}</span>
                                    <span className="text-xs font-semibold text-cyan-400">{def.name}</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400">{def.description}</p>
                                  <div className="text-[9px] text-gray-500">
                                    Cost: <span className="text-green-400">${formatNumber(cost)}</span>
                                    {def.basePowerConsumption > 0 && <> • Power: <span className="text-yellow-400">-{def.basePowerConsumption}MW</span></>}
                                    {def.basePowerProduction > 0 && <> • Output: <span className="text-yellow-400">+{def.basePowerProduction}MW</span></>}
                                  </div>
                                  {def.outputs && (
                                    <div className="text-[8px] text-gray-500">
                                      Produces: {def.outputs.map(o => RESOURCE_META[o.resource as keyof typeof RESOURCE_META]?.emoji).join(' ')}
                                    </div>
                                  )}
                                  {def.inputs && (
                                    <div className="text-[8px] text-gray-500">
                                      Requires: {def.inputs.map(inp => RESOURCE_META[inp.resource as keyof typeof RESOURCE_META]?.emoji).join(' ')}
                                    </div>
                                  )}
                                  {!unlocked && (
                                    <div className="text-[9px] text-red-400">
                                      🔒 Requires: {def.unlockRequirement?.research ?? 'Unknown'}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MAP + DETAIL PANEL */}
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Map Area */}
        <div className="flex-1 game-card rounded-xl bg-[#0d1220] border border-[#1e293b] overflow-hidden relative" style={{ minHeight: 400 }}>
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
            className="w-full h-full overflow-hidden cursor-crosshair"
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
                  buildingPositions={buildingPositions}
                  buildings={store.buildings}
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
                        />
                      ) : (
                        <div
                          className={`
                            w-full h-full rounded-md border transition-all duration-150
                            ${canPlace && isHovered
                              ? 'border-cyan-500/60 bg-cyan-900/20 shadow-[0_0_10px_rgba(0,255,242,0.2)]'
                              : canPlace
                                ? 'border-gray-700/40 bg-gray-900/20 hover:border-gray-600/50 hover:bg-gray-800/20'
                                : 'border-gray-800/20 bg-[#0a0f1a]/50'
                            }
                          `}
                          onClick={() => handleCellClick(r, c)}
                          onMouseEnter={() => setHoveredCell({ row: r, col: c })}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          {/* Build preview */}
                          {canPlace && isHovered && selectedBuildType && BUILDING_DEFS[selectedBuildType] && (
                            <div className="w-full h-full flex flex-col items-center justify-center opacity-50">
                              <span className="text-lg">{BUILDING_DEFS[selectedBuildType].emoji}</span>
                              <span className="text-[7px] text-cyan-400">Place here</span>
                            </div>
                          )}
                          {/* Grid dot */}
                          {!canPlace && (
                            <div className="w-full h-full flex items-center justify-center">
                              <div className="w-1 h-1 rounded-full bg-gray-800/50" />
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

          {/* Grid coordinates overlay */}
          <div className="absolute bottom-1 left-1 flex items-center gap-1 text-[8px] text-gray-600 font-mono">
            <Grid3X3 className="w-2.5 h-2.5" />
            {GRID_COLS}×{GRID_ROWS} • Alt+Drag to pan
          </div>
        </div>

        {/* Right Panel: Selected Building / Quick Stats */}
        <div className="lg:w-64 flex-shrink-0 space-y-3">
          <AnimatePresence mode="wait">
            {selectedBuilding ? (
              <SelectedBuildingPanel
                key={selectedBuilding.id}
                building={selectedBuilding}
                onClose={() => setSelectedBuildingId(null)}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b] text-center"
              >
                <Map className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-[10px] text-gray-500">Click a building on the map</p>
                <p className="text-[9px] text-gray-600 mt-0.5">to view details & actions</p>
                <p className="text-[9px] text-gray-600 mt-2">or use <span className="text-emerald-400">Build</span> mode to place new buildings</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Stats */}
          <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
            <h4 className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Factory Stats
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
                <div className="text-[8px] text-gray-500">Buildings</div>
                <div className="text-sm font-bold text-cyan-400 font-mono">{totalBuildings}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
                <div className="text-[8px] text-gray-500">Active</div>
                <div className="text-sm font-bold text-green-400 font-mono">{activeBuildings}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
                <div className="text-[8px] text-gray-500 flex items-center justify-center gap-0.5">
                  <Pickaxe className="w-2 h-2" /> Extract
                </div>
                <div className="text-sm font-bold text-amber-400 font-mono">{extractorCount}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
                <div className="text-[8px] text-gray-500 flex items-center justify-center gap-0.5">
                  <Factory className="w-2 h-2" /> Factory
                </div>
                <div className="text-sm font-bold text-orange-400 font-mono">{factoryCount}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
                <div className="text-[8px] text-gray-500 flex items-center justify-center gap-0.5">
                  <Zap className="w-2 h-2" /> Power
                </div>
                <div className="text-sm font-bold text-yellow-400 font-mono">{powerCount}</div>
              </div>
              <div className="bg-[#0a0e17] rounded-md p-1.5 text-center">
                <div className="text-[8px] text-gray-500">Grid</div>
                <div className="text-[10px] font-bold font-mono">
                  <span className="text-green-400">{formatNumber(store.powerGrid.totalProduction)}</span>
                  <span className="text-gray-600">/</span>
                  <span className="text-yellow-400">{formatNumber(store.powerGrid.totalConsumption)}</span>
                </div>
              </div>
            </div>

            {/* Power efficiency bar */}
            <div className="mt-2">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[8px] text-gray-500">Power Efficiency</span>
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

            {/* Income/min */}
            <div className="mt-2 bg-[#0a0e17] rounded-md p-1.5 text-center">
              <div className="text-[8px] text-gray-500">Balance / Income</div>
              <div className="text-sm font-bold text-green-400 font-mono">${formatNumber(store.money)}</div>
            </div>
          </div>

          {/* Legend */}
          <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
