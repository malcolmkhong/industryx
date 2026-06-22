/**
 * News Generation Engine
 *
 * Industry-standard: hybrid pipeline (EventPacket → fallback text → async LLM).
 * Throttling: per-resource / per-sector / per-category cooldowns + dedup.
 *
 * NO I/O. Pure functions + Math.random() (acceptable in engine).
 */

import { NEWS_CONFIG } from '../newsBuilder';
import {
  buildEventPacketFromPriceMove,
  buildEventPacketFromSector,
  buildEventPacketFromTrade,
  buildEventPacketFromVolatility,
  generateFallbackText,
  generateNewsId,
  type EventPacket,
} from '../newsBuilder';
import { RESOURCE_META } from '../configCache';
import type { ResourceType } from '../types';
import { RESOURCE_SECTOR, type MarketSector } from './sectors';
import type { MarketNews } from './types';

const MAX_NEWS_PER_TICK = NEWS_CONFIG.simulation.maxNewsPerTick;
const RESOURCE_NEWS_COOLDOWN_TICKS = NEWS_CONFIG.simulation.resourceCooldownTicks;
const SECTOR_NEWS_COOLDOWN_TICKS = NEWS_CONFIG.simulation.sectorCooldownTicks;
const CATEGORY_NEWS_COOLDOWN_TICKS = NEWS_CONFIG.simulation.categoryCooldownTicks;
const PRICE_MOVE_THRESHOLD_HIGH = NEWS_CONFIG.simulation.priceMoveThresholdHigh;
const VOLATILITY_NEWS_MIN_INTENSITY = NEWS_CONFIG.volatility.minIntensity;
const TRADE_FRESHNESS_TICKS = RESOURCE_NEWS_COOLDOWN_TICKS;

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

export interface NewsInput {
  market: Array<{ resource: ResourceType; currentPrice: number; basePrice: number; priceHistory: number[] }>;
  priceChanges: Record<string, number>;
  sectorResources: Partial<Record<MarketSector, ResourceType[]>>;
  sectorTrends: Record<MarketSector, 'up' | 'down' | 'stable'>;
    newInjectionEvents: Array<{ resource: ResourceType; injection: Partial<{ intensity: number; direction: number; decay: number; duration: number; source: 'micro' | 'macro' | 'chain'; label?: string }> }>;
  simState: {
    recentPlayerSells: Partial<Record<ResourceType, number>>;
    recentPlayerBuys: Partial<Record<ResourceType, number>>;
    lastTradeTick: Partial<Record<ResourceType, number>>;
    lastNewsTick: Partial<Record<ResourceType, number>>;
    lastSectorNewsTick: Partial<Record<MarketSector, number>>;
    lastCategoryNewsTick: Partial<Record<string, number>>;
  };
  production: Partial<Record<ResourceType, number>>;
  consumption: Partial<Record<ResourceType, number>>;
  gameTick: number;
}

export interface NewsOutput {
  news: MarketNews[];
  updatedCooldowns: {
    lastNewsTick: Partial<Record<ResourceType, number>>;
    lastSectorNewsTick: Partial<Record<MarketSector, number>>;
    lastCategoryNewsTick: Partial<Record<string, number>>;
  };
}

// ─── Helper: Build MarketNews from EventPacket ─────────────────────────────

function newsFromPacket(
  packet: EventPacket,
  affectedRes: ResourceType[],
  gameTick: number,
  category: MarketNews['category'],
): MarketNews {
  const { title, description } = generateFallbackText(packet);
  const name = RESOURCE_META[packet.resource as ResourceType]?.name ?? packet.resource;
  return {
    id: generateNewsId(),
    title,
    description,
    affectedResources: affectedRes,
    impactSummary: `${name} ${packet.delta}`,
    severity: packet.severity,
    gameTick,
    category,
    textSource: 'fallback',
    eventPacket: packet,
  };
}

// ─── Main entry: collect + dedup + apply cooldowns ─────────────────────────

export function generateNews(input: NewsInput): NewsOutput {
  const {
    market, priceChanges, sectorResources, sectorTrends,
    newInjectionEvents, simState, production, consumption, gameTick,
  } = input;

  const lastNewsTick = { ...(simState.lastNewsTick ?? {}) };
  const lastSectorNewsTick = { ...(simState.lastSectorNewsTick ?? {}) };
  const lastCategoryNewsTick = { ...(simState.lastCategoryNewsTick ?? {}) };

  function isOnResourceCooldown(resource: string): boolean {
    const lastTick = lastNewsTick[resource as ResourceType];
    return lastTick !== undefined && (gameTick - lastTick) < RESOURCE_NEWS_COOLDOWN_TICKS;
  }
  function isOnSectorCooldown(sector: MarketSector): boolean {
    const lastTick = lastSectorNewsTick[sector];
    return lastTick !== undefined && (gameTick - lastTick) < SECTOR_NEWS_COOLDOWN_TICKS;
  }
  function isOnCategoryCooldown(category: string): boolean {
    const lastTick = lastCategoryNewsTick[category];
    return lastTick !== undefined && (gameTick - lastTick) < CATEGORY_NEWS_COOLDOWN_TICKS;
  }

  // Phase 1: Collect candidates
  const candidates: MarketNews[] = [];

  // Price movement news
  for (const m of market) {
    const changeRatio = priceChanges[m.resource] ?? 0;
    const absChange = Math.abs(changeRatio);
    if (absChange < PRICE_MOVE_THRESHOLD_HIGH) continue;
    const oldPrice = m.currentPrice / (1 + changeRatio);
    const packet = buildEventPacketFromPriceMove(m.resource, oldPrice, m.currentPrice, m.basePrice);
    if (packet) {
      packet.context.prodRate = production[m.resource] ?? 0;
      packet.context.consRate = consumption[m.resource] ?? 0;
      candidates.push(newsFromPacket(packet, [m.resource], gameTick, 'price_move'));
    }
  }

  // Volatility / MVIL news
  for (const { resource, injection } of newInjectionEvents) {
    if (injection.source === 'macro' || (injection.intensity ?? 0) >= VOLATILITY_NEWS_MIN_INTENSITY) {
      const packet = buildEventPacketFromVolatility(resource, injection as Parameters<typeof buildEventPacketFromVolatility>[1]);
      packet.context.prodRate = production[resource] ?? 0;
      packet.context.consRate = consumption[resource] ?? 0;
      candidates.push(newsFromPacket(packet, [resource], gameTick, 'volatility'));
    }
  }

  // Sector-wide news
  for (const sector of Object.keys(sectorTrends) as MarketSector[]) {
    const sectorRes = sectorResources[sector] ?? [];
    if (sectorRes.length === 0) continue;
    const trend = sectorTrends[sector];
    if (trend === 'stable') continue;
    let totalChange = 0;
    for (const res of sectorRes) totalChange += priceChanges[res] ?? 0;
    const avgChange = totalChange / sectorRes.length;
    const packet = buildEventPacketFromSector(sector, trend, avgChange);
    if (packet) {
      let totalProd = 0; let totalCons = 0;
      for (const r of sectorRes) { totalProd += production[r] ?? 0; totalCons += consumption[r] ?? 0; }
      packet.context.prodRate = totalProd;
      packet.context.consRate = totalCons;
      candidates.push(newsFromPacket(packet, sectorRes, gameTick, 'sector'));
    }
  }

  // Trade news (with freshness gate)
  for (const m of market) {
    const sells = simState.recentPlayerSells[m.resource] ?? 0;
    const buys = simState.recentPlayerBuys[m.resource] ?? 0;
    const lastTrade = simState.lastTradeTick?.[m.resource] ?? 0;
    if (gameTick - lastTrade > TRADE_FRESHNESS_TICKS) continue;
    const packet = buildEventPacketFromTrade(m.resource, sells, buys);
    if (packet) {
      packet.context.prodRate = production[m.resource] ?? 0;
      packet.context.consRate = consumption[m.resource] ?? 0;
      candidates.push(newsFromPacket(packet, [m.resource], gameTick, 'trade'));
    }
  }

  // Phase 2: Deduplication
  const bestByResource: Map<string, MarketNews> = new Map();
  const sectorNewsCandidates: MarketNews[] = [];
  for (const news of candidates) {
    if (news.category === 'sector') {
      sectorNewsCandidates.push(news);
      continue;
    }
    const key = news.affectedResources[0] ?? news.id;
    const existing = bestByResource.get(key);
    if (!existing || SEVERITY_RANK[news.severity] > SEVERITY_RANK[existing.severity]) {
      bestByResource.set(key, news);
    } else if (
      SEVERITY_RANK[news.severity] === SEVERITY_RANK[existing.severity] &&
      news.category === 'price_move' && existing.category !== 'price_move'
    ) {
      bestByResource.set(key, news);
    }
  }

  // Phase 3: Apply cooldowns
  const deduped = [...bestByResource.values(), ...sectorNewsCandidates];
  deduped.sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));

  const generated: MarketNews[] = [];
  for (const news of deduped) {
    if (generated.length >= MAX_NEWS_PER_TICK) break;
    if (news.category === 'sector') {
      const sectorKey = news.affectedResources.length > 0
        ? RESOURCE_SECTOR[news.affectedResources[0]]
        : null;
      if (sectorKey && isOnSectorCooldown(sectorKey)) continue;
      if (isOnCategoryCooldown('sector')) continue;
      generated.push(news);
      if (sectorKey) lastSectorNewsTick[sectorKey] = gameTick;
      lastCategoryNewsTick['sector'] = gameTick;
    } else {
      const resource = news.affectedResources[0];
      if (resource && isOnResourceCooldown(resource)) continue;
      if (isOnCategoryCooldown(news.category)) continue;
      generated.push(news);
      if (resource) lastNewsTick[resource] = gameTick;
      lastCategoryNewsTick[news.category] = gameTick;
    }
  }

  return {
    news: generated,
    updatedCooldowns: { lastNewsTick, lastSectorNewsTick, lastCategoryNewsTick },
  };
}
