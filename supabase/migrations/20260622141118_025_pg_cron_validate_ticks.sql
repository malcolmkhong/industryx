-- 025: Schedule Phase 7 server-side tick validation cron job
--
-- Phase 7.2 created the /api/cron/validate-ticks endpoint but it needs
-- to be triggered periodically. This migration schedules a pg_cron job
-- that calls the endpoint every 5 minutes via Supabase's net extension.
--
-- The endpoint:
-- - Requires CRON_SECRET in the Authorization: Bearer <secret> header
-- - Queries all server_game_state rows where last_tick_at is within 5 min
-- - For each active player, computes the theoretical max money
-- - Flags accounts with cheat_flag_count increment if money > max * 1.1
--
-- IMPORTANT: Before applying, ensure:
-- 1. The CRON_SECRET env var is set in production
-- 2. The net extension is enabled (Supabase does this by default)
-- 3. The application is deployed and reachable at the URL below
--
-- Required env: APP_URL (the deployed application URL, e.g. https://your-app.vercel.app)
-- This migration reads the APP_URL from a Supabase Vault secret or hardcodes it.
-- For this migration, we hardcode the placeholder URL — the operator must
-- update it to the real production URL before applying.

-- Enable required extensions (Supabase has these by default, but be explicit)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any existing job with the same name (idempotent)
SELECT cron.unschedule('validate-active-players-ticks')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'validate-active-players-ticks'
);

-- Schedule the cron job: every 5 minutes
-- The job calls the validate-ticks endpoint with the CRON_SECRET in the
-- Authorization header. The endpoint URL and secret are read from Supabase
-- configuration. If your project is on Vercel, use the Vercel deployment URL.
--
-- IMPORTANT: Replace <APP_URL> with your actual production URL before running.
-- For local dev, this won't work (pg_cron runs server-side).
SELECT cron.schedule(
  'validate-active-players-ticks',
  '*/5 * * * *',  -- every 5 minutes
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

-- Optional: also add a daily cleanup job at 3am UTC to clean up old
-- player_actions rows (audit log retention) and rate_limits table
-- (table bloat prevention — already in MONITORING_PLAYBOOK)
SELECT cron.unschedule('daily-cleanup-3am')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-cleanup-3am'
);

SELECT cron.schedule(
  'daily-cleanup-3am',
  '0 3 * * *',  -- 3am UTC daily
  $$
    -- Clean up old player_actions (keep last 90 days)
    DELETE FROM player_actions
    WHERE created_at < NOW() - INTERVAL '90 days';

    -- Clean up rate_limits (cap at 100k rows)
    DELETE FROM rate_limits
    WHERE id NOT IN (
      SELECT id FROM rate_limits ORDER BY created_at DESC LIMIT 100000
    );
  $$
);

-- Verification: list all scheduled cron jobs
-- (this is a query, not a change; uncomment to verify after applying)
-- SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
