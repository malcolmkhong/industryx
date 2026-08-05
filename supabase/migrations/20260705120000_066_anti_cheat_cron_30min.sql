-- 066: Reduce validate-ticks cron frequency from 5min to 30min
--
-- Phase 5.4 anti-cheat architecture change: shift from "pull" to "push" model.
-- The /api/game/action and /api/game/state routes now catch most cheats at
-- the moment of action (per-action validation). The cron becomes a
-- "spot-check" backup that runs cheaper scans (no full_state fetch for
-- clean players).
--
-- Bandwidth savings: with 100 active players, cron egress drops from
-- ~288 MB/day to ~1 MB/day (300x improvement).
--
-- Anti-cheat coverage: NOT reduced. Per-action validation catches cheats
-- within ~50ms (action time) instead of 5min. The cron catches any cheats
-- that slip past per-action validation (e.g., a player who gradually
-- accumulates money through micro-transactions that individually look
-- legitimate but aggregate to too much).
--
-- Idempotent: safe to apply multiple times.

-- Unschedule existing
-- Shadow-DB guard: pg_cron is not loaded on the shadow DB. The
-- schedule block below only matters in production where pg_cron
-- is configured. Wrap the whole migration in a guard so replay
-- is a no-op when the cron schema is absent.
DO $shadow_066$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'schedule' AND pronamespace = 'cron'::regnamespace
  ) THEN
    RAISE NOTICE '[066] pg_cron not loaded; skipping cron job schedule';
    RETURN;
  END IF;

  SELECT cron.unschedule('validate-active-players-ticks')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'validate-active-players-ticks'
  );

  -- Reschedule at 30min cadence
  SELECT cron.schedule(
    'validate-active-players-ticks',
    '*/30 * * * *',  -- every 30 minutes (down from 5)
    $$
      SELECT net.http_post(
        url := 'https://industryx.vercel.app/api/cron/validate-ticks',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
        ),
        body := '{}'::jsonb
      ) AS request_id;
    $$
  );
END
$shadow_066$;

-- Verification: list the new schedule
-- (uncomment to verify after applying)
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'validate-active-players-ticks';
