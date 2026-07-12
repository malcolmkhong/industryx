// ============================================
// FACTORY DOMINION: EVENT PACKET BUILDERS
// Split from newsBuilder.ts — logic only, no template data moved.
// ============================================

import type { VolatilityInjection, MarketSector } from '../marketSimulator';
import type { ResourceType } from '../../shared/types/types';
import { NEWS_CONFIG, type EventPacket } from './newsBuilder';

export function buildEventPacketFromPriceMove(
  resource: ResourceType,
  oldPrice: number,
  newPrice: number,
  basePrice: number,
): EventPacket | null {
  const changeRatio = (newPrice - oldPrice) / oldPrice;
  const absChange = Math.abs(changeRatio);

  if (absChange < NEWS_CONFIG.priceMove.threshold) {
    return null;
  }

  const sign = changeRatio > 0 ? '+' : '';
  const delta = `${sign}${(changeRatio * 100).toFixed(1)}%`;
  const severity: 'low' | 'medium' | 'high' =
    absChange > NEWS_CONFIG.priceMove.severity.high
      ? 'high'
      : absChange > NEWS_CONFIG.priceMove.severity.medium
        ? 'medium'
        : 'low';

  const priceRatio = newPrice / basePrice;
  const goingUp = changeRatio > 0;
  let cause: string;
  if (priceRatio > NEWS_CONFIG.priceMove.causeRatio.bubble) {
    cause = 'speculative bubble';
  } else if (
    priceRatio > NEWS_CONFIG.priceMove.causeRatio.shortage &&
    goingUp
  ) {
    cause = 'supply shortage';
  } else if (
    priceRatio < NEWS_CONFIG.priceMove.causeRatio.crash &&
    !goingUp
  ) {
    cause = 'market crash';
  } else if (
    priceRatio < NEWS_CONFIG.priceMove.causeRatio.oversupply &&
    !goingUp
  ) {
    cause = 'oversupply';
  } else {
    cause = 'normal trading';
  }

  return {
    type: 'price_move',
    resource,
    delta,
    severity,
    context: {
      cause,
      oldPrice,
      newPrice,
      basePrice,
      trend: goingUp ? 'up' : 'down',
    },
  };
}

export function buildEventPacketFromVolatility(
  resource: ResourceType,
  injection: VolatilityInjection,
): EventPacket {
  const direction = injection.direction > 0 ? 'up' : 'down';
  const intensityLabel =
    injection.intensity > NEWS_CONFIG.volatility.severity.high
      ? 'high'
      : injection.intensity > NEWS_CONFIG.volatility.severity.medium
        ? 'medium'
        : 'low';
  const sign = injection.direction > 0 ? '+' : '-';
  const delta = `${sign}${(injection.intensity * injection.direction * 100).toFixed(1)}%`;

  return {
    type: 'volatility',
    resource,
    delta,
    severity: intensityLabel,
    context: {
      cause: injection.label ?? `${injection.source} volatility event`,
      source: injection.source,
      trend: direction,
      volume: injection.duration,
    },
  };
}

export function buildEventPacketFromSector(
  sector: MarketSector,
  trend: 'up' | 'down' | 'stable',
  avgChange: number,
): EventPacket | null {
  const absChange = Math.abs(avgChange);

  if (absChange < NEWS_CONFIG.sector.threshold || trend === 'stable') {
    return null;
  }

  const sign = avgChange > 0 ? '+' : '';
  const delta = `${sign}${(avgChange * 100).toFixed(1)}%`;
  const severity: 'low' | 'medium' | 'high' =
    absChange > NEWS_CONFIG.sector.severity.high
      ? 'high'
      : absChange > NEWS_CONFIG.sector.severity.medium
        ? 'medium'
        : 'low';

  return {
    type: 'sector',
    resource: sector,
    delta,
    severity,
    context: {
      sectorName: sector,
      trend,
      cause: trend === 'up' ? 'sector-wide rally' : 'sector-wide downturn',
    },
  };
}

export function buildEventPacketFromTrade(
  resource: ResourceType,
  recentSells: number,
  recentBuys: number,
): EventPacket | null {
  const totalVolume = recentSells + recentBuys;
  const imbalance = Math.abs(recentSells - recentBuys);

  if (
    totalVolume < NEWS_CONFIG.trade.minVolume ||
    imbalance / totalVolume < NEWS_CONFIG.trade.imbalanceRatio
  ) {
    return null;
  }

  const dominantSide = recentBuys > recentSells ? 'buy' : 'sell';
  const sign = dominantSide === 'buy' ? '+' : '-';
  const delta = `${sign}${((imbalance / totalVolume) * 100).toFixed(1)}%`;
  const severity: 'low' | 'medium' | 'high' =
    totalVolume > NEWS_CONFIG.trade.highVolumeThreshold ? 'high' : 'medium';

  return {
    type: 'trade',
    resource,
    delta,
    severity,
    context: {
      cause:
        dominantSide === 'buy' ? 'buy-heavy activity' : 'sell-heavy activity',
      volume: totalVolume,
      trend: dominantSide === 'buy' ? 'up' : 'down',
    },
  };
}
