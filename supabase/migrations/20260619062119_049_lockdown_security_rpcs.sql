-- Phase 2 migration 049: Lock down 8 security-sensitive RPCs to service_role only.
-- Pre-check confirmed all 8 functions were callable by anon + authenticated
-- in the 2026-06-18 audit. No fix was made between then and now.
-- All callers in src/ use createServiceRoleClient() so the lockdown is safe.
--
-- Defensive: each REVOKE/GRANT block is wrapped in a DO guard that only
-- runs when the target function actually exists. The Supabase CLI shadow
-- DB used by `db diff --linked --use-pg-schema` replays migrations from
-- scratch in alphabetical order; some functions referenced here are
-- created by later migrations. Without the guard the shadow replay fails
-- with "function does not exist". On the linked staging/prod databases
-- the canonical functions exist and the inner block replays the original
-- REVOKE/GRANT pair verbatim.

-- 1. set_capacity
DO $lock_set_capacity$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_capacity' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.set_capacity(p_max integer) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.set_capacity(p_max integer) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.set_capacity(p_max integer) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.set_capacity(p_max integer) TO service_role;
  ELSE
    RAISE NOTICE '[049] set_capacity not yet defined; skipping revoke/grant';
  END IF;
END
$lock_set_capacity$;

-- 2. apply_market_tick (signature with real volatility; later files redefine it)
DO $lock_amt_real$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'apply_market_tick' AND n.nspname = 'public'
      AND pg_get_function_identity_arguments(p.oid) LIKE '%real%'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) TO service_role;
  ELSE
    RAISE NOTICE '[049] apply_market_tick(real) not yet defined; skipping revoke/grant';
  END IF;
END
$lock_amt_real$;

-- 3. upsert_market_pressure
DO $lock_ump$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_market_pressure' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) TO service_role;
  ELSE
    RAISE NOTICE '[049] upsert_market_pressure not yet defined; skipping';
  END IF;
END
$lock_ump$;

-- 4. upsert_supply_demand
DO $lock_usd$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_supply_demand' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) TO service_role;
  ELSE
    RAISE NOTICE '[049] upsert_supply_demand not yet defined; skipping';
  END IF;
END
$lock_usd$;

-- 5. validate_game_action
DO $lock_vga$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_game_action' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) TO service_role;
  ELSE
    RAISE NOTICE '[049] validate_game_action not yet defined; skipping';
  END IF;
END
$lock_vga$;

-- 6. compute_offline_ticks
DO $lock_cot$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'compute_offline_ticks' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) TO service_role;
  ELSE
    RAISE NOTICE '[049] compute_offline_ticks not yet defined; skipping';
  END IF;
END
$lock_cot$;

-- 7. increment_cheat_flag
DO $lock_icf$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'increment_cheat_flag' AND n.nspname = 'public'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) TO service_role;
  ELSE
    RAISE NOTICE '[049] increment_cheat_flag(uuid,text,text,text) not yet defined; skipping';
  END IF;
END
$lock_icf$;

-- 8. lock_cheater_account
DO $lock_lca$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'lock_cheater_account' AND pronamespace = 'public'::regnamespace) THEN
    REVOKE EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) TO service_role;
  ELSE
    RAISE NOTICE '[049] lock_cheater_account not yet defined; skipping';
  END IF;
END
$lock_lca$;
