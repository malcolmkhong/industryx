-- 077_balance_payout_endgame.sql
-- V-011 + V-012 (PR-BP-3, 2026-07-15): move payout + endgame per-type income
-- rates from hardcoded literals inside the math modules into the
-- server-authoritative balance config.
--
-- Background (PR-BP-3 §2.5):
--   - V-011: `payout.ts` had hardcoded `extractorRate=20, factoryRate=50,
--     powerRate=10`. Future tuning required a code edit + ship; no
--     data-driven knob.
--   - V-012: `endgame.ts` carried a 14-case hardcoded switch mapping
--     endgame building types to money/RP/CP tick rates. Adding a new
--     tier-5 building without updating the switch silently produced
--     zero income (audit §5.9 / §9.6 TIER-5 REGRESSION GUARD).
--
-- Fix:
--   Insert two new top-level keys into `game_config_balance` with values
--   matching the legacy literals exactly, so the first server boot after
--   deploy is a no-op (game keeps running identically).
--
--   - `payout`  : three scalar rates (extractor / factory / power).
--   - `endgame` : per-type income map for the 14 endgame buildings,
--                 including the 8 tier-5 buildings wired in Phase B of
--                 TIER5_WIRING_PLAN. Future rows are added by inserting
--                 a new top-level entry (no code change required).
--
-- Idempotent: ON CONFLICT (key) DO UPDATE replaces the value.
-- Backwards compatible: existing keys untouched.

BEGIN;

INSERT INTO game_config_balance (key, value, updated_at) VALUES
  -- V-011 payout rate scalars (PR-BP-3 §2.5)
  ('payout', '{
    "extractorRate": 20,
    "factoryRate": 50,
    "powerRate": 10
  }'::jsonb, now()),

  -- V-012 endgame per-type income (PR-BP-3 §2.5 / TIER-5 REGRESSION GUARD).
  -- Each entry preserves the legacy literal mapping exactly. Adding a
  -- new tier-5 building now requires ONLY a row update — no code change.
  ('endgame', '{
    "dysonCollector":      { "moneyPerTick": 8000,   "researchPerTick": 0,    "corpPerTick": 0 },
    "quantumTeleporter":   { "moneyPerTick": 0,      "researchPerTick": 10,   "corpPerTick": 0 },
    "dimensionalGateway":  { "moneyPerTick": 0,      "researchPerTick": 0,    "corpPerTick": 1 },
    "timeDistorter":       { "moneyPerTick": 5000,   "researchPerTick": 5,    "corpPerTick": 0 },
    "galacticForge":       { "moneyPerTick": 100000, "researchPerTick": 50,   "corpPerTick": 5 },
    "omniscienceArray":    { "moneyPerTick": 0,      "researchPerTick": 50,   "corpPerTick": 0 },
    "worldEngine":         { "moneyPerTick": 8000,   "researchPerTick": 5,    "corpPerTick": 0 },
    "planetaryShield":     { "moneyPerTick": 5000,   "researchPerTick": 0,    "corpPerTick": 0 },
    "starReactor":         { "moneyPerTick": 10000,  "researchPerTick": 0,    "corpPerTick": 0 },
    "voidEngine":          { "moneyPerTick": 0,      "researchPerTick": 30,   "corpPerTick": 0 },
    "quantumExchange":     { "moneyPerTick": 8000,   "researchPerTick": 0,    "corpPerTick": 1 },
    "megaCorpHQ":          { "moneyPerTick": 15000,  "researchPerTick": 0,    "corpPerTick": 2 },
    "dimensionalNexus":    { "moneyPerTick": 0,      "researchPerTick": 20,   "corpPerTick": 1 },
    "galacticArmada":      { "moneyPerTick": 5000,   "researchPerTick": 0,    "corpPerTick": 3 }
  }'::jsonb, now())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = now();

COMMIT;
