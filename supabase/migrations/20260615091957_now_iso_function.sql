-- 024: Create RPC function to return current server timestamp (UTC)
-- Used by game state save to timestamp events with true DB server time,
-- immune to client clock manipulation or server-local clock drift.
-- Called from /api/game/state via supabase.rpc('now_iso').

CREATE OR REPLACE FUNCTION now_iso()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;
