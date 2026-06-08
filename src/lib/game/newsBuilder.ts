/**
 * News Builder Module — Structured EventPacket Builder + Enhanced Templates
 *
 * Architecture:
 *   simulateMarketTick() produces raw data
 *   → newsBuilder converts to EventPackets (structured data)
 *   → EventPackets go to newsLLM for text generation
 *   → Final MarketNews objects returned
 *
 * This module bridges the market simulation engine and the LLM layer,
 * providing both structured event packets and a rich deterministic
 * fallback template system with anti-repetition.
 */

import { MarketNews, MarketNarrative, VolatilityInjection, MarketSector } from './marketSimulator';
import { ResourceType } from './types';
import { RESOURCE_META } from './configCache';

// ═══════════════════════════════════════════════════════════════════════════
// News System Configuration — Tunable Game-Balance Parameters
// ═══════════════════════════════════════════════════════════════════════════
//
// All game-balance knobs for the news system in one place.
// System-level constants (timeouts, cache sizes, rate limits) stay in their
// respective modules — only gameplay-affecting thresholds live here.
//
// Why extract these?
//   - Difficulty settings: easy mode could show all 2%+ moves, hard mode only 8%+
//   - Late-game tuning: endgame resources are more volatile, may need different thresholds
//   - Player feedback: "too much news" / "too little news" becomes a config change
// ═══════════════════════════════════════════════════════════════════════════

export const NEWS_CONFIG = {
  // ── Price Move News ────────────────────────────────────────────────────
  priceMove: {
    threshold: 0.04,            // Min % change to generate news (0.04 = 4%)
    severity: {
      medium: 0.06,            // >6% change = medium severity
      high: 0.10,              // >10% change = high severity
    },
    causeRatio: {
      bubble: 2.0,             // Price >2× base → speculative bubble
      shortage: 1.3,           // Price >1.3× base & rising → supply shortage
      oversupply: 0.7,         // Price <0.7× base & falling → oversupply
      crash: 0.4,              // Price <0.4× base & falling → market crash
    },
  },

  // ── Volatility News ────────────────────────────────────────────────────
  volatility: {
    minIntensity: 0.3,          // Min injection intensity to generate news
    severity: {
      medium: 0.2,             // >0.2 intensity = medium severity
      high: 0.5,               // >0.5 intensity = high severity
    },
  },

  // ── Sector News ────────────────────────────────────────────────────────
  sector: {
    threshold: 0.03,            // Min avg sector change to generate news (0.03 = 3%)
    severity: {
      medium: 0.05,            // >5% avg change = medium severity
      high: 0.08,              // >8% avg change = high severity
    },
  },

  // ── Trade News ─────────────────────────────────────────────────────────
  trade: {
    minVolume: 20,              // Min total trade volume to generate news
    imbalanceRatio: 0.6,        // Min buy/sell imbalance ratio (0.6 = 60%)
    highVolumeThreshold: 100,   // Volume above this = high severity
  },

  // ── Simulation Engine Throttling ───────────────────────────────────────
  simulation: {
    priceMoveThresholdHigh: 0.06,  // Skip price moves below this in sim (6%)
    chainReactionThreshold: 0.08,   // Price change that triggers chain reactions (8%)
    resourceCooldownTicks: 50,      // Min ticks between same-resource news
    sectorCooldownTicks: 100,       // Min ticks between same-sector news
    categoryCooldownTicks: 25,      // Min ticks between same-category news
    maxNewsPerTick: 3,              // Max news items per simulation step
    maxNarrativesPerTick: 3,        // Max narratives per simulation step
    maxNewsItems: 30,               // Max news items stored
    maxNarrativeItems: 20,          // Max narrative items stored
    gameDayTicks: 600,              // 1 game day = 600 ticks (~10 min at 1x)
  },
} as const;

/** Type for the config so other modules can import it */
export type NewsConfig = typeof NEWS_CONFIG;

// ═══════════════════════════════════════════════════════════════════════════
// EventPacket Type
// ═══════════════════════════════════════════════════════════════════════════

export interface EventPacket {
  type: 'price_move' | 'volatility' | 'sector' | 'trade';
  resource: string;
  delta: string;
  severity: 'low' | 'medium' | 'high';
  context: {
    cause?: string;
    region?: string;
    sectorName?: string;
    source?: string;
    volume?: number;
    trend?: string;
    oldPrice?: number;
    newPrice?: number;
    basePrice?: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Sector Info (duplicated from marketSimulator to avoid circular deps
// or heavy imports — kept self-contained)
// ═══════════════════════════════════════════════════════════════════════════

const SECTOR_NAMES: Record<MarketSector, string> = {
  raw_minerals: 'Raw Minerals',
  raw_organic: 'Organic & Rare',
  basic_materials: 'Basic Materials',
  components: 'Components',
  advanced: 'Advanced Goods',
  high_tech: 'High Tech',
  endgame: 'Endgame',
  agriculture: 'Agriculture',
};

// ═══════════════════════════════════════════════════════════════════════════
// Helper: Resource display name
// ═══════════════════════════════════════════════════════════════════════════

function resourceName(resource: string): string {
  return RESOURCE_META[resource as ResourceType]?.name ?? resource;
}

// ═══════════════════════════════════════════════════════════════════════════
// Core Builder Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build an EventPacket from a price movement.
 * Returns null if the change is less than NEWS_CONFIG.priceMove.threshold.
 */
export function buildEventPacketFromPriceMove(
  resource: ResourceType,
  oldPrice: number,
  newPrice: number,
  basePrice: number,
): EventPacket | null {
  const changeRatio = (newPrice - oldPrice) / oldPrice;
  const absChange = Math.abs(changeRatio);

  // Threshold: skip changes below configured minimum
  if (absChange < NEWS_CONFIG.priceMove.threshold) return null;

  // Delta as percentage string like "+6.2%" or "-3.1%"
  const sign = changeRatio > 0 ? '+' : '';
  const delta = `${sign}${(changeRatio * 100).toFixed(1)}%`;

  // Severity from change magnitude
  const severity: 'low' | 'medium' | 'high' =
    absChange > NEWS_CONFIG.priceMove.severity.high ? 'high'
    : absChange > NEWS_CONFIG.priceMove.severity.medium ? 'medium'
    : 'low';

  // Price ratio relative to base
  const priceRatio = newPrice / basePrice;
  const goingUp = changeRatio > 0;

  // Cause inference
  let cause: string;
  if (priceRatio > NEWS_CONFIG.priceMove.causeRatio.bubble) {
    cause = 'speculative bubble';
  } else if (priceRatio > NEWS_CONFIG.priceMove.causeRatio.shortage && goingUp) {
    cause = 'supply shortage';
  } else if (priceRatio < NEWS_CONFIG.priceMove.causeRatio.crash && !goingUp) {
    cause = 'market crash';
  } else if (priceRatio < NEWS_CONFIG.priceMove.causeRatio.oversupply && !goingUp) {
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

/**
 * Build an EventPacket from an MVIL injection event.
 */
export function buildEventPacketFromVolatility(
  resource: ResourceType,
  injection: VolatilityInjection,
): EventPacket {
  const direction = injection.direction > 0 ? 'up' : 'down';
  const intensityLabel =
    injection.intensity > NEWS_CONFIG.volatility.severity.high ? 'high'
    : injection.intensity > NEWS_CONFIG.volatility.severity.medium ? 'medium'
    : 'low';
  const sign = injection.direction > 0 ? '+' : '';
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

/**
 * Build an EventPacket from a sector-wide movement.
 * Returns null if avgChange is less than NEWS_CONFIG.sector.threshold.
 */
export function buildEventPacketFromSector(
  sector: MarketSector,
  trend: 'up' | 'down' | 'stable',
  avgChange: number,
): EventPacket | null {
  const absChange = Math.abs(avgChange);

  // Threshold: skip sector movements below configured minimum
  if (absChange < NEWS_CONFIG.sector.threshold || trend === 'stable') return null;

  const sign = avgChange > 0 ? '+' : '';
  const delta = `${sign}${(avgChange * 100).toFixed(1)}%`;
  const severity: 'low' | 'medium' | 'high' =
    absChange > NEWS_CONFIG.sector.severity.high ? 'high'
    : absChange > NEWS_CONFIG.sector.severity.medium ? 'medium'
    : 'low';

  return {
    type: 'sector',
    resource: sector,
    delta,
    severity,
    context: {
      sectorName: SECTOR_NAMES[sector] ?? sector,
      trend,
      cause: trend === 'up' ? 'sector-wide rally' : 'sector-wide downturn',
    },
  };
}

/**
 * Build an EventPacket from trade volume imbalance.
 * Returns null if thresholds not met (see NEWS_CONFIG.trade).
 */
export function buildEventPacketFromTrade(
  resource: ResourceType,
  recentSells: number,
  recentBuys: number,
): EventPacket | null {
  const totalVolume = recentSells + recentBuys;
  const imbalance = Math.abs(recentSells - recentBuys);

  // Threshold: skip low volume or low imbalance
  if (totalVolume < NEWS_CONFIG.trade.minVolume || imbalance / totalVolume < NEWS_CONFIG.trade.imbalanceRatio) return null;

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
      cause: dominantSide === 'buy' ? 'buy-heavy activity' : 'sell-heavy activity',
      volume: totalVolume,
      trend: dominantSide === 'buy' ? 'up' : 'down',
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Analyst Insight Phrases
// ═══════════════════════════════════════════════════════════════════════════

const UP_INSIGHTS = [
  'bullish momentum is sustained',
  'further gains may follow',
  'resistance levels are being tested',
  'buying pressure remains elevated',
  'institutional interest is growing',
];

const DOWN_INSIGHTS = [
  'support levels are being challenged',
  'further downside is possible',
  'sell-offs may accelerate',
  'risk sentiment has deteriorated',
  'capital is rotating elsewhere',
];

const NEUTRAL_INSIGHTS = [
  'market is recalibrating',
  'consolidation is underway',
  'traders are reassessing positions',
  'volume patterns are shifting',
  'price discovery continues',
];

// ═══════════════════════════════════════════════════════════════════════════
// Outlook Phrases
// ═══════════════════════════════════════════════════════════════════════════

const BULLISH_OUTLOOKS = [
  'continued upside potential',
  'favorable conditions ahead',
  'sustained demand expected',
];

const BEARISH_OUTLOOKS = [
  'caution warranted going forward',
  'headwinds persist in the near term',
  'downside risks remain elevated',
];

const NEUTRAL_OUTLOOKS = [
  'mixed signals in the broader market',
  'stabilization likely in coming sessions',
  'traders watching for clearer direction',
];

// ═══════════════════════════════════════════════════════════════════════════
// Enhanced Deterministic Fallback Templates
// ═══════════════════════════════════════════════════════════════════════════

const PRICE_MOVE_UP_TEMPLATES = [
  '{name} prices surged {pct}% amid {cause}, with analysts noting {insight}.',
  'A sharp {pct}% increase in {name} values was recorded as {cause} drove market activity.',
  '{name} markets rallied {pct}% following reports of {cause}. Traders see {outlook}.',
  'Rising {pct}% in {name} valuation reflects growing {cause} pressures across the sector.',
  '{name} spot prices jumped {pct}% in the latest session, triggered by {cause}.',
  'Market data shows {name} appreciating {pct}% as {cause} reshapes supply dynamics.',
  'Investors bid up {name} by {pct}% on the back of {cause}, with {insight}.',
  '{name} climbed {pct}% in active trading, fueled by {cause} and supported by {outlook}.',
];

const PRICE_MOVE_DOWN_TEMPLATES = [
  '{name} prices dropped {pct}% amid {cause}, with analysts warning {insight}.',
  'A steep {pct}% decline in {name} values was recorded as {cause} weighed on sentiment.',
  '{name} markets slumped {pct}% following reports of {cause}. Traders see {outlook}.',
  'Falling {pct}% in {name} valuation reflects mounting {cause} pressures across the sector.',
  '{name} spot prices fell {pct}% in the latest session, triggered by {cause}.',
  'Market data shows {name} depreciating {pct}% as {cause} reshapes demand dynamics.',
  'Investors unloaded {name} driving a {pct}% decline on the back of {cause}, with {insight}.',
  '{name} declined {pct}% in heavy trading, pressured by {cause} and compounded by {outlook}.',
];

const VOLATILITY_MICRO_TEMPLATES = [
  'A localized disruption is pushing {name} prices {direction}. {cause}.',
  'Short-term volatility in {name} markets detected. {cause}. Intensity: {intensity}.',
  'Micro-level price disturbance in {name} — {cause}. Market participants adjusting.',
  '{name} experiencing {intensity} volatility from a localized event. {cause}.',
  'A brief {intensity} shock hit {name} trading. {cause}. Expect quick normalization.',
  'Traders report {intensity} turbulence in {name} spot markets. {cause}.',
];

const VOLATILITY_MACRO_TEMPLATES = [
  'A macro-economic event is driving {direction} pressure across the {sector} sector. {cause}.',
  'Systemic market shift detected — {name} affected by broad {direction} trend. {cause}.',
  'Sector-wide {intensity} event impacts {name}. {cause}. Ripple effects possible.',
  '{sector} sector faces {intensity} headwinds. {name} prices adjust {direction}. {cause}.',
  'Major economic catalyst pushes {name} {direction}. {cause}. Full sector impact unfolding.',
  'Macro disruption reverberates through {sector}. {name} moves {direction} with {intensity} intensity. {cause}.',
];

const VOLATILITY_CHAIN_TEMPLATES = [
  'Cascading market effects are pushing {name} prices {direction}. {cause}.',
  'Chain reaction in {sector} sector drags {name} {direction}. {cause}.',
  'Correlation-driven movement: {name} caught in {direction} cascade. {cause}.',
  'Domino effect across supply chains moves {name} {direction}. {cause}. Intensity: {intensity}.',
  '{name} swept up in a {direction} chain reaction. {cause}. Downstream impact possible.',
  'Cascading price adjustments hit {name} with {intensity} force. {cause}. Watch for further propagation.',
];

const SECTOR_RALLY_TEMPLATES = [
  '{sector} sector is rallying with an average price gain of {pct}%. Investor confidence rising.',
  'Broad-based strength in {sector} — prices up {pct}% on average. Multiple resources contributing.',
  '{sector} sector on the upswing: {pct}% average gain. Strong buying interest across the board.',
  'Investors rotate into {sector}, lifting prices {pct}% on average. Momentum building.',
  '{sector} sector rally gains steam with {pct}% average uplift. Bullish sentiment prevails.',
  'Widespread gains in {sector} push average prices {pct}% higher. Risk appetite increasing.',
];

const SECTOR_DOWNTURN_TEMPLATES = [
  '{sector} sector is declining with an average price drop of {pct}%. Market participants exercising caution.',
  'Broad-based weakness in {sector} — prices down {pct}% on average. Sellers dominating.',
  '{sector} sector under pressure: {pct}% average decline. Multiple resources retreating.',
  'Investors exit {sector}, pushing prices {pct}% lower on average. Risk-off sentiment.',
  '{sector} sector downturn deepens with {pct}% average loss. Cautious trading prevails.',
  'Widespread losses in {sector} drag average prices {pct}% lower. Safe-haven flows increasing.',
];

const TRADE_BUY_HEAVY_TEMPLATES = [
  'Heavy buying activity detected in {name} market. Volume at {volume} units with significant buy-side imbalance.',
  'Unusual demand pressure in {name} — buyers dominate with {volume} units traded. Supply tightening.',
  '{name} sees concentrated buying: {volume} units exchanged. Bid-ask spreads widening upward.',
  'Strong accumulation pattern in {name} with {volume} units traded. Institutional buyers suspected.',
  '{name} market shows aggressive bidding. {volume} units traded with buy-side dominance. Price impact expected.',
  'Demand spike in {name} — {volume} units traded as buyers outpace sellers. Inventory levels draw down.',
];

const TRADE_SELL_HEAVY_TEMPLATES = [
  'Heavy selling activity detected in {name} market. Volume at {volume} units with significant sell-side imbalance.',
  'Unusual supply pressure in {name} — sellers dominate with {volume} units traded. Prices softening.',
  '{name} sees concentrated selling: {volume} units exchanged. Offer volume overwhelming bids.',
  'Strong distribution pattern in {name} with {volume} units traded. Institutional sellers suspected.',
  '{name} market shows aggressive offering. {volume} units traded with sell-side dominance. Downward pressure building.',
  'Supply surge in {name} — {volume} units traded as sellers outpace buyers. Inventory levels building.',
];

// ═══════════════════════════════════════════════════════════════════════════
// Title Templates
// ═══════════════════════════════════════════════════════════════════════════

const TITLE_PRICE_UP = [
  '{name} Surges',
  '{name} Rallies',
  '{name} Climbs Sharply',
  'Rising {name} Demand',
  '{name} Price Spike',
  'Bullish {name} Move',
];

const TITLE_PRICE_DOWN = [
  '{name} Drops',
  '{name} Under Pressure',
  '{name} Declines',
  'Falling {name} Prices',
  '{name} Sell-Off',
  'Bearish {name} Signal',
];

const TITLE_VOLATILITY = [
  '{name} Volatility Alert',
  'Market Shock: {name}',
  '{source} Event: {name}',
  '{name} Disruption',
  'Sector Shock Wave',
  'Cascading {name} Effect',
];

const TITLE_SECTOR = [
  '{sector} Sector Rally',
  '{sector} Sector Slump',
  '{sector} On The Move',
  'Broad {sector} Shift',
  '{sector} Market Shift',
  '{sector} Trend Change',
];

const TITLE_TRADE = [
  'Heavy {name} Trading',
  '{name} Volume Spike',
  'Unusual {name} Activity',
  '{name} Trade Imbalance',
  '{name} Order Flow Surge',
  'Active {name} Session',
];

// ═══════════════════════════════════════════════════════════════════════════
// Anti-Repetition System
// ═══════════════════════════════════════════════════════════════════════════

const ANTI_REPEAT_WINDOW = 3;

type TemplateCategory =
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
function selectTemplate(templates: string[], category: TemplateCategory): number {
  const recent = recentTemplates[category];
  const len = templates.length;

  // Try to find an index not in the recent window
  const available: number[] = [];
  for (let i = 0; i < len; i++) {
    if (!recent.includes(i)) {
      available.push(i);
    }
  }

  // If all indices are in the window (shouldn't happen with window < len),
  // fall back to random selection
  const pool = available.length > 0 ? available : Array.from({ length: len }, (_, i) => i);
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  // Update rolling window
  recent.push(chosen);
  if (recent.length > ANTI_REPEAT_WINDOW) {
    recent.shift();
  }

  return chosen;
}

// ═══════════════════════════════════════════════════════════════════════════
// Template Variable Substitution
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Random Phrase Helpers
// ═══════════════════════════════════════════════════════════════════════════

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

function severityLabel(severity: 'low' | 'medium' | 'high'): string {
  switch (severity) {
    case 'high': return 'severe';
    case 'medium': return 'moderate';
    case 'low': return 'minor';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Core Generation Function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate deterministic fallback text from an EventPacket.
 * Uses the rich template system with anti-repetition.
 * Returns title and description.
 */
export function generateFallbackText(
  packet: EventPacket,
): { title: string; description: string } {
  const name = resourceName(packet.resource);
  const trend = (packet.context.trend ?? 'stable') as 'up' | 'down' | 'stable';
  const pct = packet.delta.replace(/[+-]/, '').replace(/%$/, ''); // raw percentage number for templates
  const cause = packet.context.cause ?? 'market forces';
  const insight = getInsight(trend);
  const outlook = getOutlook(trend);
  const intensity = severityLabel(packet.severity);

  let title = '';
  let description = '';

  switch (packet.type) {
    case 'price_move': {
      const isUp = trend === 'up';

      // --- Description ---
      const descTemplates = isUp ? PRICE_MOVE_UP_TEMPLATES : PRICE_MOVE_DOWN_TEMPLATES;
      const descCat: TemplateCategory = isUp ? 'price_up' : 'price_down';
      const descIdx = selectTemplate(descTemplates, descCat);
      description = substituteVars(descTemplates[descIdx], {
        name,
        pct,
        cause,
        insight,
        outlook,
      });

      // --- Title ---
      const titleTemplates = isUp ? TITLE_PRICE_UP : TITLE_PRICE_DOWN;
      const titleCat: TemplateCategory = isUp ? 'title_price_up' : 'title_price_down';
      const titleIdx = selectTemplate(titleTemplates, titleCat);
      title = substituteVars(titleTemplates[titleIdx], { name });
      break;
    }

    case 'volatility': {
      const source = packet.context.source ?? 'micro';
      const direction = trend === 'up' ? 'upward' : 'downward';
      const sector = packet.context.sectorName ?? '';

      // Select template sub-category based on source
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

      // --- Title ---
      const titleIdx = selectTemplate(TITLE_VOLATILITY, 'title_volatility');
      title = substituteVars(TITLE_VOLATILITY[titleIdx], {
        name,
        source: source.charAt(0).toUpperCase() + source.slice(1),
      });
      break;
    }

    case 'sector': {
      const sectorName = packet.context.sectorName ?? name;
      const isUp = trend === 'up';

      // --- Description ---
      const descTemplates = isUp ? SECTOR_RALLY_TEMPLATES : SECTOR_DOWNTURN_TEMPLATES;
      const descCat: TemplateCategory = isUp ? 'sector_up' : 'sector_down';
      const descIdx = selectTemplate(descTemplates, descCat);
      description = substituteVars(descTemplates[descIdx], {
        sector: sectorName,
        pct,
        cause,
        outlook,
      });

      // --- Title ---
      const titleIdx = selectTemplate(TITLE_SECTOR, 'title_sector');
      title = substituteVars(TITLE_SECTOR[titleIdx], { sector: sectorName });
      break;
    }

    case 'trade': {
      const isBuyHeavy = packet.context.cause?.includes('buy') ?? false;
      const volume = packet.context.volume?.toFixed(0) ?? '0';

      // --- Description ---
      const descTemplates = isBuyHeavy ? TRADE_BUY_HEAVY_TEMPLATES : TRADE_SELL_HEAVY_TEMPLATES;
      const descCat: TemplateCategory = isBuyHeavy ? 'trade_buy' : 'trade_sell';
      const descIdx = selectTemplate(descTemplates, descCat);
      description = substituteVars(descTemplates[descIdx], {
        name,
        volume,
        cause,
      });

      // --- Title ---
      const titleIdx = selectTemplate(TITLE_TRADE, 'title_trade');
      title = substituteVars(TITLE_TRADE[titleIdx], { name });
      break;
    }
  }

  return { title, description };
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility: Build a full MarketNews from an EventPacket (deterministic path)
// ═══════════════════════════════════════════════════════════════════════════

export function generateNewsId(): string {
  return 'nws-' + Math.random().toString(36).substring(2, 8);
}

/**
 * Convert an EventPacket into a MarketNews object using the deterministic
 * fallback template system. This is the "no-LLM" path.
 */
export function eventPacketToMarketNews(
  packet: EventPacket,
  gameTick: number,
  affectedResources?: ResourceType[],
): MarketNews {
  const { title, description } = generateFallbackText(packet);
  const name = resourceName(packet.resource);

  return {
    id: generateNewsId(),
    title,
    description,
    affectedResources: affectedResources ?? [packet.resource as ResourceType],
    impactSummary: `${name} ${packet.delta}`,
    severity: packet.severity,
    gameTick,
    category: packet.type === 'price_move' ? 'price_move'
      : packet.type === 'volatility' ? 'volatility'
      : packet.type === 'sector' ? 'sector'
      : 'trade',
  };
}
