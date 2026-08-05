-- 063_schedule_cleanup_orphan_pg_cron.sql
-- Tier 1 fix 3: schedule cleanup_orphan_anon_users() daily via pg_cron.
--
-- The function exists (051/052/061/062) but is never invoked. Without a
-- schedule, junk accounts accumulate indefinitely.
--
-- pg_cron is enabled (017 established the pattern). Schedule at 03:15 UTC
-- (off-peak) to avoid contention with the 03:00 daily-rewards cron.
--
-- Idempotent: skips schedule insertion if jobname already exists.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $cron$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'schedule' AND pronamespace = 'cron'::regnamespace) THEN RAISE NOTICE '[063] pg_cron not loaded; skipping schedule block'; RETURN; END IF; END $cron$;
DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-orphan-accounts'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-orphan-accounts',
      '15 3 * * *',
      $cron$SELECT public.cleanup_orphan_anon_users()$cron$
    );
  END IF;
END
$$;
