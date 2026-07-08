// Offline fallback only. As of migration 013, the authoritative source for
// which resources are tradable is `game_config_market.is_tradable` in
// Supabase, exposed via `/api/game/definitions`. Edit the DB row, not this
// file. This list must stay in sync with migration 013's backfill.

import type { ResourceType } from './types';

// TRADE_COMMISSION_RATE was removed (Phase 3 Step 1+2). Authoritative
// commission now lives in balanceConfig.ts → game_config_balance.trade.commissionRate.
// Importing clients should use `getBalance().trade.commissionRate` instead.

export const TRADABLE_RESOURCES: readonly ResourceType[] = [
  'iron', 'copper', 'coal', 'oil', 'sand', 'lithium', 'water',
  'clay', 'limestone', 'gravel', 'bauxite', 'wolframite', 'rareEarth',
  'silver', 'gold',
  'ironPlate', 'copperWire', 'plastic', 'glass', 'carbon',
  'bricks', 'concrete', 'fertilizer', 'steel', 'fossilFuel',
] as const;

export const TRADABLE_RESOURCES_SET: ReadonlySet<ResourceType> = new Set(TRADABLE_RESOURCES);
