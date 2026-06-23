-- 016_rate_limits.sql
-- H2 FIX: Supabase-backed distributed rate limiter
-- Replaces in-memory Map in src/lib/auth/rateLimiter.ts (works across multi-instance, survives restarts)

CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('minute', NOW()),
  request_count INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT rate_limits_unique_window UNIQUE (identifier, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON rate_limits (identifier, endpoint, window_start DESC);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No RLS policies: only service role accesses via SECURITY DEFINER function

-- Atomic rate-limit check with upsert.
-- Returns: {allowed, current_count, max_requests, reset_at}
-- Allowed = (current_count <= max_requests) after increment.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER
) RETURNS TABLE (
  allowed BOOLEAN,
  current_count INTEGER,
  max_requests INTEGER,
  reset_at TIMESTAMPTZ
) AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
  v_reset_at TIMESTAMPTZ;
BEGIN
  v_window_start := DATE_TRUNC('minute', NOW());
  v_reset_at := v_window_start + (p_window_seconds * INTERVAL '1 second');

  INSERT INTO rate_limits (identifier, endpoint, window_start, request_count)
  VALUES (p_identifier, p_endpoint, v_window_start, 1)
  ON CONFLICT ON CONSTRAINT rate_limits_unique_window
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING rate_limits.request_count INTO v_count;

  RETURN QUERY
  SELECT
    (v_count <= p_max_requests) AS allowed,
    v_count AS current_count,
    p_max_requests AS max_requests,
    v_reset_at AS reset_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup helper: removes old windows. Schedule via pg_cron or external cron.
CREATE OR REPLACE FUNCTION cleanup_rate_limits(p_older_than INTERVAL DEFAULT '1 hour')
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - p_older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE rate_limits IS 'H2 FIX: per-user per-endpoint request counter, windowed by minute. See RATE_LIMITER_MIGRATION_PLAN.md';
COMMENT ON FUNCTION check_rate_limit IS 'Atomic upsert-and-increment for rate limiting. Returns allowed=(count<=max) after increment.';
COMMENT ON FUNCTION cleanup_rate_limits IS 'Cron helper: deletes rate_limits rows older than the given interval. Default 1 hour.';
