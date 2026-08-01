/**
 * Market Tick Orchestrator
 *
 * Industry-standard: composes pure engine modules (cycle, mvil, news, narratives)
 * into a single tick. NO I/O — the route handler is responsible for persistence.
 *
 * This is the canonical `simulateMarketTick` implementation.
 * The old inline version in /api/market/tick/route.ts is replaced by this.
 */

import type { ResourceType, MarketPrice } from '../types';
import { RESOURCE_ELASTICITY, RESOURCE_SECTOR, type MarketSector } from './sectors';
import { PRICE_CORRELATIONS } from './correlations';
import { advanceCycle } from './cycle';
import { processInjections } from './mvil';
import { MAX_INJECTION_EFFECT } from './types';
import { generateNews } from './news';
import { generateNarratives } from './narratives';
import {
  type MarketSimulationInput,
  type MarketSimulationOutput,
  type MarketSimulationState,
} from './types';

const TRADE_DECAY_RATE = 0.80;
const TRADE_DECAY_ZERO_THRESHOLD = 2;

export function createInitialSimState(): MarketSimulationState {
  const sectors: MarketSector[] = [
    'raw_minerals', 'raw_organic', 'basic_materials', 'components',
    'advanced', 'high_tech', 'endgame', 'agriculture',
  ];
  const momentum: Record<string, number> = {};
  sectors.forEach(s => { momentum[s] = 0; });
  return {
    cycle: { phase: 'expansion', phaseProgress: 0, globalMultiplier: 1.0 },
    sectorMomentum: momentum as Record<MarketSector, number>,
    lastCorrelationImpact: {},
    recentPlayerSells: {},
    recentPlayerBuys: {},
    ticksInPhase: 0,
    volatilityInjections: {},
    lastNewsTick: {},
    lastSectorNewsTick: {},
    lastCategoryNewsTick: {},
    lastTradeTick: {},
  };
}

// ─── Core simulation tick ──────────────────────────────────────────────────

export function simulateMarketTick(input: MarketSimulationInput): MarketSimulationOutput {
  const { market, production, consumption, activeEvents, simState, gameTick, resources, resourceCapacity } = input;

  // 1. Advance market cycle
  const cycleResult = advanceCycle(simState.cycle, simState.ticksInPhase);
  const newSimState: MarketSimulationState = {
    ...simState,
    cycle: cycleResult.cycle,
    ticksInPhase: cycleResult.ticksInPhase,
  };

  // 2. Player supply/demand pressure
  const playerPressure: Record<string, number> = {};
  for (const m of market) {
    const prod = production[m.resource] ?? 0;
    const cons = consumption[m.resource] ?? 0;
    playerPressure[m.resource] = (prod - cons) * 0.01;
  }

  // 3. Decay recent player trades
  const decayedSells: Record<string, number> = {};
  const decayedBuys: Record<string, number> = {};
  for (const m of market) {
    const rawSell = (newSimState.recentPlayerSells[m.resource] ?? 0) * TRADE_DECAY_RATE;
    const rawBuy = (newSimState.recentPlayerBuys[m.resource] ?? 0) * TRADE_DECAY_RATE;
    decayedSells[m.resource] = rawSell < TRADE_DECAY_ZERO_THRESHOLD ? 0 : rawSell;
    decayedBuys[m.resource] = rawBuy < TRADE_DECAY_ZERO_THRESHOLD ? 0 : rawBuy;
  }
  newSimState.recentPlayerSells = decayedSells as Record<ResourceType, number>;
  newSimState.recentPlayerBuys = decayedBuys as Record<ResourceType, number>;

  // 4. Correlation impact
  const correlationImpact: Record<string, number> = {};
  for (const m of market) correlationImpact[m.resource] = 0;
  for (const corr of PRICE_CORRELATIONS) {
    const fromMarket = market.find(m => m.resource === corr.from);
    if (!fromMarket) continue;
    const hist = fromMarket.priceHistory;
    if (hist.length < 2) continue;
    const prevPrice = hist[hist.length - 1];
    const priceChangeRatio = fromMarket.currentPrice / prevPrice - 1;
    correlationImpact[corr.to] = (correlationImpact[corr.to] ?? 0) + priceChangeRatio * corr.strength * 0.3;
  }
  newSimState.lastCorrelationImpact = correlationImpact as Record<ResourceType, number>;

  // 5. Sector momentum
  const sectorResources: Partial<Record<MarketSector, ResourceType[]>> = {};
  for (const m of market) {
    const sector = RESOURCE_SECTOR[m.resource];
    if (!sectorResources[sector]) sectorResources[sector] = [];
    sectorResources[sector]!.push(m.resource);
  }
  const newMomentum = { ...newSimState.sectorMomentum };
  for (const sector of Object.keys(sectorResources) as MarketSector[]) {
    const resList = sectorResources[sector] ?? [];
    let sectorPriceChange = 0;
    let count = 0;
    for (const res of resList) {
      const m = market.find(x => x.resource === res);
      if (!m || m.priceHistory.length < 2) continue;
      const prev = m.priceHistory[m.priceHistory.length - 1];
      sectorPriceChange += (m.currentPrice / prev - 1);
      count++;
    }
    if (count > 0) {
      const avgChange = sectorPriceChange / count;
      newMomentum[sector] = (newMomentum[sector] ?? 0) * 0.8 + avgChange * 0.2;
    }
  }
  newSimState.sectorMomentum = newMomentum;

  // 6. Process MVIL injections
  const { injections: cleanInjections, newEvents: newInjectionEvents } = processInjections(
    newSimState.volatilityInjections,
    market,
  );
  newSimState.volatilityInjections = cleanInjections;

  // 7. Compute new prices
  const priceChanges: Record<string, number> = {};
  const newMarket: MarketPrice[] = market.map(m => {
    const elasticity = RESOURCE_ELASTICITY[m.resource];
    const sector = RESOURCE_SECTOR[m.resource];
    const sectorMom = newMomentum[sector] ?? 0;
    const netPlayerPressure = playerPressure[m.resource] ?? 0;
    const corrImpact = correlationImpact[m.resource] ?? 0;
    const recentSells = newSimState.recentPlayerSells[m.resource] ?? 0;
    const recentBuys = newSimState.recentPlayerBuys[m.resource] ?? 0;

    const noise = (Math.random() - 0.5) * 2 * m.volatility * 0.03;
    const cycleEffect = (newSimState.cycle.globalMultiplier - 1.0) * 0.02;
    const momentumEffect = sectorMom * 0.15;
    const productionPressure = -netPlayerPressure * elasticity * 0.05;
    const tradeImpact = (-recentSells * 0.001 + recentBuys * 0.001) * elasticity;
    const corrEffect = corrImpact * elasticity;

    let eventOverride = 0;
    for (const event of activeEvents) {
      for (const effect of event.effects) {
        if (effect.type === 'marketPriceMultiplier') {
          if (!effect.target || effect.target === m.resource) {
            eventOverride = m.basePrice * effect.value;
          }
        }
      }
    }

    const baseTotalChange = noise + cycleEffect + momentumEffect + productionPressure + tradeImpact + corrEffect;

    let injectionEffect = 0;
    const injection = cleanInjections[m.resource];
    if (injection && injection.duration > 0) {
      injectionEffect = injection.intensity * injection.direction * elasticity * (0.5 + Math.random());
      injectionEffect = Math.max(-MAX_INJECTION_EFFECT, Math.min(MAX_INJECTION_EFFECT, injectionEffect));
    }
    const totalChange = baseTotalChange + injectionEffect;
    let newPrice = m.currentPrice * (1 + totalChange);
    if (eventOverride > 0) newPrice = newPrice * 0.7 + eventOverride * 0.3;
    newPrice = newPrice * 0.97 + m.basePrice * 0.03;
    newPrice = Math.max(m.basePrice * 0.2, Math.min(m.basePrice * 5, newPrice));
    priceChanges[m.resource] = (newPrice - m.currentPrice) / m.currentPrice;

    const prod = production[m.resource] ?? 0;
    const cons = consumption[m.resource] ?? 0;
    const newDemand = Math.max(0.3, Math.min(2.0,
      1.0 + (cons * 0.02) + (recentBuys * 0.001) + (Math.random() - 0.5) * 0.02,
    ));
    const newSupply = Math.max(0.3, Math.min(2.0,
      1.0 + (prod * 0.02) + (recentSells * 0.001) + (Math.random() - 0.5) * 0.02,
    ));

    const newHistory = [...m.priceHistory, m.currentPrice].slice(-50);
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (newHistory.length >= 5) {
      const recent = newHistory.slice(-5);
      const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (newPrice > avg * 1.05) trend = 'up';
      else if (newPrice < avg * 0.95) trend = 'down';
    }

    return {
      ...m,
      currentPrice: Math.round(newPrice * 100) / 100,
      priceHistory: newHistory,
      demand: Math.round(newDemand * 100) / 100,
      supply: Math.round(newSupply * 100) / 100,
      trend,
    };
  });

  // 8. Sector trends
  const sectorTrends: Record<string, 'up' | 'down' | 'stable'> = {};
  for (const sector of Object.keys(newMomentum) as MarketSector[]) {
    const mom = newMomentum[sector];
    if (mom > 0.005) sectorTrends[sector] = 'up';
    else if (mom < -0.005) sectorTrends[sector] = 'down';
    else sectorTrends[sector] = 'stable';
  }

  // 9. Generate news (with cooldowns)
  const newsResult = generateNews({
    market: newMarket,
    priceChanges,
    sectorResources,
    sectorTrends: sectorTrends as Record<MarketSector, 'up' | 'down' | 'stable'>,
    newInjectionEvents,
    simState: {
      recentPlayerSells: newSimState.recentPlayerSells,
      recentPlayerBuys: newSimState.recentPlayerBuys,
      lastTradeTick: newSimState.lastTradeTick,
      lastNewsTick: newSimState.lastNewsTick,
      lastSectorNewsTick: newSimState.lastSectorNewsTick,
      lastCategoryNewsTick: newSimState.lastCategoryNewsTick,
    },
    production,
    consumption,
    gameTick,
  });
  newSimState.lastNewsTick = newsResult.updatedCooldowns.lastNewsTick;
  newSimState.lastSectorNewsTick = newsResult.updatedCooldowns.lastSectorNewsTick;
  newSimState.lastCategoryNewsTick = newsResult.updatedCooldowns.lastCategoryNewsTick;

  // 10. Generate narratives
  const generatedNarratives = generateNarratives({
    market: newMarket,
    production,
    consumption,
    resources,
    resourceCapacity,
    recentPlayerSells: newSimState.recentPlayerSells,
    recentPlayerBuys: newSimState.recentPlayerBuys,
    lastTradeTick: newSimState.lastTradeTick,
    gameTick,
  });

  return {
    market: newMarket,
    simState: newSimState,
    sectorTrends: sectorTrends as Record<MarketSector, 'up' | 'down' | 'stable'>,
    news: newsResult.news,
    narratives: generatedNarratives,
  };
}

// ─── Trade recorders ───────────────────────────────────────────────────────

export function recordPlayerSell(
  simState: MarketSimulationState,
  resource: ResourceType,
  amount: number,
  gameTick?: number,
): MarketSimulationState {
  const result: MarketSimulationState = {
    ...simState,
    recentPlayerSells: {
      ...simState.recentPlayerSells,
      [resource]: (simState.recentPlayerSells[resource] ?? 0) + amount,
    },
  };
  if (gameTick !== undefined) {
    result.lastTradeTick = { ...simState.lastTradeTick, [resource]: gameTick };
  }
  return result;
}

export function recordPlayerBuy(
  simState: MarketSimulationState,
  resource: ResourceType,
  amount: number,
  gameTick?: number,
): MarketSimulationState {
  const result: MarketSimulationState = {
    ...simState,
    recentPlayerBuys: {
      ...simState.recentPlayerBuys,
      [resource]: (simState.recentPlayerBuys[resource] ?? 0) + amount,
    },
  };
  if (gameTick !== undefined) {
    result.lastTradeTick = { ...simState.lastTradeTick, [resource]: gameTick };
  }
  return result;
}
