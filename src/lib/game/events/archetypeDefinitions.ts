import type { ResourceType } from "../shared/types/types";
import { RESOURCE_SECTOR } from "../market/marketSimulator";
import { PRODUCTION_CHAINS } from "../config/configCache";
import { byChain, bySector, byTier, pickRandom, randomBetween, sectors, tiers } from "./eventRandom";

export interface EventArchetype {
  id: string;
  icon: string;
  weight: number;
  direction: 'up' | 'down' | 'mixed';
  namePattern: string;
  descriptionPattern: string;
  targetCount: (pool: ResourceType[]) => number;
  selectResources: (pool: ResourceType[]) => ResourceType[];
  generateMultiplier: (resource: ResourceType, index: number, total: number) => number;
}

export const EVENT_ARCHETYPES: EventArchetype[] = [
  {
    id: 'single_rocket', icon: '🚀', weight: 20, direction: 'up',
    namePattern: '{name} Moonshot',
    descriptionPattern: 'Suddenly in high demand — prices explode',
    targetCount: () => 1,
    selectResources: (pool) => pickRandom(pool, 1),
    generateMultiplier: () => randomBetween(2, 4),
  },
  {
    id: 'single_crash', icon: '📉', weight: 20, direction: 'down',
    namePattern: '{name} Glut',
    descriptionPattern: 'Massive oversupply floods the market',
    targetCount: () => 1,
    selectResources: (pool) => pickRandom(pool, 1),
    generateMultiplier: () => randomBetween(0.3, 0.6),
  },
  {
    id: 'sector_wave', icon: '📈', weight: 12, direction: 'up',
    namePattern: '{sector} Sector Boom',
    descriptionPattern: 'A wave of demand sweeps the sector',
    targetCount: () => 2 + Math.floor(Math.random() * 3),
    selectResources: (pool) => {
      const sector = sectors[Math.floor(Math.random() * sectors.length)];
      return pickRandom(bySector(sector, pool), 2 + Math.floor(Math.random() * 3));
    },
    generateMultiplier: () => randomBetween(1.5, 2.5),
  },
  {
    id: 'sector_dump', icon: '📊', weight: 8, direction: 'down',
    namePattern: '{sector} Sector Bust',
    descriptionPattern: 'The whole sector faces a downturn',
    targetCount: () => 2 + Math.floor(Math.random() * 3),
    selectResources: (pool) => {
      const sector = sectors[Math.floor(Math.random() * sectors.length)];
      return pickRandom(bySector(sector, pool), 2 + Math.floor(Math.random() * 3));
    },
    generateMultiplier: () => randomBetween(0.4, 0.7),
  },
  {
    id: 'divergence', icon: '↔️', weight: 8, direction: 'mixed',
    namePattern: 'Divergent Markets',
    descriptionPattern: 'One sector rises while another falls',
    targetCount: () => 4,
    selectResources: (pool) => {
      const [s1, s2] = pickRandom(sectors, 2);
      return [...pickRandom(bySector(s1, pool), 2), ...pickRandom(bySector(s2, pool), 2)];
    },
    generateMultiplier: (_, i) => (i < 2 ? randomBetween(1.5, 3) : randomBetween(0.4, 0.7)),
  },
  {
    id: 'chain_reaction', icon: '🔗', weight: 6, direction: 'mixed',
    namePattern: 'Supply Chain Disruption',
    descriptionPattern: 'Ripple effects cascade through processing tiers',
    targetCount: () => 3,
    selectResources: (pool) => {
      const i = Math.floor(Math.random() * PRODUCTION_CHAINS.length);
      return pickRandom(byChain(i, pool), 3);
    },
    generateMultiplier: (_, i) => {
      if (i === 0) return randomBetween(0.4, 0.7);
      if (i === 1) return randomBetween(1, 2);
      return randomBetween(2, 3);
    },
  },
  {
    id: 'chain_boom', icon: '🏭', weight: 3, direction: 'up',
    namePattern: 'Industry Surge',
    descriptionPattern: 'Entire production chain explodes with demand',
    targetCount: () => 3,
    selectResources: (pool) => {
      const i = Math.floor(Math.random() * PRODUCTION_CHAINS.length);
      return pickRandom(byChain(i, pool), 3);
    },
    generateMultiplier: () => randomBetween(1.5, 3),
  },
  {
    id: 'chain_bust', icon: '🏚️', weight: 3, direction: 'down',
    namePattern: 'Industry Collapse',
    descriptionPattern: 'Entire production chain faces demand collapse',
    targetCount: () => 3,
    selectResources: (pool) => {
      const i = Math.floor(Math.random() * PRODUCTION_CHAINS.length);
      return pickRandom(byChain(i, pool), 3);
    },
    generateMultiplier: () => randomBetween(0.3, 0.6),
  },
  {
    id: 'tier_breakthrough', icon: '💡', weight: 6, direction: 'up',
    namePattern: 'Tier {tier} Breakthrough',
    descriptionPattern: 'Technological leap boosts an entire tier',
    targetCount: (pool) => byTier(tiers[Math.floor(Math.random() * tiers.length)], pool).length,
    selectResources: (pool) => {
      const tier = tiers[Math.floor(Math.random() * tiers.length)];
      return byTier(tier, pool);
    },
    generateMultiplier: () => randomBetween(1.5, 2),
  },
  {
    id: 'tier_collapse', icon: '💥', weight: 5, direction: 'down',
    namePattern: 'Tier {tier} Collapse',
    descriptionPattern: 'An entire tier faces obsolescence',
    targetCount: (pool) => byTier(tiers[Math.floor(Math.random() * tiers.length)], pool).length,
    selectResources: (pool) => {
      const tier = tiers[Math.floor(Math.random() * tiers.length)];
      return byTier(tier, pool);
    },
    generateMultiplier: () => randomBetween(0.4, 0.7),
  },
  {
    id: 'random_roulette', icon: '🎰', weight: 4, direction: 'mixed',
    namePattern: 'Market Roulette',
    descriptionPattern: 'Random resources go wild — some up, some down',
    targetCount: () => 3 + Math.floor(Math.random() * 3),
    selectResources: (pool) => pickRandom(pool, 3 + Math.floor(Math.random() * 3)),
    generateMultiplier: () => randomBetween(0.4, 3),
  },
  {
    id: 'complementary_pair', icon: '🤝', weight: 2, direction: 'up',
    namePattern: 'Synergy Surge',
    descriptionPattern: 'Two resources from same sector both skyrocket',
    targetCount: () => 2,
    selectResources: (pool) => {
      const r1 = pool[Math.floor(Math.random() * pool.length)];
      const sector = RESOURCE_SECTOR[r1];
      const peers = bySector(sector, pool).filter(r => r !== r1);
      const r2 = peers.length > 0 ? peers[Math.floor(Math.random() * peers.length)] : pool[Math.floor(Math.random() * pool.length)];
      return [r1, r2];
    },
    generateMultiplier: () => randomBetween(1.5, 2.5),
  },
  {
    id: 'substitute_shift', icon: '🔄', weight: 2, direction: 'mixed',
    namePattern: 'Substitution Wave',
    descriptionPattern: 'One resource replaces another in the market',
    targetCount: () => 2,
    selectResources: (pool) => pickRandom(pool, 2),
    generateMultiplier: (_, i) => (i === 0 ? randomBetween(2, 3) : randomBetween(0.3, 0.5)),
  },
];
