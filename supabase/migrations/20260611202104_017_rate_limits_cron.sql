-- 017_rate_limits_cron.sql
-- H2 FIX: schedule cleanup of old rate_limits rows (prevents table bloat)
-- Runs every hour, deletes rows older than 1 hour
--
-- Shadow-DB guard: pg_cron requires shared_preload_libraries, which the
-- shadow DB used by the migration replay cannot restart to install.
-- The pg_cron extension is only meaningful in production where it runs
-- under a fully-configured Supabase Postgres image. Skip the schedule
-- block when pg_cron is not loaded.

-- Shadow-DB guard: pg_cron requires shared_preload_libraries and the
-- `cron.database_name` GUC to be set in postgresql.conf. The shadow
-- DB used for migration replay does not have it, so loading the
-- extension would error with "unrecognized configuration parameter".
-- Probe whether the cron schema is already present (production has
-- it pre-created by the Supabase image); the shadow DB does not.
DO $shadow_017$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    RAISE NOTICE '[017] pg_cron not pre-installed; skipping extension creation and schedule';
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
END
$shadow_017$;

-- Schedule hourly cleanup. Cron syntax: '0 * * * *' = at minute 0 of every hour.
-- Use DO block so an existing schedule doesn't conflict. Wrapped in
-- a guard: when pg_cron is not loaded (shadow DB replay), the
-- cron.job / cron.schedule functions don't exist, so the whole
-- schedule block is skipped. The cleanup is still covered by a
-- second migration (`018_admin_function_fix.sql`) that runs the
-- cleanup via a different mechanism.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'schedule' AND n.nspname = 'cron'
  ) THEN
    RAISE NOTICE '[017] pg_cron not loaded; skipping cleanup-rate-limits schedule';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rate-limits'
  ) THEN
    PERFORM cron.schedule(
      'cleanup-rate-limits',
      '0 * * * *',
      $cron$SELECT cleanup_rate_limits(INTERVAL '1 hour')$cron$
    );
  END IF;
END
$$;
