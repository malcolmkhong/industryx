-- 067: game_config_balance — DB-backed tunables for live balance adjustment
--
-- Phase 2 foundation. Stores the tunable numeric values currently hardcoded
-- in src/lib/game/balanceConfig.ts (DEFAULT_BALANCE). The server-side
-- configLoader fetches these on boot (instrumentation.ts pre-warm) and
-- polls every 60s for changes.
--
-- Scope (per Phase 2 plan in docs/ECONOMY_AUDIT.md):
-- - Server-side only. Client continues to use in-process DEFAULT_BALANCE.
-- - One row per top-level key in GameBalanceConfig. value is the JSON
--   subtree for that key (e.g., { "passiveBase": 0.5, "aiLabBonus": 0.5 }).
-- - updated_at tracks last write; the server poller uses it to fetch
--   only changed rows.
--
-- NOT in Phase 2 (deferred to Phase 5):
-- - Admin UI for editing values
-- - Audit trail of who changed what (updated_by column reserved but unused)
-- - Per-player cohort overrides
--
-- Idempotent: safe to apply multiple times.

CREATE TABLE IF NOT EXISTS game_config_balance (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID  -- reserved for Phase 5 admin UI; no FK to avoid blocking auth changes
);

CREATE INDEX IF NOT EXISTS game_config_balance_updated_at_idx
  ON game_config_balance (updated_at DESC);

-- RLS: service-role only. No anon/authenticated access.
ALTER TABLE game_config_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_can_read_game_config_balance" ON game_config_balance;
CREATE POLICY "service_role_can_read_game_config_balance"
  ON game_config_balance FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_can_write_game_config_balance" ON game_config_balance;
CREATE POLICY "service_role_can_write_game_config_balance"
  ON game_config_balance FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed with current DEFAULT_BALANCE values. Mirrors
-- src/lib/game/balanceConfig.ts DEFAULT_BALANCE exactly so that the first
-- server boot is a no-op (DB matches defaults).
INSERT INTO game_config_balance (key, value) VALUES
  ('rp', '{
    "passiveBase": 0.5,
    "aiLabBonus": 0.5,
    "extractorRate": 0.01,
    "powerRate": 0.01,
    "factoryT1Rate": 0.02,
    "factoryT2Rate": 0.05,
    "factoryT3Rate": 0.10,
    "factoryT4Rate": 0.20,
    "completionRefundRatio": 0.1
  }'::jsonb),
  ('worker', '{
    "xpPerTick": 0.01,
    "efficiencyGainPerTick": 0.001,
    "maxPowerReductionPerBuilding": 0.5
  }'::jsonb),
  ('building', '{
    "upgradeEfficiencyGain": 0.05
  }'::jsonb),
  ('transport', '{
    "productionBonusCoeff": 0.25,
    "upgradeCostExponent": 1.3
  }'::jsonb),
  ('contract', '{
    "tierRewardCoeff": 0.5,
    "difficultyRewardCoeff": 0.15,
    "difficultyResourceCoeff": 0.15
  }'::jsonb),
  ('autoSell', '{
    "thresholdRatio": 0.8,
    "excessSellRatio": 0.5,
    "maxSellCapacityRatio": 0.1
  }'::jsonb),
  ('market', '{
    "baseSellMultiplier": 0.9,
    "buyPriceMarkup": 1.1
  }'::jsonb),
  ('drone', '{
    "difficultyPerFactoryPair": 0.5,
    "capacityUpgradeCoeff": 0.25,
    "fuelEfficiencyUpgradeCoeff": 0.15,
    "speedUpgradeCoeff": 0.2
  }'::jsonb),
  ('storage', '{
    "upgradeCostExponent": 1.5,
    "upgradeCapacityRatio": 0.5
  }'::jsonb),
  ('prestige', '{
    "cpPerBuilding": 0.5
  }'::jsonb),
  ('offline', '{
    "baseRate": 0.5,
    "autoTradeThresholdRatio": 0.5,
    "autoSellRate": 0.1
  }'::jsonb),
  ('weather', '{
    "minIntensity": 0.3,
    "intensityRange": 0.7
  }'::jsonb),
  ('event', '{
    "randomTriggerChance": 0.6
  }'::jsonb),
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
  }'::jsonb),
  ('research', '{
    "energyEfficiencyReduction": 0.15,
    "powerOptimizationReduction": 0.10
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;
