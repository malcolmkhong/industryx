/**
 * News Builder Module — Structured EventPacket Builder + Enhanced Templates
 *
 * Architecture:
 *   simulateMarketTick() produces raw data
 *   → newsBuilder converts to EventPackets (structured data)
 *   → EventPackets go to newsLLM for text generation
 *   → Final MarketNews objects returned
 *
 * This module bridges the market simulation engine and the LLM layer,
 * providing both structured event packets and a rich deterministic
 * fallback template system with anti-repetition.
 */

import type { ResourceType } from '../../shared/types/types';
import { RESOURCE_META } from '../../config/configCache';
import { generateNewsId } from './newsIds';
import type { MarketNews } from '../marketSimulator';

// ═══════════════════════════════════════════════════════════════════════════
// News System Configuration
// ═══════════════════════════════════════════════════════════════════════════

export const NEWS_CONFIG = {
  priceMove: {
    threshold: 0.04,
    severity: {
      medium: 0.06,
      high: 0.1,
    },
    causeRatio: {
      bubble: 2.0,
      shortage: 1.3,
      oversupply: 0.7,
      crash: 0.4,
    },
  },
  volatility: {
    minIntensity: 0.3,
    severity: {
      medium: 0.2,
      high: 0.5,
    },
  },
  sector: {
    threshold: 0.03,
    severity: {
      medium: 0.05,
      high: 0.08,
    },
  },
  trade: {
    minVolume: 20,
    imbalanceRatio: 0.6,
    highVolumeThreshold: 100,
  },
  simulation: {
    priceMoveThresholdHigh: 0.06,
    chainReactionThreshold: 0.08,
    resourceCooldownTicks: 50,
    sectorCooldownTicks: 100,
    categoryCooldownTicks: 25,
    maxNewsPerTick: 3,
    maxNarrativesPerTick: 3,
    maxNewsItems: 30,
    maxNarrativeItems: 20,
    gameDayTicks: 600,
  },
} as const;

export type NewsConfig = typeof NEWS_CONFIG;

// ═══════════════════════════════════════════════════════════════════════════
// EventPacket Type
// ═══════════════════════════════════════════════════════════════════════════

export interface EventPacket {
  type: 'price_move' | 'volatility' | 'sector' | 'trade';
  resource: string;
  delta: string;
  severity: 'low' | 'medium' | 'high';
  context: {
    cause?: string;
    region?: string;
    sectorName?: string;
    source?: string;
    volume?: number;
    trend?: string;
    oldPrice?: number;
    newPrice?: number;
    basePrice?: number;
    prodRate?: number;
    consRate?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Templates — owner module
// ═══════════════════════════════════════════════════════════════════════════

import {
  PRICE_MOVE_UP_TEMPLATES,
  PRICE_MOVE_DOWN_TEMPLATES,
} from './templates/priceMove';

import {
  VOLATILITY_MICRO_TEMPLATES,
  VOLATILITY_MACRO_TEMPLATES,
  VOLATILITY_CHAIN_TEMPLATES,
} from './templates/volatility';

import {
  SECTOR_RALLY_TEMPLATES,
  SECTOR_DOWNTURN_TEMPLATES,
} from './templates/sector';

import {
  TRADE_BUY_HEAVY_TEMPLATES,
  TRADE_SELL_HEAVY_TEMPLATES,
} from './templates/trade';

export {
  PRICE_MOVE_UP_TEMPLATES,
  PRICE_MOVE_DOWN_TEMPLATES,
} from './templates/priceMove';

export {
  VOLATILITY_MICRO_TEMPLATES,
  VOLATILITY_MACRO_TEMPLATES,
  VOLATILITY_CHAIN_TEMPLATES,
} from './templates/volatility';

export {
  SECTOR_RALLY_TEMPLATES,
  SECTOR_DOWNTURN_TEMPLATES,
} from './templates/sector';

export {
  TRADE_BUY_HEAVY_TEMPLATES,
  TRADE_SELL_HEAVY_TEMPLATES,
} from './templates/trade';

// ═══════════════════════════════════════════════════════════════════════════
// Analyst Insight Phrases
// ═══════════════════════════════════════════════════════════════════════════

export const UP_INSIGHTS = [
  'bullish momentum is sustained',
  'further gains may follow',
  'resistance levels are being tested',
  'buying pressure remains elevated',
  'institutional interest is growing',
];

export const DOWN_INSIGHTS = [
  'support levels are being challenged',
  'further downside is possible',
  'sell-offs may accelerate',
  'risk sentiment has deteriorated',
  'capital is rotating elsewhere',
];

export const NEUTRAL_INSIGHTS = [
  'market is recalibrating',
  'consolidation is underway',
  'traders are reassessing positions',
  'volume patterns are shifting',
  'price discovery continues',
];

export const BULLISH_OUTLOOKS = [
  'continued upside potential',
  'favorable conditions ahead',
  'sustained demand expected',
];

export const BEARISH_OUTLOOKS = [
  'caution warranted going forward',
  'headwinds persist in the near term',
  'downside risks remain elevated',
];

export const NEUTRAL_OUTLOOKS = [
  'mixed signals in the broader market',
  'stabilization likely in coming sessions',
  'traders watching for clearer direction',
];

// ═══════════════════════════════════════════════════════════════════════════
// Title Templates
// ═══════════════════════════════════════════════════════════════════════════

export const TITLE_PRICE_UP = [
  '{name} Surges',
  '{name} Rallies',
  '{name} Climbs Sharply',
  'Rising {name} Demand',
  '{name} Price Spike',
  'Bullish {name} Move',
];

export const TITLE_PRICE_DOWN = [
  '{name} Drops',
  '{name} Under Pressure',
  '{name} Declines',
  'Falling {name} Prices',
  '{name} Sell-Off',
  'Bearish {name} Signal',
];

export const TITLE_VOLATILITY = [
  '{name} Volatility Alert',
  'Market Shock: {name}',
  '{source} Event: {name}',
  '{name} Disruption',
  'Sector Shock Wave',
  'Cascading {name} Effect',
];

export const TITLE_SECTOR = [
  '{sector} Sector Rally',
  '{sector} Sector Slump',
  '{sector} On The Move',
  'Broad {sector} Shift',
  '{sector} Market Shift',
  '{sector} Trend Change',
];

export const TITLE_TRADE = [
  'Heavy {name} Trading',
  '{name} Volume Spike',
  'Unusual {name} Activity',
  '{name} Trade Imbalance',
  '{name} Order Flow Surge',
  'Active {name} Session',
];

// ═══════════════════════════════════════════════════════════════════════════
// Anti-Repetition System
// ═══════════════════════════════════════════════════════════════════════════

export const ANTI_REPEAT_WINDOW = 3;

export type TemplateCategory =
  | 'price_up'
  | 'price_down'
  | 'vol_micro'
  | 'vol_macro'
  | 'vol_chain'
  | 'sector_up'
  | 'sector_down'
  | 'trade_buy'
  | 'trade_sell'
  | 'title_price_up'
  | 'title_price_down'
  | 'title_volatility'
  | 'title_sector'
  | 'title_trade';

export const recentTemplates: Record<TemplateCategory, number[]> = {
  price_up: [],
  price_down: [],
  vol_micro: [],
  vol_macro: [],
  vol_chain: [],
  sector_up: [],
  sector_down: [],
  trade_buy: [],
  trade_sell: [],
  title_price_up: [],
  title_price_down: [],
  title_volatility: [],
  title_sector: [],
  title_trade: [],
};

export function selectTemplate(
  templates: string[],
  category: TemplateCategory,
): number {
  const recent = recentTemplates[category];
  const len = templates.length;

  const available: number[] = [];
  for (let i = 0; i < len; i++) {
    if (!recent.includes(i)) {
      available.push(i);
    }
  }

  const pool =
    available.length > 0 ? available : Array.from({ length: len }, (_, i) => i);
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  recent.push(chosen);
  if (recent.length > ANTI_REPEAT_WINDOW) {
    recent.shift();
  }

  return chosen;
}

// ═══════════════════════════════════════════════════════════════════════════
// Template Variable Substitution
// ═══════════════════════════════════════════════════════════════════════════

interface TemplateVars {
  name?: string;
  pct?: string;
  cause?: string;
  insight?: string;
  outlook?: string;
  sector?: string;
  source?: string;
  volume?: string;
  direction?: string;
  intensity?: string;
}

export function substituteVars(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{name\}/g, vars.name ?? '')
    .replace(/\{pct\}/g, vars.pct ?? '')
    .replace(/\{cause\}/g, vars.cause ?? '')
    .replace(/\{insight\}/g, vars.insight ?? '')
    .replace(/\{outlook\}/g, vars.outlook ?? '')
    .replace(/\{sector\}/g, vars.sector ?? '')
    .replace(/\{source\}/g, vars.source ?? '')
    .replace(/\{volume\}/g, vars.volume ?? '')
    .replace(/\{direction\}/g, vars.direction ?? '')
    .replace(/\{intensity\}/g, vars.intensity ?? '');
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Resource display name
// ═══════════════════════════════════════════════════════════════════════════

export function resourceName(resource: string): string {
  return RESOURCE_META[resource as ResourceType]?.name ?? resource;
}

// ═══════════════════════════════════════════════════════════════════════════
// Random Phrase Helpers
// ═══════════════════════════════════════════════════════════════════════════

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getInsight(trend: 'up' | 'down' | 'stable'): string {
  if (trend === 'up') return randomFrom(UP_INSIGHTS);
  if (trend === 'down') return randomFrom(DOWN_INSIGHTS);
  return randomFrom(NEUTRAL_INSIGHTS);
}

export function getOutlook(trend: 'up' | 'down' | 'stable'): string {
  if (trend === 'up') return randomFrom(BULLISH_OUTLOOKS);
  if (trend === 'down') return randomFrom(BEARISH_OUTLOOKS);
  return randomFrom(NEUTRAL_OUTLOOKS);
}

export function severityLabel(severity: 'low' | 'medium' | 'high'): string {
  switch (severity) {
    case 'high':
      return 'severe';
    case 'medium':
      return 'moderate';
    case 'low':
      return 'minor';
    default:
      throw new Error(`Unknown severity: ${String(severity)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Core Generation Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate deterministic fallback text from an EventPacket.
 * Uses the rich template system with anti-repetition.
 * Returns title and description.
 */
export function generateFallbackText(packet: EventPacket): {
  title: string;
  description: string;
} {
  const name = resourceName(packet.resource);
  const trend = (packet.context.trend ?? 'stable') as
    | 'up'
    | 'down'
    | 'stable';
  const pct = packet.delta.replace(/[+-]/, '').replace(/%$/, '');
  const cause = packet.context.cause ?? 'market forces';
  const insight = getInsight(trend);
  const outlook = getOutlook(trend);
  const intensity = severityLabel(packet.severity);

  let title = '';
  let description = '';

  switch (packet.type) {
    case 'price_move': {
      const isUp = trend === 'up';

      const descTemplates = isUp
        ? PRICE_MOVE_UP_TEMPLATES
        : PRICE_MOVE_DOWN_TEMPLATES;
      const descCat: TemplateCategory = isUp ? 'price_up' : 'price_down';
      const descIdx = selectTemplate(descTemplates, descCat);
      description = substituteVars(descTemplates[descIdx], {
        name,
        pct,
        cause,
        insight,
        outlook,
      });

      const titleTemplates = isUp ? TITLE_PRICE_UP : TITLE_PRICE_DOWN;
      const titleCat: TemplateCategory = isUp
        ? 'title_price_up'
        : 'title_price_down';
      const titleIdx = selectTemplate(titleTemplates, titleCat);
      title = substituteVars(titleTemplates[titleIdx], { name });
      break;
    }

    case 'volatility': {
      const source = packet.context.source ?? 'micro';
      const direction = trend === 'up' ? 'upward' : 'downward';
      const sector = packet.context.sectorName ?? '';

      let descTemplates: string[];
      let descCat: TemplateCategory;

      if (source === 'macro') {
        descTemplates = VOLATILITY_MACRO_TEMPLATES;
        descCat = 'vol_macro';
      } else if (source === 'chain') {
        descTemplates = VOLATILITY_CHAIN_TEMPLATES;
        descCat = 'vol_chain';
      } else {
        descTemplates = VOLATILITY_MICRO_TEMPLATES;
        descCat = 'vol_micro';
      }

      const descIdx = selectTemplate(descTemplates, descCat);
      description = substituteVars(descTemplates[descIdx], {
        name,
        cause,
        direction,
        intensity,
        sector,
        source,
      });

      const titleIdx = selectTemplate(TITLE_VOLATILITY, 'title_volatility');
      title = substituteVars(TITLE_VOLATILITY[titleIdx], {
        name,
        source:
          source.charAt(0).toUpperCase() + source.slice(1),
      });
      break;
    }

    case 'sector': {
      const sectorName = packet.context.sectorName ?? name;
      const isUp = trend === 'up';

      const descTemplates = isUp
        ? SECTOR_RALLY_TEMPLATES
        : SECTOR_DOWNTURN_TEMPLATES;
      const descCat: TemplateCategory = isUp ? 'sector_up' : 'sector_down';
      const descIdx = selectTemplate(descTemplates, descCat);
      description = substituteVars(descTemplates[descIdx], {
        sector: sectorName,
        pct,
        cause,
        outlook,
      });

      const titleIdx = selectTemplate(TITLE_SECTOR, 'title_sector');
      title = substituteVars(TITLE_SECTOR[titleIdx], { sector: sectorName });
      break;
    }

    case 'trade': {
      const isBuyHeavy = packet.context.cause?.includes('buy') ?? false;
      const volume = packet.context.volume?.toFixed(0) ?? '0';

      const descTemplates = isBuyHeavy
        ? TRADE_BUY_HEAVY_TEMPLATES
        : TRADE_SELL_HEAVY_TEMPLATES;
      const descCat: TemplateCategory = isBuyHeavy ? 'trade_buy' : 'trade_sell';
      const descIdx = selectTemplate(descTemplates, descCat);
      description = substituteVars(descTemplates[descIdx], {
        name,
        volume,
        cause,
      });

      const titleIdx = selectTemplate(TITLE_TRADE, 'title_trade');
      title = substituteVars(TITLE_TRADE[titleIdx], { name });
      break;
    }
  }

  return { title, description };
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility: Build a full MarketNews from an EventPacket (deterministic path)
// ═══════════════════════════════════════════════════════════════════════════

export function eventPacketToMarketNews(
  packet: EventPacket,
  gameTick: number,
  affectedResources?: ResourceType[],
): MarketNews {
  const { title, description } = generateFallbackText(packet);
  const name = resourceName(packet.resource);

  return {
    id: generateNewsId(),
    title,
    description,
    affectedResources: affectedResources ?? [packet.resource as ResourceType],
    impactSummary: `${name} ${packet.delta}`,
    severity: packet.severity,
    gameTick,
    category:
      packet.type === 'price_move'
        ? 'price_move'
        : packet.type === 'volatility'
          ? 'volatility'
          : packet.type === 'sector'
            ? 'sector'
            : 'trade',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Re-export logic wrappers from split files
// ═══════════════════════════════════════════════════════════════════════════

export {
  buildEventPacketFromPriceMove,
  buildEventPacketFromVolatility,
  buildEventPacketFromSector,
  buildEventPacketFromTrade,
} from './eventPackets';

export { generateNewsId } from './newsIds';
