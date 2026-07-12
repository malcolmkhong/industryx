/**
 * Market Simulator — Back-Compat Re-Export Shell
 *
 * Re-exports active market types and helpers from engine/ modules.
 * Runtime simulation functions (simulateMarketTick) were removed when Supabase RPC
 * apply_market_tick replaced the client-side engine (BUG-041).
 */

export {
  // Sectors + display
  type MarketSector,
  RESOURCE_SECTOR,
  RESOURCE_ELASTICITY,
  getSectorInfo,
  // Correlations
  PRICE_CORRELATIONS,
  type PriceCorrelation,
  // MVIL types (only VolatilityInjection is active)
  type VolatilityInjection,
  // Market news types
  type MarketNews,
  type MarketNarrative,
} from './engine';

// Severity style helper (kept here for back-compat)
export type MarketNewsCategory = 'price_move' | 'volatility' | 'correlation' | 'sector' | 'trade';

export function getSeverityStyle(severity: 'low' | 'medium' | 'high'): {
  color: string; bg: string; border: string; dot: string;
} {
  switch (severity) {
    case 'high':   return { color: 'text-danger',    bg: 'bg-danger/20/10',         border: 'border-danger/20',         dot: 'bg-danger' };
    case 'medium': return { color: 'text-warning',   bg: 'bg-warning/10',            border: 'border-warning/20',        dot: 'bg-warning/50' };
    case 'low':    return { color: 'text-muted-label', bg: 'bg-900-gray/10',         border: 'border-muted-label/40/20', dot: 'bg-muted-label/40' };
  }
}

export function getCategoryIcon(category: MarketNewsCategory): string {
  switch (category) {
    case 'price_move':  return '??';
    case 'volatility':  return '?';
    case 'correlation': return '??';
    case 'sector':      return '??';
    case 'trade':       return '??';
  }
}

