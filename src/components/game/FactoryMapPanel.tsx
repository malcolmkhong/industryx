'use client';

import { useMemo, useState } from 'react';
import { useGameStore, formatNumber } from '@/lib/game/store';
import { BUILDING_DEFS, RESOURCE_META } from '@/lib/game/data';
import { BuildingInstance, BuildingType } from '@/lib/game/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Map, Zap, ArrowUpRight, Power, PowerOff,
  ChevronUp, Activity, Factory, Pickaxe,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// --- Category Color Mapping ---
const CATEGORY_COLORS: Record<string, { bg: string; border: string; glow: string; text: string }> = {
  extractor: { bg: 'bg-amber-900/40', border: 'border-amber-500/40', glow: 'shadow-amber-500/20', text: 'text-amber-400' },
  factory_t1: { bg: 'bg-cyan-900/40', border: 'border-cyan-500/40', glow: 'shadow-cyan-500/20', text: 'text-cyan-400' },
  factory_t2: { bg: 'bg-orange-900/40', border: 'border-orange-500/40', glow: 'shadow-orange-500/20', text: 'text-orange-400' },
  factory_t3: { bg: 'bg-purple-900/40', border: 'border-purple-500/40', glow: 'shadow-purple-500/20', text: 'text-purple-400' },
  power: { bg: 'bg-yellow-900/40', border: 'border-yellow-500/40', glow: 'shadow-yellow-500/20', text: 'text-yellow-400' },
};

function getCategoryStyle(building: BuildingInstance) {
  const def = BUILDING_DEFS[building.type];
  if (!def) return CATEGORY_COLORS.extractor;
  if (def.category === 'extractor') return CATEGORY_COLORS.extractor;
  if (def.category === 'power') return CATEGORY_COLORS.power;
  if (def.category === 'factory') {
    if (def.tier === 1) return CATEGORY_COLORS.factory_t1;
    if (def.tier === 2) return CATEGORY_COLORS.factory_t2;
    return CATEGORY_COLORS.factory_t3;
  }
  return CATEGORY_COLORS.extractor;
}

function getEfficiencyColor(efficiency: number): string {
  if (efficiency >= 0.8) return 'border-green-400/70';
  if (efficiency >= 0.5) return 'border-yellow-400/70';
  return 'border-red-400/70';
}

function getEfficiencyBarColor(efficiency: number): string {
  if (efficiency >= 0.8) return 'bg-green-500';
  if (efficiency >= 0.5) return 'bg-yellow-500';
  return 'bg-red-500';
}

// --- Grid Layout Logic ---
// Arrange buildings: extractors at top, factories in middle, power at bottom
interface GridCell {
  building: BuildingInstance | null;
  row: number;
  col: number;
}

function computeGridLayout(buildings: BuildingInstance[]): { grid: GridCell[][]; cols: number; rows: number } {
  if (buildings.length === 0) {
    return { grid: [], cols: 6, rows: 4 };
  }

  // Categorize buildings
  const extractors = buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor');
  const factories = buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory');
  const powerPlants = buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power');

  // Sort each category by type for logical grouping
  extractors.sort((a, b) => a.type.localeCompare(b.type));
  factories.sort((a, b) => {
    const ta = BUILDING_DEFS[a.type]?.tier ?? 0;
    const tb = BUILDING_DEFS[b.type]?.tier ?? 0;
    return ta - tb || a.type.localeCompare(b.type);
  });
  powerPlants.sort((a, b) => a.type.localeCompare(b.type));

  // Calculate grid dimensions
  const totalBuildings = buildings.length;
  let cols = Math.max(6, Math.min(12, Math.ceil(Math.sqrt(totalBuildings * 1.5))));
  let rows = Math.max(4, Math.min(8, Math.ceil(totalBuildings / cols)));

  // Ensure enough rows for 3 categories
  const needsRows = (extractors.length > 0 ? 1 : 0) + (factories.length > 0 ? 1 : 0) + (powerPlants.length > 0 ? 1 : 0);
  rows = Math.max(rows, needsRows);

  // Ensure enough cells
  while (cols * rows < totalBuildings) {
    if (cols <= rows) cols = Math.min(12, cols + 1);
    else rows = Math.min(8, rows + 1);
  }

  // Place buildings into the grid
  const grid: GridCell[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ({ building: null as BuildingInstance | null, row: r, col: c }))
  );

  let currentRow = 0;

  // Place extractors at top
  if (extractors.length > 0) {
    let col = 0;
    for (const b of extractors) {
      if (col >= cols) { col = 0; currentRow++; }
      if (currentRow >= rows) break;
      grid[currentRow][col].building = b;
      col++;
    }
    currentRow++;
  }

  // Place factories in middle
  if (factories.length > 0) {
    let col = 0;
    for (const b of factories) {
      if (col >= cols) { col = 0; currentRow++; }
      if (currentRow >= rows) break;
      grid[currentRow][col].building = b;
      col++;
    }
    currentRow++;
  }

  // Place power plants at bottom
  if (powerPlants.length > 0) {
    let col = 0;
    for (const b of powerPlants) {
      if (col >= cols) { col = 0; currentRow++; }
      if (currentRow >= rows) break;
      grid[currentRow][col].building = b;
      col++;
    }
  }

  return { grid, cols, rows };
}

// --- Building Tile Component ---
function BuildingTile({
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
  const effColor = getEfficiencyColor(building.efficiency);
  const effBarColor = getEfficiencyBarColor(building.efficiency);
  const isPower = def.category === 'power';
  const consumesPower = def.basePowerConsumption > 0;
  const producesPower = def.basePowerProduction > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          onClick={onClick}
          className={`
            relative w-full aspect-square rounded-lg border-2 transition-all duration-200 overflow-hidden
            ${style.bg} ${effColor}
            ${!building.active ? 'opacity-40 grayscale' : ''}
            ${isSelected ? 'ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(0,255,242,0.5)] z-10' : ''}
            hover:brightness-125 hover:scale-105
          `}
          whileTap={{ scale: 0.95 }}
          animate={building.active ? {
            boxShadow: isPower
              ? ['0 0 4px rgba(250,204,21,0.2)', '0 0 12px rgba(250,204,21,0.4)', '0 0 4px rgba(250,204,21,0.2)']
              : ['0 0 2px rgba(0,255,242,0.1)', '0 0 6px rgba(0,255,242,0.2)', '0 0 2px rgba(0,255,242,0.1)'],
          } : {}}
          transition={building.active ? {
            boxShadow: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
          } : {}}
        >
          {/* Power generator yellow glow overlay */}
          {isPower && building.active && (
            <div className="absolute inset-0 bg-yellow-400/10 animate-factory-map-glow" />
          )}

          {/* Production particles */}
          {building.active && building.efficiency > 0.5 && def.outputs && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {def.outputs.map((output, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: RESOURCE_META[output.resource as keyof typeof RESOURCE_META]?.color ?? '#00fff2',
                    left: `${20 + i * 25}%`,
                  }}
                  animate={{
                    y: [0, -12, -20],
                    opacity: [0, 0.8, 0],
                  }}
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
          <div className="relative z-10 flex flex-col items-center justify-center h-full p-0.5">
            {/* Top row: emoji + level badge */}
            <div className="flex items-start justify-between w-full">
              <span className="text-sm leading-none mt-0.5">{def.emoji}</span>
              <Badge className="text-[7px] px-1 py-0 h-3 min-w-[14px] bg-gray-800/80 text-gray-300 border-gray-600/50">
                Lv{building.level}
              </Badge>
            </div>

            {/* Efficiency bar */}
            <div className="w-full h-1 bg-gray-800/60 rounded-full mt-1 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${effBarColor}`}
                style={{ width: `${Math.round(building.efficiency * 100)}%` }}
              />
            </div>

            {/* Efficiency text */}
            <div className="text-[8px] text-gray-400 font-mono mt-0.5">
              {Math.round(building.efficiency * 100)}%
            </div>

            {/* Power indicator */}
            {consumesPower && (
              <Zap className="w-2 h-2 text-yellow-500/60 absolute bottom-0.5 right-0.5" />
            )}
            {producesPower && (
              <Zap className="w-2.5 h-2.5 text-yellow-400 absolute bottom-0.5 right-0.5 animate-factory-map-spark" />
            )}
          </div>
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-[#111827] border-cyan-900/30 w-56 p-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-base">{def.emoji}</span>
              <span className={`text-xs font-semibold ${style.text}`}>{def.name}</span>
            </div>
            <Badge variant="outline" className="text-[9px] border-gray-600 text-gray-400">
              Lv {building.level}
            </Badge>
          </div>
          <p className="text-[10px] text-gray-400">{def.description}</p>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <div>
              <span className="text-gray-500">Efficiency</span>
              <span className={`ml-1 font-mono ${building.efficiency >= 0.8 ? 'text-green-400' : building.efficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                {Math.round(building.efficiency * 100)}%
              </span>
            </div>
            <div>
              <span className="text-gray-500">Status</span>
              <span className={`ml-1 ${building.active ? 'text-green-400' : 'text-red-400'}`}>
                {building.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {consumesPower && (
              <div>
                <span className="text-gray-500">Power</span>
                <span className="ml-1 text-yellow-400 font-mono">-{def.basePowerConsumption * building.level}MW</span>
              </div>
            )}
            {producesPower && (
              <div>
                <span className="text-gray-500">Output</span>
                <span className="ml-1 text-yellow-400 font-mono">+{def.basePowerProduction * building.level}MW</span>
              </div>
            )}
          </div>
          {def.outputs && (
            <div className="border-t border-gray-800 pt-1">
              <span className="text-[9px] text-gray-500">Produces: </span>
              {def.outputs.map((o, i) => {
                const meta = RESOURCE_META[o.resource as keyof typeof RESOURCE_META];
                return (
                  <span key={i} className="text-[9px] mr-1.5">
                    {meta?.emoji ?? ''} <span style={{ color: meta?.color }}>{meta?.name ?? o.resource}</span>
                  </span>
                );
              })}
            </div>
          )}
          {def.inputs && (
            <div>
              <span className="text-[9px] text-gray-500">Requires: </span>
              {def.inputs.map((inp, i) => {
                const meta = RESOURCE_META[inp.resource as keyof typeof RESOURCE_META];
                return (
                  <span key={i} className="text-[9px] mr-1.5">
                    {meta?.emoji ?? ''} <span style={{ color: meta?.color }}>{meta?.name ?? inp.resource}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// --- Empty Cell Component ---
function EmptyCell() {
  return (
    <div className="w-full aspect-square rounded-lg border border-gray-800/30 bg-gray-900/20 flex items-center justify-center">
      <div className="w-1 h-1 rounded-full bg-gray-800/40" />
    </div>
  );
}

// --- Power Line SVG Overlay ---
function PowerLineOverlay({
  grid,
  cols,
  rows,
  cellSize,
}: {
  grid: GridCell[][];
  cols: number;
  rows: number;
  cellSize: number;
}) {
  const powerCells: { row: number; col: number }[] = [];
  const consumerCells: { row: number; col: number }[] = [];

  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell.building) return;
      const def = BUILDING_DEFS[cell.building.type];
      if (!def) return;
      if (def.category === 'power') powerCells.push({ row: r, col: c });
      else if (def.basePowerConsumption > 0 && cell.building.active) consumerCells.push({ row: r, col: c });
    });
  });

  if (powerCells.length === 0 || consumerCells.length === 0) return null;

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  // Draw lines from each power plant to the nearest consumer (max 3 lines per plant)
  powerCells.forEach(p => {
    const sorted = consumerCells
      .map(c => ({ ...c, dist: Math.abs(c.row - p.row) + Math.abs(c.col - p.col) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    sorted.forEach(c => {
      lines.push({
        x1: (p.col + 0.5) * cellSize,
        y1: (p.row + 0.5) * cellSize,
        x2: (c.col + 0.5) * cellSize,
        y2: (c.row + 0.5) * cellSize,
      });
    });
  });

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-0"
      width={cols * cellSize}
      height={rows * cellSize}
    >
      {lines.map((line, i) => (
        <line
          key={i}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="rgba(250, 204, 21, 0.12)"
          strokeWidth="1"
          strokeDasharray="4 4"
        >
          <animate
            attributeName="strokeDashoffset"
            from="0"
            to="-8"
            dur="1s"
            repeatCount="indefinite"
          />
        </line>
      ))}
    </svg>
  );
}

// --- Conveyor Connection Overlay ---
function ConveyorOverlay({
  grid,
  cols,
  rows,
  cellSize,
}: {
  grid: GridCell[][];
  cols: number;
  rows: number;
  cellSize: number;
}) {
  // Find horizontally adjacent active buildings in same row (simulating conveyor connections)
  const connections: { x1: number; y1: number; x2: number; y2: number }[] = [];

  grid.forEach((row) => {
    for (let c = 0; c < row.length - 1; c++) {
      const current = row[c].building;
      const next = row[c + 1].building;
      if (current?.active && next?.active) {
        connections.push({
          x1: (c + 0.5) * cellSize,
          y1: (row[c].row + 0.5) * cellSize,
          x2: (c + 1.5) * cellSize,
          y2: (row[c + 1].row + 0.5) * cellSize,
        });
      }
    }
  });

  if (connections.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-0"
      width={cols * cellSize}
      height={rows * cellSize}
    >
      {connections.map((conn, i) => (
        <g key={i}>
          {/* Track */}
          <line
            x1={conn.x1}
            y1={conn.y1}
            x2={conn.x2}
            y2={conn.y2}
            stroke="rgba(0, 255, 242, 0.08)"
            strokeWidth="2"
          />
          {/* Animated particle */}
          <circle r="1.5" fill="rgba(0, 255, 242, 0.5)">
            <animateMotion
              dur="2s"
              repeatCount="indefinite"
              path={`M${conn.x1},${conn.y1} L${conn.x2},${conn.y2}`}
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}

// --- Selected Building Info Panel ---
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="game-card rounded-xl bg-[#111827] p-4 border border-cyan-900/30"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{def.emoji}</span>
          <div>
            <h3 className={`text-sm font-semibold ${style.text}`}>{def.name}</h3>
            <p className="text-[10px] text-gray-500">
              Level {building.level} • {building.active ? '🟢 Active' : '🔴 Inactive'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-500" onClick={onClose}>
          ✕
        </Button>
      </div>

      <p className="text-xs text-gray-400 mb-3">{def.description}</p>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 mb-0.5">Efficiency</div>
          <div className={`text-sm font-bold font-mono ${
            building.efficiency >= 0.8 ? 'text-green-400' :
            building.efficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {Math.round(building.efficiency * 100)}%
          </div>
        </div>
        <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
          <div className="text-[9px] text-gray-500 mb-0.5">Power</div>
          <div className="text-sm font-bold font-mono text-yellow-400">
            {def.basePowerProduction > 0
              ? `+${def.basePowerProduction * building.level}MW`
              : `-${def.basePowerConsumption * building.level}MW`}
          </div>
        </div>
      </div>

      {/* Production Info */}
      {def.outputs && (
        <div className="mb-3">
          <div className="text-[10px] text-gray-500 mb-1">Production Output</div>
          <div className="space-y-1">
            {def.outputs.map((output, i) => {
              const meta = RESOURCE_META[output.resource as keyof typeof RESOURCE_META];
              const rate = output.amount * building.level * building.efficiency;
              return (
                <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{meta?.emoji ?? ''}</span>
                    <span className="text-[10px]" style={{ color: meta?.color }}>{meta?.name ?? output.resource}</span>
                  </div>
                  <span className="text-[10px] text-green-400 font-mono">+{formatNumber(rate)}/t</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {def.inputs && (
        <div className="mb-3">
          <div className="text-[10px] text-gray-500 mb-1">Required Inputs</div>
          <div className="space-y-1">
            {def.inputs.map((input, i) => {
              const meta = RESOURCE_META[input.resource as keyof typeof RESOURCE_META];
              const needed = input.amount * building.level;
              const have = store.resources[input.resource as keyof typeof store.resources] ?? 0;
              const enough = have >= needed;
              return (
                <div key={i} className="flex items-center justify-between bg-[#0a0e17] rounded px-2 py-1">
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{meta?.emoji ?? ''}</span>
                    <span className="text-[10px]" style={{ color: meta?.color }}>{meta?.name ?? input.resource}</span>
                  </div>
                  <span className={`text-[10px] font-mono ${enough ? 'text-gray-400' : 'text-red-400'}`}>
                    {formatNumber(have)}/{formatNumber(needed)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className={`flex-1 h-8 text-xs ${
            building.active
              ? 'border-red-800/50 text-red-400 hover:bg-red-900/20'
              : 'border-green-800/50 text-green-400 hover:bg-green-900/20'
          }`}
          onClick={() => store.toggleBuilding(building.id)}
        >
          {building.active ? <PowerOff className="w-3 h-3 mr-1" /> : <Power className="w-3 h-3 mr-1" />}
          {building.active ? 'Deactivate' : 'Activate'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={`flex-1 h-8 text-xs ${
            canAffordUpgrade
              ? 'border-cyan-800/50 text-cyan-400 hover:bg-cyan-900/20'
              : 'border-gray-700 text-gray-500'
          }`}
          onClick={() => store.upgradeBuilding(building.id)}
          disabled={!canAffordUpgrade}
        >
          <ChevronUp className="w-3 h-3 mr-1" />
          Upgrade ${formatNumber(upgradeCost)}
        </Button>
      </div>
    </motion.div>
  );
}

// --- Statistics Bar ---
function StatsBar() {
  const store = useGameStore();

  const totalBuildings = store.buildings.length;
  const activeBuildings = store.buildings.filter(b => b.active).length;
  const inactiveBuildings = totalBuildings - activeBuildings;
  const ratio = totalBuildings > 0 ? activeBuildings / totalBuildings : 0;

  const powerProduction = store.powerGrid.totalProduction;
  const powerConsumption = store.powerGrid.totalConsumption;
  const overallEfficiency = store.powerGrid.efficiency;

  // Category counts
  const extractorCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'extractor').length;
  const factoryCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'factory').length;
  const powerCount = store.buildings.filter(b => BUILDING_DEFS[b.type]?.category === 'power').length;

  return (
    <div className="game-card rounded-xl bg-[#111827] p-3 border border-[#1e293b]">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total Buildings */}
        <div className="text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Buildings</div>
          <div className="text-sm font-bold font-mono text-cyan-400">{totalBuildings}</div>
        </div>

        {/* Active Ratio */}
        <div className="text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Active</div>
          <div className="flex items-center justify-center gap-1">
            <span className="text-sm font-bold font-mono text-green-400">{activeBuildings}</span>
            <span className="text-[10px] text-gray-600">/</span>
            <span className="text-[10px] text-gray-500 font-mono">{inactiveBuildings}</span>
          </div>
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden mt-0.5">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>

        {/* Extractors */}
        <div className="text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider flex items-center justify-center gap-0.5">
            <Pickaxe className="w-2.5 h-2.5" /> Extract
          </div>
          <div className="text-sm font-bold font-mono text-amber-400">{extractorCount}</div>
        </div>

        {/* Factories */}
        <div className="text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider flex items-center justify-center gap-0.5">
            <Factory className="w-2.5 h-2.5" /> Factory
          </div>
          <div className="text-sm font-bold font-mono text-orange-400">{factoryCount}</div>
        </div>

        {/* Power */}
        <div className="text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider flex items-center justify-center gap-0.5">
            <Zap className="w-2.5 h-2.5" /> Power
          </div>
          <div className="text-sm font-bold font-mono text-yellow-400">{powerCount}</div>
        </div>

        {/* Power Grid */}
        <div className="text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider">Grid</div>
          <div className="flex items-center justify-center gap-0.5">
            <span className="text-xs font-mono text-green-400">{formatNumber(powerProduction)}</span>
            <span className="text-[9px] text-gray-600">/</span>
            <span className="text-xs font-mono text-yellow-400">{formatNumber(powerConsumption)}</span>
            <span className="text-[8px] text-gray-500">MW</span>
          </div>
        </div>

        {/* Efficiency */}
        <div className="text-center">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider flex items-center justify-center gap-0.5">
            <Activity className="w-2.5 h-2.5" /> Efficiency
          </div>
          <div className={`text-sm font-bold font-mono ${
            overallEfficiency >= 0.8 ? 'text-green-400' :
            overallEfficiency >= 0.5 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {Math.round(overallEfficiency * 100)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main FactoryMapPanel ---
export default function FactoryMapPanel() {
  const store = useGameStore();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);

  const selectedBuilding = useMemo(
    () => store.buildings.find(b => b.id === selectedBuildingId) ?? null,
    [store.buildings, selectedBuildingId]
  );

  const { grid, cols, rows } = useMemo(
    () => computeGridLayout(store.buildings),
    [store.buildings]
  );

  // Calculate cell size for responsive layout
  // We use CSS grid with responsive sizing, so cellSize is just for SVG overlays
  const cellSize = 72; // Approximate cell size in px for SVG coordinate calculation

  const handleTileClick = (buildingId: string) => {
    setSelectedBuildingId(prev => prev === buildingId ? null : buildingId);
  };

  const handleCloseSelected = () => {
    setSelectedBuildingId(null);
  };

  // Find which rows have which categories (for row labels)
  const rowCategories = useMemo(() => {
    const getCategoryForRow = (rowIdx: number): string | null => {
      const firstBuilding = grid[rowIdx]?.find(c => c.building !== null)?.building;
      if (!firstBuilding) return null;
      const def = BUILDING_DEFS[firstBuilding.type];
      if (!def) return null;
      if (def.category === 'extractor') return '⛏️ Extraction';
      if (def.category === 'power') return '⚡ Power';
      if (def.category === 'factory') {
        if (def.tier === 1) return '🔥 Tier 1 Factory';
        if (def.tier === 2) return '⚙️ Tier 2 Factory';
        return '🧪 Tier 3 Factory';
      }
      return null;
    };

    const cats: (string | null)[] = [];
    const seen = new Set<string>();
    for (let r = 0; r < rows; r++) {
      const cat = getCategoryForRow(r);
      if (cat && !seen.has(cat)) {
        cats.push(cat);
        seen.add(cat);
      } else {
        cats.push(null);
      }
    }
    return cats;
  }, [grid, rows]);

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-emerald-400 tracking-wide flex items-center gap-2">
            <Map className="w-5 h-5" />
            Factory Floor Map
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Visual overview of your factory layout</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-900/10 text-[10px]">
            {store.buildings.length} Buildings
          </Badge>
          {store.powerGrid.overload && (
            <Badge variant="outline" className="border-red-500/50 text-red-400 bg-red-900/20 text-[10px] neon-pulse">
              <Zap className="w-3 h-3 mr-1" /> OVERLOAD
            </Badge>
          )}
        </div>
      </div>

      {/* LEGEND */}
      <div className="flex flex-wrap gap-3 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-amber-900/60 border border-amber-500/40" />
          <span className="text-gray-400">Extractors</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-cyan-900/60 border border-cyan-500/40" />
          <span className="text-gray-400">T1 Factory</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-orange-900/60 border border-orange-500/40" />
          <span className="text-gray-400">T2 Factory</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-purple-900/60 border border-purple-500/40" />
          <span className="text-gray-400">T3 Factory</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-900/60 border border-yellow-500/40" />
          <span className="text-gray-400">Power</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded-full bg-green-500" />
          <span className="text-gray-400">High Eff.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded-full bg-yellow-500" />
          <span className="text-gray-400">Mid Eff.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1 rounded-full bg-red-500" />
          <span className="text-gray-400">Low Eff.</span>
        </div>
      </div>

      {/* MAP GRID + DETAIL PANEL */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Factory Floor Grid */}
        <div className="flex-1 game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b] relative overflow-hidden">
          {/* Category row labels */}
          {store.buildings.length === 0 ? (
            <div className="text-center py-16">
              <Factory className="w-12 h-12 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No buildings yet</p>
              <p className="text-[10px] text-gray-600 mt-1">
                Visit Extraction, Factories, or Power tabs to construct buildings
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* SVG Overlays for connections */}
              <div className="absolute inset-0 pointer-events-none" style={{ width: cols * cellSize, height: rows * cellSize }}>
                <PowerLineOverlay grid={grid} cols={cols} rows={rows} cellSize={cellSize} />
                <ConveyorOverlay grid={grid} cols={cols} rows={rows} cellSize={cellSize} />
              </div>

              {/* The Grid */}
              <div
                className="grid gap-1 relative z-10"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {grid.map((row, r) =>
                  row.map((cell, c) => {
                    // Row category label (first column of each category section)
                    const isFirstInCategory = c === 0 && rowCategories[r] !== null;

                    return (
                      <div key={`${r}-${c}`}>
                        {cell.building ? (
                          <BuildingTile
                            building={cell.building}
                            isSelected={selectedBuildingId === cell.building.id}
                            onClick={() => handleTileClick(cell.building!.id)}
                            tick={store.gameTick}
                          />
                        ) : (
                          <EmptyCell />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Category Row Labels */}
              <div className="absolute left-0 top-0 bottom-0 w-0 pointer-events-none">
                {rowCategories.map((cat, r) => {
                  if (!cat) return null;
                  // Find the first row index for this category
                  const firstCellInRow = grid[r]?.find(c => c.building !== null);
                  if (!firstCellInRow) return null;
                  return (
                    <div
                      key={r}
                      className="absolute text-[8px] text-gray-600 whitespace-nowrap"
                      style={{
                        top: `${(r / rows) * 100}%`,
                        left: 0,
                        transform: 'translateY(50%)',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected Building Detail Panel */}
        <div className="lg:w-72 flex-shrink-0">
          <AnimatePresence mode="wait">
            {selectedBuilding ? (
              <SelectedBuildingPanel
                key={selectedBuilding.id}
                building={selectedBuilding}
                onClose={handleCloseSelected}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="game-card rounded-xl bg-[#111827] p-4 border border-[#1e293b] text-center"
              >
                <Map className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                <p className="text-xs text-gray-500">Click a building tile</p>
                <p className="text-[10px] text-gray-600 mt-1">to view details and quick actions</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* STATISTICS BAR */}
      <StatsBar />
    </div>
  );
}
