import { RESOURCE_SECTOR, type MarketSector } from "../market/marketSimulator";
import { PRODUCTION_CHAINS, RESOURCE_META } from "../config/configCache";
import type { ResourceType } from "../shared/types/types";

export function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

export function bySector(sector: MarketSector, pool: ResourceType[]): ResourceType[] {
  return pool.filter(r => RESOURCE_SECTOR[r] === sector);
}

export function byTier(tier: number, pool: ResourceType[]): ResourceType[] {
  return pool.filter(r => (RESOURCE_META[r]?.tier ?? -1) === tier);
}

export function byChain(chainIndex: number, pool: ResourceType[]): ResourceType[] {
  const chain = PRODUCTION_CHAINS[chainIndex];
  if (!chain) return [];
  const steps = new Set(chain.steps);
  return pool.filter(r => steps.has(r));
}

export function randomBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

export const sectors: MarketSector[] = ['raw_minerals', 'raw_organic', 'basic_materials', 'components', 'advanced', 'high_tech', 'endgame', 'agriculture'];
export const tiers = [0, 1, 2, 3, 4, 5];

export function getResourceName(r: ResourceType): string {
  return RESOURCE_META[r]?.name ?? r;
}

export function getSectorName(resources: ResourceType[]): string {
  const r = resources[0];
  if (!r) return 'Market';
  const s = RESOURCE_SECTOR[r];
  return s ? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Market';
}
