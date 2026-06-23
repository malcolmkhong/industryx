-- Phase 2 migration 048: Lock down market_player_pressure to per-user writes
-- RLS is already enabled on the table. Add a single policy that restricts
-- authenticated users to their own rows. service_role bypasses RLS, so the
-- market tick worker (/api/market/tick) and trade route (which use service
-- role) are unaffected.
DROP POLICY IF EXISTS "Players can upsert own pressure" ON public.market_player_pressure;
CREATE POLICY "Players can upsert own pressure"
  ON public.market_player_pressure
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
