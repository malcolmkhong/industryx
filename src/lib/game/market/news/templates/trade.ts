// ============================================
// FACTORY DOMINION: TRADE TEMPLATES
// Split from newsBuilder.ts — behavior-identical data move.
// ============================================

export const TRADE_BUY_HEAVY_TEMPLATES = [
  'Heavy buying activity detected in {name} market. Volume at {volume} units with significant buy-side imbalance.',
  'Unusual demand pressure in {name} — buyers dominate with {volume} units traded. Supply tightening.',
  '{name} sees concentrated buying: {volume} units exchanged. Bid-ask spreads widening upward.',
  'Strong accumulation pattern in {name} with {volume} units traded. Institutional buyers suspected.',
  '{name} market shows aggressive bidding. {volume} units traded with buy-side dominance. Price impact expected.',
  'Demand spike in {name} — {volume} units traded as buyers outpace sellers. Inventory levels draw down.',
];

export const TRADE_SELL_HEAVY_TEMPLATES = [
  'Heavy selling activity detected in {name} market. Volume at {volume} units with significant sell-side imbalance.',
  'Unusual supply pressure in {name} — sellers dominate with {volume} units traded. Prices softening.',
  '{name} sees concentrated selling: {volume} units exchanged. Offer volume overwhelming bids.',
  'Strong distribution pattern in {name} with {volume} units traded. Institutional sellers suspected.',
  '{name} market shows aggressive offering. {volume} units traded with sell-side dominance. Downward pressure building.',
  'Supply surge in {name} — {volume} units traded as sellers outpace buyers. Inventory levels building.',
];
