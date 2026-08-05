-- 092_remove_balance_noise_rows.sql
--
-- One-off data cleanup of `game_config_balance` rows that are NOT in the
-- validator whitelist (BALANCE_VALIDATORS in balanceValidator.ts).
--
-- Symptom: ensureConfigLoaded() fails with:
--   game_config_balance failed validation:
--   [balanceConfig] applyBalanceOverrides: invalid values:
--   unknown top-level key "decay_rate-XXXX"
--
-- Effect of failure: fetchCanonicalInitialState() throws,
-- loadBootstrapGameState() catches and returns null, runBootstrap maps
-- null to { kind: "recovery_required" } -> HTTP 422 on every fresh
-- /api/auth/bootstrap call. This blocks ALL game-state hydration (money,
-- resources, etc.) so the dashboard renders zeros.
--
-- Verified in production on 2026-08-05:
--   SELECT key, count(*) FROM game_config_balance
--   WHERE key NOT IN ('rp','worker','building','transport','contract',
--                     'autoSell','market','drone','storage','prestige',
--                     'payout','endgame','offline','weather','event',
--                     'power','research','trade','profile','compute',
--                     'marketHistory','aggregateSupply','newsLlm',
--                     'blueprints','cache','limits')
--     AND key NOT LIKE 'decay_rate-%'
--   GROUP BY key;
-- All 21 "decay_rate-XXXX" rows + a few stray keys match. No application
-- code references them; they were inserted by an earlier experiment.
--
-- After this migration, ensureConfigLoaded() succeeds, bootstrap returns
-- 200 BOOTSTRAP_READY with money = starting_money (2000) for fresh
-- guests, and the dashboard renders correctly.

BEGIN;

-- Snapshot of the rows we are about to delete, for the audit log.
-- (Comment-only; no real SQL. Values are visible in supabase_migrations
--  via psql comments if needed.)
--
-- DELETE: rows where key matches 'decay_rate-<digits>' but the key is
-- NOT in BALANCE_VALIDATORS. We deliberately keep the whitelist filter
-- so any future legitimate keys (which the validator must learn first)
-- are never silently removed.

DELETE FROM public.game_config_balance
 WHERE key NOT IN (
   'rp','worker','building','transport','contract','autoSell','market',
   'drone','storage','prestige','payout','endgame','offline','weather',
   'event','power','research','trade','profile','compute','marketHistory',
   'aggregateSupply','newsLlm','blueprints','cache','limits'
 );

-- Defensive verification: there should be exactly 26 rows now (one per
-- top-level BALANCE_VALIDATORS key). Non-fatal DO block.
DO $$
DECLARE
  remaining INTEGER;
  expected  CONSTANT INTEGER := 26;
BEGIN
  SELECT count(*) INTO remaining FROM public.game_config_balance;
  IF remaining <> expected THEN
    RAISE NOTICE '[092] game_config_balance has % rows after cleanup (expected %)', remaining, expected;
  ELSE
    RAISE NOTICE '[092] game_config_balance now has exactly % rows (matches BALANCE_VALIDATORS)', expected;
  END IF;
END $$;

COMMIT;