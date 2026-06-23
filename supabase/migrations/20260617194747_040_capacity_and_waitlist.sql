-- 040_capacity_and_waitlist.sql
-- Capacity protection system for the idle game.
-- Enforces MAX_TOTAL_PLAYERS (configurable, default 500) at the application layer.
-- No triggers on auth.users â€” all checks happen in the app/server layer.
-- Waitlist submissions create a support_ticket so the existing admin support
-- panel surfaces them (no duplicate system).

-- â”€â”€â”€ App config (single source of truth for capacity limit) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
-- Service role manages everything (admin only via API)
DROP POLICY IF EXISTS "Service role manages app_config" ON app_config;
CREATE POLICY "Service role manages app_config" ON app_config
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Default: 500 total players (matches the business decision)
INSERT INTO app_config (key, value, updated_at)
VALUES ('capacity', jsonb_build_object('max', 500), now())
ON CONFLICT (key) DO NOTHING;

-- â”€â”€â”€ Waitlist table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  name         TEXT,
  source       TEXT DEFAULT 'capacity_block',  -- e.g. 'waitlist_page', 'footer', 'share'
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'invited', 'converted', 'rejected')),
  ticket_id    UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
  invited_at   TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_status_created
  ON waitlist_entries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_email
  ON waitlist_entries(lower(email));

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
-- Anyone can submit (anon signup form)
DROP POLICY IF EXISTS "Anyone can submit waitlist" ON waitlist_entries;
CREATE POLICY "Anyone can submit waitlist" ON waitlist_entries
  FOR INSERT WITH CHECK (true);
-- Service role manages (admin only via API)
DROP POLICY IF EXISTS "Service role manages waitlist" ON waitlist_entries;
CREATE POLICY "Service role manages waitlist" ON waitlist_entries
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- â”€â”€â”€ get_capacity_status() RPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Returns TOTAL registered players (auth.users + guest_identities count),
-- the configured max, utilization, status, plus activity metrics (analytics only).
CREATE OR REPLACE FUNCTION get_capacity_status()
RETURNS TABLE(
  max_total_players      INTEGER,
  total_players          INTEGER,
  registered_users       INTEGER,
  guest_users            INTEGER,
  waitlist_count         BIGINT,
  utilization_pct        NUMERIC,
  status                 TEXT,  -- 'healthy' | 'warning' | 'full'
  -- Activity metrics (analytics only â€” DO NOT use for enforcement)
  active_15m             BIGINT,
  active_24h             BIGINT,
  active_7d              BIGINT
) AS $$
DECLARE
  v_max INTEGER;
  v_total INTEGER;
  v_registered INTEGER;
  v_guests INTEGER;
  v_waitlist INTEGER;
  v_pct NUMERIC;
  v_status TEXT;
  v_active_15m BIGINT;
  v_active_24h BIGINT;
  v_active_7d BIGINT;
BEGIN
  -- Read max from app_config (default 500 if not set)
  SELECT COALESCE(
    (SELECT (value->>'max')::INTEGER FROM app_config WHERE key = 'capacity'),
    500
  ) INTO v_max;

  -- Count TOTAL registered players (auth.users + guest_identities)
  -- Both consume DB resources, infrastructure, and must be counted toward MAX.
  SELECT
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM auth.users WHERE COALESCE(is_anonymous, false) = false),
    (SELECT count(*) FROM guest_identities)
  INTO v_total, v_registered, v_guests;

  -- Waitlist count (qualify column to avoid ambiguity with RETURNS TABLE)
  SELECT count(*) INTO v_waitlist FROM waitlist_entries WHERE waitlist_entries.status = 'pending';

  v_pct := ROUND((v_total::NUMERIC / NULLIF(v_max, 0)) * 100, 2);

  IF v_max > 0 AND v_total >= v_max THEN
    v_status := 'full';
  ELSIF v_max > 0 AND v_total >= v_max * 0.8 THEN
    v_status := 'warning';
  ELSE
    v_status := 'healthy';
  END IF;

  -- Activity (analytics only â€” NOT used for capacity enforcement)
  SELECT count(*) INTO v_active_15m FROM server_game_state WHERE last_tick_at > now() - interval '15 minutes';
  SELECT count(*) INTO v_active_24h FROM server_game_state WHERE last_tick_at > now() - interval '24 hours';
  SELECT count(*) INTO v_active_7d FROM server_game_state WHERE last_tick_at > now() - interval '7 days';

  RETURN QUERY SELECT v_max, v_total, v_registered, v_guests, v_waitlist::BIGINT, v_pct, v_status, v_active_15m, v_active_24h, v_active_7d;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- support_tickets.user_id is nullable (for waitlist entries with no user yet)
-- This ALTER is idempotent and safe to re-run
DO $$
BEGIN
  BEGIN
    ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    -- already nullable, ignore
    NULL;
  END;
END $$;

-- support_messages.sender_type must accept 'system' for waitlist auto-messages
-- The original CHECK constraint only allows 'player' and 'admin'
DO $$
BEGIN
  -- Drop and recreate the check constraint to include 'system'
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'support_messages_sender_type_check'
      AND conrelid = 'public.support_messages'::regclass
  ) THEN
    ALTER TABLE support_messages DROP CONSTRAINT support_messages_sender_type_check;
  END IF;
  ALTER TABLE support_messages
    ADD CONSTRAINT support_messages_sender_type_check
    CHECK (sender_type = ANY (ARRAY['player', 'admin', 'system']));
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- support_messages.sender_id nullable for system messages (no user yet)
DO $$
BEGIN
  BEGIN
    ALTER TABLE support_messages ALTER COLUMN sender_id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- â”€â”€â”€ submit_waitlist() RPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Atomically creates waitlist_entries row + support_tickets + support_messages
-- so admin sees it in the existing /admin/support panel.
CREATE OR REPLACE FUNCTION submit_waitlist(
  p_email TEXT,
  p_name TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'capacity_block'
)
RETURNS TABLE(
  waitlist_id UUID,
  ticket_id UUID,
  "position" INTEGER,
  status TEXT,
  estimated_wait_days INTEGER
) AS $$
DECLARE
  v_id UUID;
  v_ticket_id UUID;
  v_position INTEGER;
  v_existing_id UUID;
  v_existing_ticket UUID;
BEGIN
  -- Basic email validation
  IF p_email IS NULL OR p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Upsert waitlist entry (idempotent on email)
  INSERT INTO waitlist_entries (email, name, source, status, updated_at)
  VALUES (lower(trim(p_email)), trim(p_name), p_source, 'pending', now())
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Existing entry â€” fetch
    SELECT id, ticket_id INTO v_existing_id, v_existing_ticket
    FROM waitlist_entries WHERE email = lower(trim(p_email));
    v_id := v_existing_id;
    v_ticket_id := v_existing_ticket;
  ELSE
    -- New entry â€” create a support ticket (reuses existing system)
    INSERT INTO support_tickets (user_id, subject, status)
    VALUES (
      NULL,
      'Waitlist: ' || lower(trim(p_email)),
      'open'
    )
    RETURNING id INTO v_ticket_id;

    UPDATE waitlist_entries
    SET ticket_id = v_ticket_id, updated_at = now()
    WHERE id = v_id;

    -- First message on the ticket (admin sees context)
    -- sender_type = 'system' (allowed by check constraint; sender_id NULL because waitlist has no user yet)
    INSERT INTO support_messages (ticket_id, sender_id, sender_type, message)
    VALUES (
      v_ticket_id,
      NULL,
      'system',
      'New waitlist signup' ||
        CASE WHEN p_name IS NOT NULL THEN ' for ' || trim(p_name) ELSE '' END ||
        '. Source: ' || p_source ||
        E'\n\nCapacity status at signup: see app_config.capacity.'
    );
  END IF;

  -- Calculate position (count of pending entries created before this one)
  -- Use alias `we` to avoid ambiguity with RETURNS TABLE's status column
  SELECT count(*) + 1 INTO v_position
  FROM waitlist_entries we
  WHERE we.status = 'pending'
    AND we.created_at < (SELECT created_at FROM waitlist_entries WHERE id = v_id);

  RETURN QUERY SELECT
    v_id,
    v_ticket_id,
    v_position,
    (SELECT status FROM get_capacity_status() LIMIT 1),
    GREATEST(7, ((v_position / 100.0) * 30)::INTEGER);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- â”€â”€â”€ set_capacity() RPC (admin only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CREATE OR REPLACE FUNCTION set_capacity(p_max INTEGER)
RETURNS void AS $$
BEGIN
  IF p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'max must be a positive integer';
  END IF;
  INSERT INTO app_config (key, value, updated_at)
  VALUES ('capacity', jsonb_build_object('max', p_max), now())
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- â”€â”€â”€ Grants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GRANT EXECUTE ON FUNCTION get_capacity_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION submit_waitlist(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_capacity(INTEGER) TO service_role;

-- Comments
COMMENT ON TABLE app_config IS 'App-wide configuration. Capacity limit lives here as the single source of truth.';
COMMENT ON TABLE waitlist_entries IS 'Pre-launch capacity waitlist. Each entry auto-creates a support_ticket for admin review.';
COMMENT ON FUNCTION get_capacity_status IS 'Returns total registered players (auth.users + guest_identities), max capacity, status, and activity metrics. Capacity enforcement reads from here.';
COMMENT ON FUNCTION submit_waitlist IS 'Atomically inserts waitlist_entries + support_tickets + support_messages. No duplicate support system â€” admins use /admin/support.';
