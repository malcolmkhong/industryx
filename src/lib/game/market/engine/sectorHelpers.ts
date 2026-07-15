// ─── Sector Display Info ───────────────────────────────────────────────────
// Used by UI components (MarketPanel). Color matches Tailwind theme tokens.

import type { MarketSector } from './sectorDefinitions';

export function getSectorInfo(sector: MarketSector): { name: string; color: string; icon: string } {
  switch (sector) {
    case 'raw_minerals':    return { name: 'Raw Minerals', color: 'text-warning', icon: 'game-icons:ore' };
    case 'raw_organic':     return { name: 'Organic & Rare', color: 'text-success', icon: 'game-icons:oil-rig' };
    case 'basic_materials': return { name: 'Basic Materials', color: 'text-brand/80', icon: 'game-icons:metal-bar' };
    case 'components':      return { name: 'Components', color: 'text-research', icon: 'game-icons:circuitry' };
    case 'advanced':        return { name: 'Advanced Goods', color: 'text-danger', icon: 'game-icons:gear-hammer' };
    case 'high_tech':       return { name: 'High Tech', color: 'text-premium', icon: 'game-icons:processor' };
    case 'endgame':         return { name: 'Endgame', color: 'text-research', icon: 'game-icons:atomic-slashes' };
    case 'agriculture':     return { name: 'Agriculture', color: 'text-success', icon: 'game-icons:fertilizer-bag' };
    default:
      throw new Error(`Unknown MarketSector: ${String(sector)}`);
  }
}
