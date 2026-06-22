/**
 * Market Simulator — Back-Compat Re-Export Shell
 *
 * The actual implementation has been split into industry-standard modules
 * under `engine/`. This file re-exports those exports so existing imports
 * (`from './marketSimulator'`, `from '@/lib/game/marketSimulator'`) keep
 * working without modification.
 *
 * Canonical location: `@/lib/game/engine`
 *
 * @deprecated Prefer importing from `@/lib/game/engine` directly.
 *             This shim will be removed in a future major version.
 *
 * Architecture (Option 2):
 *   engine/
 *     ├── types.ts         — Pure types (MarketSimulationState, etc.)
 *     ├── sectors.ts       — Sector definitions + display helpers
 *     ├── correlations.ts  — Price correlation chains
 *     ├── cycle.ts         — Market cycle phase transitions
 *     ├── mvil.ts          — Volatility injection layer
 *     ├── news.ts          — News generation pipeline
 *     ├── narratives.ts    — Player-driven narratives
 *     ├── marketTick.ts    — Main orchestrator (simulateMarketTick)
 *     └── index.ts         — Barrel export
 */

export {
  // Sectors + display
  type MarketSector,
  RESOURCE_SECTOR,
  RESOURCE_ELASTICITY,
  getSectorInfo,
  // Correlations
  PRICE_CORRELATIONS,
  type PriceCorrelation,
  // Cycle
  type CyclePhase,
  type MarketCycle,
  PHASE_DURATIONS,
  PHASE_MULTIPLIERS,
  advanceCycle,
  // MVIL
  type VolatilityInjection,
  MICRO_EVENT_CHANCE,
  MACRO_EVENT_CHANCE,
  MAX_INJECTION_EFFECT,
  generateMicroInjection,
  generateMacroInjection,
  generateChainInjections,
  processInjections,
  // News + narratives
  type MarketNews,
  type MarketNarrative,
  generateNews,
  generateNarratives,
  // Main orchestrator
  type MarketSimulationState,
  type MarketSimulationInput,
  type MarketSimulationOutput,
  createInitialSimState,
  simulateMarketTick,
  recordPlayerSell,
  recordPlayerBuy,
} from './engine';

// Severity style helper (kept here for back-compat)
export type MarketNewsCategory = 'price_move' | 'volatility' | 'correlation' | 'sector' | 'trade';

export function getSeverityStyle(severity: 'low' | 'medium' | 'high'): {
  color: string; bg: string; border: string; dot: string;
} {
  switch (severity) {
    case 'high':   return { color: 'text-danger',    bg: 'bg-danger/20/10',         border: 'border-danger/20',         dot: 'bg-danger' };
    case 'medium': return { color: 'text-warning',   bg: 'bg-warning/10',            border: 'border-warning/20',        dot: 'bg-warning/50' };
    case 'low':    return { color: 'text-muted-label', bg: 'bg-900-gray/10',         border: 'border-muted-label/40/20', dot: 'bg-muted-label/40' };
  }
}

export function getCategoryIcon(category: MarketNewsCategory): string {
  switch (category) {
    case 'price_move':  return '📈';
    case 'volatility':  return '⚡';
    case 'correlation': return '🔗';
    case 'sector':      return '📊';
    case 'trade':       return '💰';
  }
}
