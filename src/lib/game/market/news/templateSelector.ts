// ============================================
// FACTORY DOMINION: TEMPLATE SELECTOR
// Split from newsBuilder.ts — owns anti-repeat selection state only.
// ============================================

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

const recentTemplates: Record<TemplateCategory, number[]> = {
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

/**
 * Select a template index from the given array, preferring ones NOT in the
 * recent anti-repetition window. Updates the rolling window automatically.
 */
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
