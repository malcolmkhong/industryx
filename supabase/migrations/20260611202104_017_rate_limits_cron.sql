-- 017_rate_limits_cron.sql
-- H2 FIX: schedule cleanup of old rate_limits rows (prevents table bloat)
-- Runs every hour, deletes rows older than 1 hour
--
-- Shadow-DB guard: pg_cron requires shared_preload_libraries, which the
-- shadow DB used by the migration replay cannot restart to install.
-- The pg_cron extension is only meaningful in production where it runs
-- under a fully-configured Supabase Postgres image. Skip the schedule
-- block when pg_cron is not loaded.

-- Shadow-DB guard: the binary is installed, but pg_cron only loads
-- when the `cron.database_name` GUC is set in postgresql.conf (set
-- automatically by the Supabase image). The shadow DB used for
-- migration replay does not have that GUC, so loading the extension
-- would error with "unrecognized configuration parameter". Skip
-- CREATE EXTENSION when running on a database that hasn't been
-- pre-configured for pg_cron.
DO $shadow_017$
BEGIN
  IF current_setting('cron.database_name', true) IS NULL THEN
    RAISE NOTICE '[017] pg_cron GUC not configured; skipping extension creation and schedule';
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
    SELECT 1 FROM pg_proc WHERE proname = 'schedule' AND pronamespace = 'cron'::regnamespace
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
