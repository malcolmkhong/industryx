/**
 * Market Engine — Shared Types
 *
 * Industry-standard: types only, no logic.
 * Used by every other engine/ module and re-exported by marketSimulator.ts
 * for back-compat.
 */

import type { MarketPrice, ResourceType } from '../../shared/types/types';
import type { EventPacket } from '../news/newsBuilder';
import type { MarketSector } from './sectors';

// ─── Market Cycle (industry standard) ──────────────────────────────────────

export type CyclePhase = 'expansion' | 'peak' | 'recession' | 'recovery';

export interface MarketCycle {
  phase: CyclePhase;
  phaseProgress: number;   // 0-1, how far into current phase
  globalMultiplier: number; // affects all prices
}

// Phase durations in ticks (approximate)
export const PHASE_DURATIONS: Record<CyclePhase, [number, number]> = {
  expansion: [300, 600],  // 5-10 minutes at 1x
  peak:      [100, 200],   // 1.5-3 minutes
  recession: [200, 400],   // 3-7 minutes
  recovery:  [150, 300],   // 2.5-5 minutes
};

export const PHASE_MULTIPLIERS: Record<CyclePhase, number> = {
  expansion: 1.15,  // prices tend up 15%
  peak:      1.30,   // prices peak at +30%
  recession: 0.75,   // prices dip to -25%
  recovery:  0.95,   // prices recovering, near base
};

// ─── MVIL — Market Volatility Injection Layer ──────────────────────────────

export interface VolatilityInjection {
  intensity: number;      // 0-1
  direction: number;      // -1 to +1
  decay: number;          // per simulation step decay rate
  duration: number;       // simulation steps remaining
  source: 'micro' | 'macro' | 'chain';
  label?: string;         // short description for news
}

// MVIL probability constants
export const MICRO_EVENT_CHANCE = 0.03;          // 3% per resource per step
export const MACRO_EVENT_CHANCE = 0.015;         // 1.5% per step globally
export const MAX_INJECTION_EFFECT = 0.05;        // ±5% max per tick

// ─── Market News + Narrative (industry standard) ───────────────────────────

export interface MarketNews {
  id: string;
  title: string;
  description: string;
  affectedResources: ResourceType[];
  impactSummary: string;
  severity: 'low' | 'medium' | 'high';
  gameTick: number;
  category: 'price_move' | 'volatility' | 'correlation' | 'sector' | 'trade';
  // ── Hybrid News System fields ──
  textSource?: 'llm' | 'fallback';
  eventPacket?: EventPacket;
}

export interface MarketNarrative {
  id: string;
  title: string;
  description: string;
  playerAction: string;
  marketEffect: string;
  severity: 'low' | 'medium' | 'high';
  gameTick: number;
}

// ─── Simulation State + I/O ────────────────────────────────────────────────

export interface MarketSimulationState {
  cycle: MarketCycle;
  sectorMomentum: Record<MarketSector, number>;
  lastCorrelationImpact: Partial<Record<ResourceType, number>>;
  recentPlayerSells: Partial<Record<ResourceType, number>>;
  recentPlayerBuys: Partial<Record<ResourceType, number>>;
  ticksInPhase: number;
  volatilityInjections: Partial<Record<ResourceType, VolatilityInjection>>;
  lastNewsTick: Partial<Record<ResourceType, number>>;
  lastSectorNewsTick: Partial<Record<MarketSector, number>>;
  lastCategoryNewsTick: Partial<Record<string, number>>;
  lastTradeTick: Partial<Record<ResourceType, number>>;
}

export interface MarketSimulationInput {
  market: MarketPrice[];
  production: Partial<Record<ResourceType, number>>;
  consumption: Partial<Record<ResourceType, number>>;
  activeEvents: Array<{ effects: Array<{ type: string; target?: string; value: number }> }>;
  simState: MarketSimulationState;
  gameTick: number;
  resources: Partial<Record<ResourceType, number>>;
  resourceCapacity: Partial<Record<ResourceType, number>>;
}

export interface MarketSimulationOutput {
  market: MarketPrice[];
  simState: MarketSimulationState;
  sectorTrends: Record<MarketSector, 'up' | 'down' | 'stable'>;
  news: MarketNews[];
  narratives: MarketNarrative[];
}
