-- 017_rate_limits_cron.sql
-- H2 FIX: schedule cleanup of old rate_limits rows (prevents table bloat)
-- Runs every hour, deletes rows older than 1 hour

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly cleanup. Cron syntax: '0 * * * *' = at minute 0 of every hour.
-- Use DO block so an existing schedule doesn't conflict.
DO $$
BEGIN
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
