// ============================================
// FACTORY DOMINION: NEWS CONFIG
// Split from newsBuilder.ts.
// ============================================

export const NEWS_CONFIG = {
  priceMove: {
    threshold: 0.04,
    severity: {
      medium: 0.06,
      high: 0.1,
    },
    causeRatio: {
      bubble: 2.0,
      shortage: 1.3,
      oversupply: 0.7,
      crash: 0.4,
    },
  },
  volatility: {
    minIntensity: 0.3,
    severity: {
      medium: 0.2,
      high: 0.5,
    },
  },
  sector: {
    threshold: 0.03,
    severity: {
      medium: 0.05,
      high: 0.08,
    },
  },
  trade: {
    minVolume: 20,
    imbalanceRatio: 0.6,
    highVolumeThreshold: 100,
  },
  simulation: {
    priceMoveThresholdHigh: 0.06,
    chainReactionThreshold: 0.08,
    resourceCooldownTicks: 50,
    sectorCooldownTicks: 100,
    categoryCooldownTicks: 25,
    maxNewsPerTick: 3,
    maxNarrativesPerTick: 3,
    maxNewsItems: 30,
    maxNarrativeItems: 20,
    gameDayTicks: 600,
  },
} as const;

export type NewsConfig = typeof NEWS_CONFIG;
