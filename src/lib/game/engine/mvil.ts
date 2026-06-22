/**
 * MVIL — Market Volatility Injection Layer
 *
 * Industry-standard: 3 sources of price volatility:
 *   - Micro: per-resource random noise (3% chance/tick)
 *   - Macro: sector-wide events (1.5% chance/tick)
 *   - Chain: downstream correlations from extreme price moves
 *
 * NO I/O. Uses Math.random() for event generation (acceptable in pure engine).
 */

import type { ResourceType } from '../types';
import { RESOURCE_META } from '../configCache';
import { getSectorInfo, type MarketSector } from './sectors';
import { PRICE_CORRELATIONS } from './correlations';
import { RESOURCE_SECTOR } from './sectors';
import {
  MICRO_EVENT_CHANCE,
  MACRO_EVENT_CHANCE,
  MAX_INJECTION_EFFECT,
  type VolatilityInjection,
} from './types';

const CHAIN_REACTION_THRESHOLD = 0.10; // 10% price move triggers chain

// ─── Micro: per-resource random noise ──────────────────────────────────────

export function generateMicroInjection(resource: ResourceType): VolatilityInjection {
  const direction = Math.random() > 0.5 ? 1 : -1;
  const intensity = 0.05 + Math.random() * 0.15; // 0.05–0.20
  const duration = 1 + Math.floor(Math.random() * 3); // 1–3 steps
  const labels = direction > 0
    ? ['Supply disruption', 'Demand spike', 'Logistics delay', 'Quality premium']
    : ['Oversupply detected', 'Demand softening', 'Import surge', 'Storage overflow'];
  return {
    intensity,
    direction,
    decay: 0.15 + Math.random() * 0.1,
    duration,
    source: 'micro',
    label: labels[Math.floor(Math.random() * labels.length)],
  };
}

// ─── Macro: sector-wide event ──────────────────────────────────────────────

export function generateMacroInjection(
  sector: MarketSector,
): Array<{ resource: ResourceType; injection: VolatilityInjection }> {
  const direction = Math.random() > 0.4 ? 1 : -1;
  const intensity = 0.3 + Math.random() * 0.4; // 0.3–0.7
  const duration = 4 + Math.floor(Math.random() * 8); // 4–11 steps
  const sectorResources = Object.entries(RESOURCE_SECTOR)
    .filter(([, s]) => s === sector)
    .map(([r]) => r as ResourceType);
  const labels = direction > 0
    ? [`${getSectorInfo(sector).name} boom`, 'Trade agreement signed', 'Subsidy program launched', 'Infrastructure investment']
    : [`${getSectorInfo(sector).name} downturn`, 'Trade restrictions imposed', 'Regulatory crackdown', 'Global demand slump'];
  const label = labels[Math.floor(Math.random() * labels.length)];
  return sectorResources.map(resource => ({
    resource,
    injection: {
      intensity: intensity * (0.7 + Math.random() * 0.3),
      direction,
      decay: 0.08 + Math.random() * 0.05,
      duration,
      source: 'macro',
      label,
    },
  }));
}

// ─── Chain: downstream correlation cascade ─────────────────────────────────

export function generateChainInjections(
  triggerResource: ResourceType,
  priceChangeRatio: number,
): Array<{ resource: ResourceType; injection: VolatilityInjection }> {
  const direction = priceChangeRatio > 0 ? 1 : -1;
  const results: Array<{ resource: ResourceType; injection: VolatilityInjection }> = [];

  for (const corr of PRICE_CORRELATIONS) {
    if (corr.from !== triggerResource) continue;
    const chainIntensity = Math.min(0.5, Math.abs(priceChangeRatio) * corr.strength * 0.6);
    if (chainIntensity < 0.02) continue;
    results.push({
      resource: corr.to,
      injection: {
        intensity: chainIntensity,
        direction,
        decay: 0.12,
        duration: 2 + Math.floor(Math.random() * 4),
        source: 'chain',
        label: `Cascade from ${RESOURCE_META[triggerResource]?.name ?? triggerResource}`,
      },
    });
  }
  return results;
}

// ─── Process existing injections + add new ones ────────────────────────────

export function processInjections(
  current: Partial<Record<ResourceType, VolatilityInjection>>,
  market: { resource: ResourceType; priceHistory: number[] }[],
): {
  injections: Partial<Record<ResourceType, VolatilityInjection>>;
  newEvents: Array<{ resource: ResourceType; injection: VolatilityInjection }>;
} {
  const newInjections: Record<string, VolatilityInjection | undefined> = { ...current };
  const newInjectionEvents: Array<{ resource: ResourceType; injection: VolatilityInjection }> = [];

  // Decay existing injections
  for (const key of Object.keys(newInjections)) {
    const inj = newInjections[key];
    if (!inj) continue;
    inj.intensity *= (1 - inj.decay);
    inj.duration -= 1;
    if (inj.duration <= 0 || inj.intensity < 0.01) {
      newInjections[key] = undefined;
    }
  }

  // Source A: Micro events
  for (const m of market) {
    if (newInjections[m.resource]) continue;
    if (Math.random() < MICRO_EVENT_CHANCE) {
      const injection = generateMicroInjection(m.resource);
      newInjections[m.resource] = injection;
      newInjectionEvents.push({ resource: m.resource, injection });
    }
  }

  // Source B: Macro events
  if (Math.random() < MACRO_EVENT_CHANCE) {
    const sectors: MarketSector[] = [
      'raw_minerals', 'raw_organic', 'basic_materials', 'components',
      'advanced', 'high_tech', 'endgame', 'agriculture',
    ];
    const targetSector = sectors[Math.floor(Math.random() * sectors.length)];
    const macroResults = generateMacroInjection(targetSector);
    for (const { resource, injection } of macroResults) {
      if (!newInjections[resource]) {
        newInjections[resource] = injection;
        newInjectionEvents.push({ resource, injection });
      }
    }
  }

  // Source C: Chain reactions from extreme price moves
  for (const m of market) {
    if (m.priceHistory.length < 2) continue;
    const mWithPrice = m as { resource: ResourceType; priceHistory: number[]; currentPrice?: number };
    if (mWithPrice.currentPrice === undefined) continue;
    const prev = mWithPrice.priceHistory[mWithPrice.priceHistory.length - 1];
    const changeRatio = mWithPrice.currentPrice / prev - 1;
    if (Math.abs(changeRatio) >= CHAIN_REACTION_THRESHOLD) {
      const chainResults = generateChainInjections(mWithPrice.resource, changeRatio);
      for (const { resource, injection } of chainResults) {
        if (!newInjections[resource]) {
          newInjections[resource] = injection;
          newInjectionEvents.push({ resource, injection });
        }
      }
    }
  }

  // Clean undefineds
  const cleanInjections: Partial<Record<ResourceType, VolatilityInjection>> = {};
  for (const [key, val] of Object.entries(newInjections)) {
    if (val) cleanInjections[key as ResourceType] = val;
  }

  return { injections: cleanInjections, newEvents: newInjectionEvents };
}
