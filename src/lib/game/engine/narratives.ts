/**
 * Player-driven Market Narrative Engine
 *
 * Industry-standard: pure functions that generate player-impact narratives
 * based on production / consumption / trade / hoarding activity.
 *
 * NO I/O. NO Math.random() (deterministic from input).
 */

import { NEWS_CONFIG } from '../newsBuilder';
import { RESOURCE_META } from '../configCache';
import type { ResourceType } from '../types';
import { RESOURCE_SECTOR, getSectorInfo } from './sectors';
import type { MarketNarrative } from './types';

const MAX_NARRATIVES_PER_TICK = NEWS_CONFIG.simulation.maxNarrativesPerTick;
const RESOURCE_NEWS_COOLDOWN_TICKS = NEWS_CONFIG.simulation.resourceCooldownTicks;
const TRADE_FRESHNESS_TICKS = RESOURCE_NEWS_COOLDOWN_TICKS;

function generateNarrativeId(): string {
  return 'nrr-' + Math.random().toString(36).substring(2, 8);
}

function generateProductionNarrative(
  resource: ResourceType,
  productionRate: number,
  gameTick: number,
): MarketNarrative | null {
  if (productionRate < 2) return null;
  const name = RESOURCE_META[resource]?.name ?? resource;
  const sector = RESOURCE_SECTOR[resource];
  const sectorInfo = getSectorInfo(sector);
  const intensity = productionRate > 20 ? 'massive' : productionRate > 8 ? 'significant' : 'moderate';
  return {
    id: generateNarrativeId(),
    title: 'Industrial Expansion Detected',
    description: `Your ${intensity} ${name} production operation is creating notable supply pressure in the ${sectorInfo.name} sector. Market prices are adjusting to your industrial output.`,
    playerAction: `Producing ${productionRate.toFixed(1)} ${name}/s`,
    marketEffect: 'Increasing supply pressure → downward price pressure',
    severity: productionRate > 20 ? 'high' : productionRate > 8 ? 'medium' : 'low',
    gameTick,
  };
}

function generateConsumptionNarrative(
  resource: ResourceType,
  consumptionRate: number,
  gameTick: number,
): MarketNarrative | null {
  if (consumptionRate < 2) return null;
  const name = RESOURCE_META[resource]?.name ?? resource;
  const intensity = consumptionRate > 20 ? 'massive' : consumptionRate > 8 ? 'significant' : 'moderate';
  return {
    id: generateNarrativeId(),
    title: 'Demand Surge Observed',
    description: `Your ${intensity} ${name} consumption is creating notable demand in the market. Supply chains are straining to keep up with your factory requirements.`,
    playerAction: `Consuming ${consumptionRate.toFixed(1)} ${name}/s`,
    marketEffect: 'Increasing demand pressure → upward price pressure',
    severity: consumptionRate > 20 ? 'high' : consumptionRate > 8 ? 'medium' : 'low',
    gameTick,
  };
}

function generateTradeNarrative(
  resource: ResourceType,
  recentSells: number,
  recentBuys: number,
  gameTick: number,
): MarketNarrative | null {
  const totalTrades = recentSells + recentBuys;
  if (totalTrades < 30) return null;
  const name = RESOURCE_META[resource]?.name ?? resource;
  const dominant = recentBuys > recentSells ? 'buying' : 'selling';
  return {
    id: generateNarrativeId(),
    title: 'Speculative Trading Activity Rising',
    description: `Unusual ${dominant} volume in ${name} market detected from your trading activity. Market participants are adjusting their positions in response.`,
    playerAction: `${dominant === 'buying' ? 'Bought' : 'Sold'} ${totalTrades.toFixed(0)} units of ${name}`,
    marketEffect: `Trade-driven ${dominant === 'buying' ? 'demand' : 'supply'} shock → volatility spike`,
    severity: totalTrades > 100 ? 'high' : 'medium',
    gameTick,
  };
}

function generateHoardingNarrative(
  resource: ResourceType,
  held: number,
  capacity: number,
  gameTick: number,
): MarketNarrative | null {
  const fillRatio = capacity > 0 ? held / capacity : 0;
  if (fillRatio < 0.9 || held < 20) return null;
  const name = RESOURCE_META[resource]?.name ?? resource;
  return {
    id: generateNarrativeId(),
    title: 'Resource Stockpiling Detected',
    description: `Your ${name} reserves are at ${(fillRatio * 100).toFixed(0)}% capacity. Market observers note your strategic accumulation of ${name}.`,
    playerAction: `Holding ${held.toFixed(0)}/${capacity} ${name}`,
    marketEffect: 'Reduced market supply from hoarding → upward price pressure',
    severity: fillRatio > 0.95 ? 'high' : 'medium',
    gameTick,
  };
}

export interface NarrativeInput {
  market: Array<{ resource: ResourceType }>;
  production: Partial<Record<ResourceType, number>>;
  consumption: Partial<Record<ResourceType, number>>;
  resources: Partial<Record<ResourceType, number>>;
  resourceCapacity: Partial<Record<ResourceType, number>>;
  recentPlayerSells: Partial<Record<ResourceType, number>>;
  recentPlayerBuys: Partial<Record<ResourceType, number>>;
  lastTradeTick: Partial<Record<ResourceType, number>>;
  gameTick: number;
}

export function generateNarratives(input: NarrativeInput): MarketNarrative[] {
  const {
    market, production, consumption, resources, resourceCapacity,
    recentPlayerSells, recentPlayerBuys, lastTradeTick, gameTick,
  } = input;

  const out: MarketNarrative[] = [];
  let productionNarratives = 0;
  let consumptionNarratives = 0;
  let tradeNarratives = 0;
  let hoardingNarratives = 0;

  for (const m of market) {
    if (out.length >= MAX_NARRATIVES_PER_TICK) break;
    const prodRate = production[m.resource] ?? 0;
    const n = generateProductionNarrative(m.resource, prodRate, gameTick);
    if (n) {
      if (n.severity !== 'low' || productionNarratives === 0) {
        out.push(n);
        productionNarratives++;
      }
    }
  }
  for (const m of market) {
    if (out.length >= MAX_NARRATIVES_PER_TICK) break;
    if (consumptionNarratives >= 2) break;
    const consRate = consumption[m.resource] ?? 0;
    const n = generateConsumptionNarrative(m.resource, consRate, gameTick);
    if (n) {
      out.push(n);
      consumptionNarratives++;
    }
  }
  for (const m of market) {
    if (out.length >= MAX_NARRATIVES_PER_TICK) break;
    if (tradeNarratives >= 1) break;
    const lastTrade = lastTradeTick?.[m.resource] ?? 0;
    if (gameTick - lastTrade > TRADE_FRESHNESS_TICKS) continue;
    const sells = recentPlayerSells[m.resource] ?? 0;
    const buys = recentPlayerBuys[m.resource] ?? 0;
    const n = generateTradeNarrative(m.resource, sells, buys, gameTick);
    if (n) {
      out.push(n);
      tradeNarratives++;
    }
  }
  for (const m of market) {
    if (out.length >= MAX_NARRATIVES_PER_TICK) break;
    if (hoardingNarratives >= 1) break;
    const held = resources[m.resource] ?? 0;
    const cap = resourceCapacity[m.resource] ?? 0;
    const n = generateHoardingNarrative(m.resource, held, cap, gameTick);
    if (n) {
      out.push(n);
      hoardingNarratives++;
    }
  }
  return out;
}
