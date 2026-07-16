// ============================================
// FACTORY DOMINION: BALANCE TYPES
// Split from balanceConfig.ts — type definitions only.
// ============================================

export type Validator = (
  v: unknown,
) => { ok: true } | { ok: false; reason: string };

export interface GameBalanceConfig {
  rp: {
    passiveBase: number;
    aiLabBonus: number;
    extractorRate: number;
    powerRate: number;
    factoryT1Rate: number;
    factoryT2Rate: number;
    factoryT3Rate: number;
    factoryT4Rate: number;
    factoryT5Rate: number;
    completionRefundRatio: number;
  };
  worker: {
    xpPerTick: number;
    efficiencyGainPerTick: number;
    maxPowerReductionPerBuilding: number;
    levelUpXpBase: number;
  };
  building: {
    upgradeEfficiencyGain: number;
  };
  transport: {
    productionBonusCoeff: number;
    upgradeCostExponent: number;
  };
  contract: {
    tierRewardCoeff: number;
    difficultyRewardCoeff: number;
    difficultyResourceCoeff: number;
  };
  autoSell: {
    thresholdRatio: number;
    excessSellRatio: number;
    maxSellCapacityRatio: number;
    softCapRatio: number;
  };
  market: {
    baseSellMultiplier: number;
    buyPriceMarkup: number;
    pressureFactor: number;
    volatilityDecay: number;
    minPrice: number;
    maxPrice: number;
    eventThreshold: number;
    spikeCap: number;
    breakerCooldown: number;
    supplyDemandScale: number;
    soldOutEscapeTicks: number;
    tradeImpactNotifyCooldownMs: number;
  };
  drone: {
    difficultyPerFactoryPair: number;
    capacityUpgradeCoeff: number;
    fuelEfficiencyUpgradeCoeff: number;
    speedUpgradeCoeff: number;
  };
  storage: {
    upgradeCostExponent: number;
    upgradeCapacityRatio: number;
    logCostMultiplier: number;
    // V-030 (PR-BP-3 §2.11): bulk-upgrade ceiling moved off the
    // `MAX_STORAGE_UPGRADE = 100` literal in `validators/storage.ts`.
    // Server-side tunable; failure below: failed-closed validation.
    maxBulkUpgradeLevels: number;
  };
  prestige: {
    cpPerBuilding: number;
  };
  // V-011 (PR-BP-3, 2026-07-15): payout scalar rates moved out of
  // `src/lib/game/production/math/payout.ts` into the balance config.
  // Values seeded by migration 077 to match the legacy literals.
  payout: {
    extractorRate: number;
    factoryRate: number;
    powerRate: number;
  };
  // V-012 (PR-BP-3, 2026-07-15): per-type endgame income moved out of
  // the 14-case hardcoded switch in `src/lib/game/production/math/endgame.ts`.
  // Each entry's `moneyPerTick`/`researchPerTick`/`corpPerTick` is the
  // per-unit multiplier (rate = level × effectiveEfficiency × perTypeRate).
  // Adding a new tier-5 building is a row update only — no code change.
  endgame: {
    dysonCollector: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    quantumTeleporter: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    dimensionalGateway: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    timeDistorter: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    galacticForge: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    omniscienceArray: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    worldEngine: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    planetaryShield: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    starReactor: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    voidEngine: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    quantumExchange: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    megaCorpHQ: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    dimensionalNexus: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
    galacticArmada: { moneyPerTick: number; researchPerTick: number; corpPerTick: number };
  };
  offline: {
    baseRate: number;
    autoTradeThresholdRatio: number;
    autoSellRate: number;
    startingMoney: number;
    maxIncomePerTick: number;
    maxRPPerTick: number;
    maxBuildingsPerTick: number;
    generosityMultiplier: number;
    marketMargin: number;
    defaultResourceCapacity: number;
  };
  weather: {
    minIntensity: number;
    intensityRange: number;
  };
  event: {
    randomTriggerChance: number;
  };
  power: {
    fuelStarvedOutputRatio: number;
    solarAmplitudeBase: number;
    solarAmplitudeSwing: number;
    solarOscillationFreq: number;
    solarMinOutput: number;
    windAmplitudeBase: number;
    windAmplitudeSwing: number;
    windOscillationFreq: number;
    windMinOutput: number;
    minEfficiency: number;
  };
  research: {
    energyEfficiencyReduction: number;
    powerOptimizationReduction: number;
  };
  trade: {
    commissionRate: number;
    cooldownSeconds: number;
    slippageCoefficient: number;
    maxSlippage: number;
  };
  profile: {
    displayNameMaxLength: number;
  };
  compute: {
    maxTicksPerRequest: number;
  };
  marketHistory: {
    defaultHours: number;
    maxHours: number;
  };
  aggregateSupply: {
    pageSize: number;
  };
  newsLlm: {
    requestTimeoutMs: number;
  };
  blueprints: {
    maxBuildings: number;
    maxTransport: number;
    maxCountPerType: number;
  };
  cache: {
    fingerprintTtlMs: number;
    fingerprintComputeTimeoutMs: number;
    jwksTtlMs: number;
    jwksRefreshCooldownMs: number;
    adminTtlMs: number;
    initialStateTtlMs: number;
    configLoaderTtlMs: number;
  };
  limits: {
    maxMoney: number;
    maxBuildings: number;
    maxBuildingLevel: number;
    maxTickRatePerSecond: number;
    maxResourceAmount: number;
    maxResearchPoints: number;
    maxPrestigePoints: number;
    allowedGameSpeeds: readonly number[];
    maxCheatFlags: number;
  };
}

/**
 * Browser-safe power factors. These are a read-only projection of the
 * server-authoritative `power` balance row; they do not create a client
 * balance source or fallback values.
 */
export type ClientPowerBalance = Pick<
  GameBalanceConfig["power"],
  | "fuelStarvedOutputRatio"
  | "solarAmplitudeBase"
  | "solarAmplitudeSwing"
  | "solarOscillationFreq"
  | "solarMinOutput"
  | "windAmplitudeBase"
  | "windAmplitudeSwing"
  | "windOscillationFreq"
  | "windMinOutput"
>;
