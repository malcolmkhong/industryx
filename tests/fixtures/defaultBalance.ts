// tests/fixtures/defaultBalance.ts
//
// Complete `GameBalanceConfig` for unit tests. Loaded once via
// `applyBalanceOverrides()` in `tests/setup.ts` so any test that
// calls `getBalance()` (production code paths, validators, runtime
// calculations) gets a complete, validated config without each
// test file re-inventing the wheel.
//
// The values here are intentionally mid-range so they satisfy the
// `BALANCE_VALIDATORS` ranges without skewing any individual test.
// Tests that need specific tuning still override `applyBalanceOverrides`
// inside their own `beforeEach`.

import type { GameBalanceConfig } from "@/lib/game/config/balance/balanceConfig";

const endgameLeaf = { moneyPerTick: 0, researchPerTick: 0, corpPerTick: 0 };

export const DEFAULT_TEST_BALANCE: GameBalanceConfig = {
  rp: {
    passiveBase: 1,
    aiLabBonus: 0.5,
    extractorRate: 0.1,
    powerRate: 0.05,
    factoryT1Rate: 0.1,
    factoryT2Rate: 0.2,
    factoryT3Rate: 0.3,
    factoryT4Rate: 0.4,
    factoryT5Rate: 0.5,
    completionRefundRatio: 0.1,
  },
  worker: {
    xpPerTick: 0.1,
    efficiencyGainPerTick: 0.001,
    maxPowerReductionPerBuilding: 0.1,
    levelUpXpBase: 100,
  },
  building: {
    upgradeEfficiencyGain: 0.1,
  },
  transport: {
    productionBonusCoeff: 0.1,
    upgradeCostExponent: 1.5,
  },
  contract: {
    tierRewardCoeff: 0.5,
    difficultyRewardCoeff: 0.2,
    difficultyResourceCoeff: 0.3,
  },
  autoSell: {
    thresholdRatio: 0.8,
    excessSellRatio: 0.1,
    maxSellCapacityRatio: 0.05,
    softCapRatio: 0.9,
  },
  market: {
    baseSellMultiplier: 0.5,
    buyPriceMarkup: 1.2,
    pressureFactor: 0.001,
    volatilityDecay: 0.1,
    minPrice: 1,
    maxPrice: 1_000_000,
    eventThreshold: 0.1,
    spikeCap: 0.5,
    breakerCooldown: 30,
    supplyDemandScale: 1,
    soldOutEscapeTicks: 10,
    tradeImpactNotifyCooldownMs: 60_000,
  },
  drone: {
    difficultyPerFactoryPair: 0.5,
    capacityUpgradeCoeff: 0.3,
    fuelEfficiencyUpgradeCoeff: 0.25,
    speedUpgradeCoeff: 0.2,
  },
  storage: {
    upgradeCostExponent: 1.5,
    upgradeCapacityRatio: 0.5,
    logCostMultiplier: 0.9,
    maxBulkUpgradeLevels: 100,
  },
  prestige: {
    cpPerBuilding: 10,
  },
  payout: {
    extractorRate: 1,
    factoryRate: 1,
    powerRate: 1,
  },
  endgame: {
    dysonCollector: { ...endgameLeaf },
    quantumTeleporter: { ...endgameLeaf },
    dimensionalGateway: { ...endgameLeaf },
    timeDistorter: { ...endgameLeaf },
    galacticForge: { ...endgameLeaf },
    omniscienceArray: { ...endgameLeaf },
    worldEngine: { ...endgameLeaf },
    planetaryShield: { ...endgameLeaf },
    starReactor: { ...endgameLeaf },
    voidEngine: { ...endgameLeaf },
    quantumExchange: { ...endgameLeaf },
    megaCorpHQ: { ...endgameLeaf },
    dimensionalNexus: { ...endgameLeaf },
    galacticArmada: { ...endgameLeaf },
  },
  offline: {
    baseRate: 1,
    autoTradeThresholdRatio: 0.9,
    autoSellRate: 1,
    startingMoney: 1000,
    maxIncomePerTick: 1_000_000,
    maxRPPerTick: 10_000,
    maxBuildingsPerTick: 100,
    generosityMultiplier: 1.5,
    marketMargin: 5,
    defaultResourceCapacity: 100,
  },
  weather: {
    minIntensity: 0.3,
    intensityRange: 0.7,
  },
  event: {
    randomTriggerChance: 0.01,
  },
  power: {
    fuelStarvedOutputRatio: 0.1,
    solarAmplitudeBase: 1,
    solarAmplitudeSwing: 0.5,
    solarOscillationFreq: 0.007,
    solarMinOutput: 0.2,
    windAmplitudeBase: 1,
    windAmplitudeSwing: 0.5,
    windOscillationFreq: 0.01,
    windMinOutput: 0.3,
    minEfficiency: 0.5,
  },
  research: {
    energyEfficiencyReduction: 0.05,
    powerOptimizationReduction: 0.05,
  },
  trade: {
    commissionRate: 0.05,
    cooldownSeconds: 5,
    slippageCoefficient: 0.01,
    maxSlippage: 0.1,
  },
  profile: {
    displayNameMaxLength: 32,
  },
  compute: {
    maxTicksPerRequest: 10_000,
  },
  marketHistory: {
    defaultHours: 24,
    maxHours: 168,
  },
  aggregateSupply: {
    pageSize: 100,
  },
  newsLlm: {
    requestTimeoutMs: 10_000,
  },
  blueprints: {
    maxBuildings: 1000,
    maxTransport: 1000,
    maxCountPerType: 100,
  },
  cache: {
    fingerprintTtlMs: 60_000,
    fingerprintComputeTimeoutMs: 5_000,
    jwksTtlMs: 3_600_000,
    jwksRefreshCooldownMs: 60_000,
    adminTtlMs: 3_600_000,
    initialStateTtlMs: 300_000,
    configLoaderTtlMs: 300_000,
  },
  limits: {
    maxMoney: 1e15,
    maxBuildings: 1000,
    maxBuildingLevel: 100,
    maxTickRatePerSecond: 100,
    maxResourceAmount: 1e15,
    maxResearchPoints: 1e12,
    maxPrestigePoints: 1_000_000,
    allowedGameSpeeds: [1, 2, 5, 10],
    maxCheatFlags: 5,
  },
};
