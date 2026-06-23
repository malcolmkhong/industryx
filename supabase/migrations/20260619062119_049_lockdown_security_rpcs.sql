-- Phase 2 migration 049: Lock down 8 security-sensitive RPCs to service_role only.
-- Pre-check confirmed all 8 functions were callable by anon + authenticated
-- in the 2026-06-18 audit. No fix was made between then and now.
-- All callers in src/ use createServiceRoleClient() so the lockdown is safe.

-- 1. set_capacity
REVOKE EXECUTE ON FUNCTION public.set_capacity(p_max integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_capacity(p_max integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_capacity(p_max integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_capacity(p_max integer) TO service_role;

-- 2. apply_market_tick
REVOKE EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_market_tick(p_tick bigint, p_prices jsonb, p_volatility real, p_events jsonb, p_breakers jsonb) TO service_role;

-- 3. upsert_market_pressure
REVOKE EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_market_pressure(p_user_id uuid, p_resource text, p_buy_volume double precision, p_sell_volume double precision) TO service_role;

-- 4. upsert_supply_demand
REVOKE EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_supply_demand(p_resource text, p_production double precision, p_consumption double precision, p_player_count integer) TO service_role;

-- 5. validate_game_action
REVOKE EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_game_action(p_user_id uuid, p_action_type text, p_payload jsonb, p_current_money numeric, p_current_game_tick bigint) TO service_role;

-- 6. compute_offline_ticks
REVOKE EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compute_offline_ticks(p_user_id uuid, p_max_ticks bigint) TO service_role;

-- 7. increment_cheat_flag
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text) TO service_role;

-- 8. lock_cheater_account
REVOKE EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lock_cheater_account(p_user_id uuid, p_reason text) TO service_role;
