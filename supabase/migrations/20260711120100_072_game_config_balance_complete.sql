-- 068: game_config_balance — complete seed
--
-- The original migration 067 created the table and seeded 16 top-level keys,
-- but was missing many fields within those keys AND 8 entire top-level keys
-- (trade, profile, compute, marketHistory, aggregateSupply, newsLlm,
-- blueprints, cache). This left game_config_balance incomplete, which
-- would cause the new strict loadCompleteBalanceFromSupabase() to fail
-- (fail-closed per RULES.md [SEC-002] / [ARC-009]).
--
-- This migration replaces each existing key's JSONB with the FULL canonical
-- set of fields, and inserts any missing top-level keys. The values match
-- the previous in-process DEFAULT_BALANCE exactly so the first server boot
-- after deploy is a no-op (game keeps running identically).
--
-- Idempotent: ON CONFLICT (key) DO UPDATE replaces the value.
-- Safe to apply multiple times.

BEGIN;

-- Replace existing keys with the COMPLETE canonical JSONB
INSERT INTO game_config_balance (key, value, updated_at) VALUES
  ('rp', '{
    "passiveBase": 0.5,
    "aiLabBonus": 0.5,
    "extractorRate": 0.01,
    "powerRate": 0.01,
    "factoryT1Rate": 0.02,
    "factoryT2Rate": 0.05,
    "factoryT3Rate": 0.1,
    "factoryT4Rate": 0.2,
    "factoryT5Rate": 0.4,
    "completionRefundRatio": 0.1
  }'::jsonb, now()),
  ('worker', '{
    "xpPerTick": 0.01,
    "efficiencyGainPerTick": 0.001,
    "maxPowerReductionPerBuilding": 0.5,
    "levelUpXpBase": 100
  }'::jsonb, now()),
  ('building', '{
    "upgradeEfficiencyGain": 0.05
  }'::jsonb, now()),
  ('transport', '{
    "productionBonusCoeff": 0.25,
    "upgradeCostExponent": 1.3
  }'::jsonb, now()),
  ('contract', '{
    "tierRewardCoeff": 0.5,
    "difficultyRewardCoeff": 0.15,
    "difficultyResourceCoeff": 0.15
  }'::jsonb, now()),
  ('autoSell', '{
    "thresholdRatio": 0.8,
    "excessSellRatio": 0.5,
    "maxSellCapacityRatio": 0.1,
    "softCapRatio": 0.8
  }'::jsonb, now()),
  ('market', '{
    "baseSellMultiplier": 0.9,
    "buyPriceMarkup": 1.1,
    "pressureFactor": 0.0005,
    "volatilityDecay": 0.95,
    "minPrice": 1,
    "maxPrice": 1000000,
    "eventThreshold": 0.04,
    "spikeCap": 0.4,
    "breakerCooldown": 5,
    "supplyDemandScale": 0.1,
    "soldOutEscapeTicks": 6,
    "tradeImpactNotifyCooldownMs": 10000
  }'::jsonb, now()),
  ('drone', '{
    "difficultyPerFactoryPair": 0.5,
    "capacityUpgradeCoeff": 0.25,
    "fuelEfficiencyUpgradeCoeff": 0.15,
    "speedUpgradeCoeff": 0.2
  }'::jsonb, now()),
  ('storage', '{
    "upgradeCostExponent": 1.5,
    "upgradeCapacityRatio": 0.5,
    "logCostMultiplier": 0.9
  }'::jsonb, now()),
  ('prestige', '{
    "cpPerBuilding": 0.5
  }'::jsonb, now()),
  ('offline', '{
    "baseRate": 0.5,
    "autoTradeThresholdRatio": 0.5,
    "autoSellRate": 0.1,
    "startingMoney": 1000,
    "maxIncomePerTick": 15000000,
    "maxRPPerTick": 20000,
    "maxBuildingsPerTick": 5,
    "generosityMultiplier": 1.5,
    "marketMargin": 5,
    "defaultResourceCapacity": 1000000000000
  }'::jsonb, now()),
  ('weather', '{
    "minIntensity": 0.3,
    "intensityRange": 0.7
  }'::jsonb, now()),
  ('event', '{
    "randomTriggerChance": 0.6
  }'::jsonb, now()),
  ('power', '{
    "fuelStarvedOutputRatio": 0.1,
    "solarAmplitudeBase": 0.5,
    "solarAmplitudeSwing": 0.5,
    "solarOscillationFreq": 0.01,
    "solarMinOutput": 0.2,
    "windAmplitudeBase": 0.5,
    "windAmplitudeSwing": 0.5,
    "windOscillationFreq": 0.007,
    "windMinOutput": 0.3,
    "minEfficiency": 0.1
  }'::jsonb, now()),
  ('research', '{
    "energyEfficiencyReduction": 0.15,
    "powerOptimizationReduction": 0.1
  }'::jsonb, now()),
  -- New top-level keys (were not in migration 067)
  ('trade', '{
    "commissionRate": 0.15,
    "cooldownSeconds": 300,
    "slippageCoefficient": 0.001,
    "maxSlippage": 0.25
  }'::jsonb, now()),
  ('profile', '{
    "displayNameMaxLength": 32
  }'::jsonb, now()),
  ('compute', '{
    "maxTicksPerRequest": 60000
  }'::jsonb, now()),
  ('marketHistory', '{
    "defaultHours": 24,
    "maxHours": 168
  }'::jsonb, now()),
  ('aggregateSupply', '{
    "pageSize": 1000
  }'::jsonb, now()),
  ('newsLlm', '{
    "requestTimeoutMs": 15000
  }'::jsonb, now()),
  ('blueprints', '{
    "maxBuildings": 500,
    "maxTransport": 200,
    "maxCountPerType": 1000
  }'::jsonb, now()),
  ('cache', '{
    "fingerprintTtlMs": 86400000,
    "fingerprintComputeTimeoutMs": 2000,
    "jwksTtlMs": 3600000,
    "jwksRefreshCooldownMs": 30000,
    "adminTtlMs": 60000,
    "initialStateTtlMs": 300000,
    "configLoaderTtlMs": 300000
  }'::jsonb, now()),
  -- Game limits (anti-cheat ceilings). Replaces the previous in-process
  -- GAME_LIMITS const per RULES.md [ARC-002].
  ('limits', '{
    "maxMoney": 1000000000000,
    "maxBuildings": 500,
    "maxBuildingLevel": 100,
    "maxTickRatePerSecond": 50,
    "maxResourceAmount": 1000000000,
    "maxResearchPoints": 1000000000,
    "maxPrestigePoints": 1000,
    "allowedGameSpeeds": [1, 2, 5, 10],
    "maxCheatFlags": 3
  }'::jsonb, now())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

COMMIT;
