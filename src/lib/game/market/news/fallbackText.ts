// ============================================
// FACTORY DOMINION: FALLBACK TEXT GENERATOR
// Split from newsBuilder.ts — logic only, no template data moved.
// ============================================

import {
  type EventPacket,
  UP_INSIGHTS,
  DOWN_INSIGHTS,
  NEUTRAL_INSIGHTS,
  BULLISH_OUTLOOKS,
  BEARISH_OUTLOOKS,
  NEUTRAL_OUTLOOKS,
  PRICE_MOVE_UP_TEMPLATES,
  PRICE_MOVE_DOWN_TEMPLATES,
  VOLATILITY_MICRO_TEMPLATES,
  VOLATILITY_MACRO_TEMPLATES,
  VOLATILITY_CHAIN_TEMPLATES,
  SECTOR_RALLY_TEMPLATES,
  SECTOR_DOWNTURN_TEMPLATES,
  TRADE_BUY_HEAVY_TEMPLATES,
  TRADE_SELL_HEAVY_TEMPLATES,
  TITLE_PRICE_UP,
  TITLE_PRICE_DOWN,
  TITLE_VOLATILITY,
  TITLE_SECTOR,
  TITLE_TRADE,
} from './newsBuilder';

import { RESOURCE_META } from '../../config/configCache';
import type { ResourceType } from '../../shared/types/types';

import { selectTemplate, type TemplateCategory } from './templateSelector';

function resourceName(resource: string): string {
  return RESOURCE_META[resource as ResourceType]?.name ?? resource;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getInsight(trend: 'up' | 'down' | 'stable'): string {
  if (trend === 'up') return randomFrom(UP_INSIGHTS);
  if (trend === 'down') return randomFrom(DOWN_INSIGHTS);
  return randomFrom(NEUTRAL_INSIGHTS);
}

function getOutlook(trend: 'up' | 'down' | 'stable'): string {
  if (trend === 'up') return randomFrom(BULLISH_OUTLOOKS);
  if (trend === 'down') return randomFrom(BEARISH_OUTLOOKS);
  return randomFrom(NEUTRAL_OUTLOOKS);
}

function severityLabel(
  severity: 'low' | 'medium' | 'high',
): string {
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

function substituteVars(template: string, vars: TemplateVars): string {
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
      const descIdx = selectTemplate(descTemplates, isUp ? 'price_up' : 'price_down');
      description = substituteVars(descTemplates[descIdx], {
        name,
        pct,
        cause,
        insight,
        outlook,
      });

      const titleTemplates = isUp ? TITLE_PRICE_UP : TITLE_PRICE_DOWN;
      const titleIdx = selectTemplate(titleTemplates, isUp ? 'title_price_up' : 'title_price_down');
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
