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
  };
  prestige: {
    cpPerBuilding: number;
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
