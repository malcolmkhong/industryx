-- ============================================================================
-- Migration: 004_server_authoritative_upgrade
-- Description: Upgrade database for server-authoritative game model
-- Purpose: Prevent cheating by making the server the source of truth
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================

-- ============================================================================
-- PART 1: Fix existing tables — add missing columns and tighten validation
-- ============================================================================

-- Ensure player_sessions table exists (was created via API but never formalized)
CREATE TABLE IF NOT EXISTS player_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT,
  is_online BOOLEAN NOT NULL DEFAULT true,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on player_sessions
ALTER TABLE player_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for player_sessions
DO $$ BEGIN
  -- Service role full access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_sessions' AND policyname = 'Service role can do everything on sessions'
  ) THEN
    CREATE POLICY "Service role can do everything on sessions" ON player_sessions
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Users can read their own sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'player_sessions' AND policyname = 'Users can read own sessions'
  ) THEN
    CREATE POLICY "Users can read own sessions" ON player_sessions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_player_sessions_user_id ON player_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_is_online ON player_sessions(is_online) WHERE is_online = true;

-- Ensure player_progress has server-authoritative columns
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS last_server_tick_at TIMESTAMPTZ;
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS server_game_tick BIGINT DEFAULT 0;
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS save_checksum TEXT;

-- NEW: Track validated state hash for tamper detection
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS validated_state_hash TEXT;
-- NEW: Track the last validated game tick from the server
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS last_validated_tick BIGINT DEFAULT 0;
-- NEW: Flag accounts under investigation
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS cheat_flag_count INT DEFAULT 0;
-- NEW: Lock accounts that exceed cheat threshold
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
-- NEW: Reason for lock
ALTER TABLE player_progress ADD COLUMN IF NOT EXISTS lock_reason TEXT;

-- Extend player_actions action_type to include new types
ALTER TABLE player_actions DROP CONSTRAINT IF EXISTS player_actions_action_type_check;
ALTER TABLE player_actions ADD CONSTRAINT player_actions_action_type_check
  CHECK (action_type IN (
    'build', 'sell', 'buy', 'research', 'upgrade', 'transport',
    'save', 'load', 'tick', 'prestige', 'import', 'claim_quest',
    'hire_worker', 'assign_worker', 'upgrade_worker',
    'start_drone_mission', 'collect_drone',
    'buy_market', 'sell_market', 'toggle_building',
    'set_game_speed', 'bulk_build', 'bulk_sell'
  ));


-- ============================================================================
-- PART 2: New table — validated_actions queue
-- Purpose: Client must submit actions here FIRST, server validates,
--          client only applies result after server approval
-- ============================================================================

CREATE TABLE IF NOT EXISTS validated_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',

  -- State snapshot BEFORE action (for delta validation)
  state_before JSONB,
  -- State snapshot AFTER action (computed by server)
  state_after JSONB,

  -- Server validation result
  is_valid BOOLEAN,
  rejection_reason TEXT,
  validation_risk TEXT DEFAULT 'none' CHECK (validation_risk IN ('none', 'low', 'medium', 'high', 'critical')),

  -- Delta tracking
  money_before NUMERIC DEFAULT 0,
  money_after NUMERIC DEFAULT 0,
  game_tick BIGINT NOT NULL DEFAULT 0,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected', 'applied', 'failed')),
  processed_at TIMESTAMPTZ,

  -- Audit
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for validated_actions
CREATE INDEX IF NOT EXISTS idx_validated_actions_user_id ON validated_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_validated_actions_status ON validated_actions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_validated_actions_created_at ON validated_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_validated_actions_is_valid ON validated_actions(is_valid) WHERE is_valid = false;

-- Enable RLS on validated_actions
ALTER TABLE validated_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything on validated_actions" ON validated_actions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own validated actions" ON validated_actions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own validated actions" ON validated_actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================================
-- PART 3: New table — server_game_state
-- Purpose: The AUTHORITATIVE game state computed by the server.
--          This is the source of truth, NOT the client's localStorage.
-- ============================================================================

CREATE TABLE IF NOT EXISTS server_game_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Core game state (server-authoritative)
  money NUMERIC NOT NULL DEFAULT 1000 CHECK (money >= 0),
  total_money_earned NUMERIC NOT NULL DEFAULT 0 CHECK (total_money_earned >= 0),
  research_points NUMERIC NOT NULL DEFAULT 0 CHECK (research_points >= 0),

  -- Buildings as validated JSON (server ensures types exist, levels are valid)
  buildings JSONB NOT NULL DEFAULT '[]',
  buildings_count INT NOT NULL DEFAULT 0 CHECK (buildings_count >= 0 AND buildings_count <= 500),

  -- Research as validated array (server ensures prerequisite topology)
  completed_research JSONB NOT NULL DEFAULT '[]',

  -- Resources as validated JSON (server ensures no negatives)
  resources JSONB NOT NULL DEFAULT '{}',

  -- Workers
  workers JSONB NOT NULL DEFAULT '[]',

  -- Game tick tracking (server-authoritative)
  game_tick BIGINT NOT NULL DEFAULT 0 CHECK (game_tick >= 0),
  game_speed INT NOT NULL DEFAULT 1 CHECK (game_speed IN (1, 2, 5, 10)),

  -- Full game state JSONB (for complex nested data like market, drones, quests)
  full_state JSONB NOT NULL DEFAULT '{}',

  -- Integrity
  state_hash TEXT NOT NULL,
  state_version INT NOT NULL DEFAULT 1,

  -- Timestamps
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Validation flags
  cheat_flag_count INT NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  lock_reason TEXT
);

-- Indexes for server_game_state
CREATE INDEX IF NOT EXISTS idx_server_game_state_user_id ON server_game_state(user_id);
CREATE INDEX IF NOT EXISTS idx_server_game_state_last_tick ON server_game_state(last_tick_at);

-- Enable RLS on server_game_state
ALTER TABLE server_game_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything on server_game_state" ON server_game_state
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Users can read own server game state" ON server_game_state
  FOR SELECT USING (auth.uid() = user_id);

-- NOTE: Users CANNOT insert/update/delete server_game_state directly.
-- All mutations must go through validated_actions or API routes with service role.


-- ============================================================================
-- PART 4: New table — research_prerequisites
-- Purpose: Store research dependency tree server-side for validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_prerequisites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  research_id TEXT NOT NULL,
  prerequisite_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(research_id, prerequisite_id)
);

CREATE INDEX IF NOT EXISTS idx_research_prereq_research ON research_prerequisites(research_id);
CREATE INDEX IF NOT EXISTS idx_research_prereq_prereq ON research_prerequisites(prerequisite_id);

-- Enable RLS on research_prerequisites
ALTER TABLE research_prerequisites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything on research_prerequisites" ON research_prerequisites
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can read research prerequisites" ON research_prerequisites
  FOR SELECT USING (true);


-- ============================================================================
-- PART 5: New table — cheat_investigations
-- Purpose: Track detailed cheat incidents for admin review
-- ============================================================================

CREATE TABLE IF NOT EXISTS cheat_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What was detected
  detection_type TEXT NOT NULL CHECK (detection_type IN (
    'money_manipulation', 'tick_manipulation', 'invalid_building',
    'invalid_research', 'speed_hack', 'import_hack', 'state_tampering',
    'negative_resources', 'impossible_progression', 'other'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description TEXT NOT NULL,

  -- Evidence
  evidence JSONB NOT NULL DEFAULT '{}',
  expected_value TEXT,
  actual_value TEXT,

  -- Resolution
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES auth.users(id),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cheat_investigations_user_id ON cheat_investigations(user_id);
CREATE INDEX IF NOT EXISTS idx_cheat_investigations_status ON cheat_investigations(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cheat_investigations_severity ON cheat_investigations(severity);
CREATE INDEX IF NOT EXISTS idx_cheat_investigations_created_at ON cheat_investigations(created_at DESC);

-- Enable RLS on cheat_investigations
ALTER TABLE cheat_investigations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can do everything on cheat_investigations" ON cheat_investigations
  FOR ALL USING (true) WITH CHECK (true);

-- NOTE: Regular users CANNOT read cheat_investigations (admin-only)


-- ============================================================================
-- PART 6: Database functions for server-side validation
-- ============================================================================

-- Function: Validate research topology
-- Returns true if all prerequisites for a research item are completed
CREATE OR REPLACE FUNCTION validate_research_prereqs(
  p_research_id TEXT,
  p_completed_research TEXT[]
)
RETURNS BOOLEAN AS $$
DECLARE
  v_prereq TEXT;
BEGIN
  FOR v_prereq IN
    SELECT prerequisite_id FROM research_prerequisites WHERE research_id = p_research_id
  LOOP
    IF NOT (v_prereq = ANY(p_completed_research)) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;


-- Function: Validate a game action server-side
-- Returns a JSON with {valid, risk, reason, state_after}
CREATE OR REPLACE FUNCTION validate_game_action(
  p_user_id UUID,
  p_action_type TEXT,
  p_payload JSONB,
  p_current_money NUMERIC,
  p_current_game_tick BIGINT
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_building_type TEXT;
  v_building_cost NUMERIC;
  v_config_record RECORD;
BEGIN
  v_result := jsonb_build_object(
    'valid', true,
    'risk', 'none',
    'reason', null
  );

  -- Validate build action
  IF p_action_type = 'build' THEN
    v_building_type := p_payload->>'buildingType';

    -- Check if building type exists in config
    SELECT * INTO v_config_record
    FROM game_config_buildings
    WHERE id = v_building_type
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'valid', false,
        'risk', 'critical',
        'reason', 'Invalid building type: ' || COALESCE(v_building_type, 'null')
      );
    END IF;

    -- Check if player can afford it
    v_building_cost := COALESCE((v_config_record.cost->>'money')::NUMERIC, 0);
    IF p_current_money < v_building_cost THEN
      RETURN jsonb_build_object(
        'valid', false,
        'risk', 'high',
        'reason', 'Insufficient funds. Need: ' || v_building_cost || ', Have: ' || p_current_money
      );
    END IF;
  END IF;

  -- Validate game speed
  IF p_action_type = 'set_game_speed' THEN
    IF NOT (COALESCE((p_payload->>'speed')::INT, 0) IN (1, 2, 5, 10)) THEN
      RETURN jsonb_build_object(
        'valid', false,
        'risk', 'critical',
        'reason', 'Invalid game speed: ' || p_payload->>'speed'
      );
    END IF;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;


-- Function: Compute offline ticks (server-authoritative)
-- Returns the number of ticks that should have occurred since last save
CREATE OR REPLACE FUNCTION compute_offline_ticks(
  p_user_id UUID,
  p_max_ticks BIGINT DEFAULT 86400
)
RETURNS BIGINT AS $$
DECLARE
  v_last_tick TIMESTAMPTZ;
  v_game_speed INT;
  v_elapsed_seconds DOUBLE PRECISION;
  v_ticks BIGINT;
BEGIN
  -- Get last server tick time and game speed
  SELECT last_tick_at, game_speed INTO v_last_tick, v_game_speed
  FROM server_game_state
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Calculate elapsed seconds since last tick
  v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_last_tick));

  -- Compute ticks = seconds * speed (1 tick per second at 1x speed)
  v_ticks := FLOOR(v_elapsed_seconds * v_game_speed)::BIGINT;

  -- Cap at maximum
  IF v_ticks > p_max_ticks THEN
    v_ticks := p_max_ticks;
  END IF;

  RETURN GREATEST(v_ticks, 0);
END;
$$ LANGUAGE plpgsql STABLE;


-- Function: Lock a user account for cheating
CREATE OR REPLACE FUNCTION lock_cheater_account(
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
  -- Lock player_progress
  UPDATE player_progress
  SET is_locked = true,
      lock_reason = p_reason
  WHERE user_id = p_user_id;

  -- Lock server_game_state
  UPDATE server_game_state
  SET is_locked = true,
      lock_reason = p_reason
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- Function: Auto-lock after threshold of cheat flags
CREATE OR REPLACE FUNCTION increment_cheat_flag(
  p_user_id UUID,
  p_flag_type TEXT,
  p_description TEXT,
  p_severity TEXT
)
RETURNS VOID AS $$
DECLARE
  v_new_count INT;
  v_threshold INT := 3; -- Lock after 3 flags
BEGIN
  -- Increment flag count on player_progress
  UPDATE player_progress
  SET cheat_flag_count = cheat_flag_count + 1
  WHERE user_id = p_user_id
  RETURNING cheat_flag_count INTO v_new_count;

  -- Increment flag count on server_game_state
  UPDATE server_game_state
  SET cheat_flag_count = cheat_flag_count + 1
  WHERE user_id = p_user_id;

  -- Log the investigation
  INSERT INTO cheat_investigations (user_id, detection_type, severity, description)
  VALUES (p_user_id, p_flag_type, p_severity, p_description);

  -- Auto-lock if threshold reached
  IF v_new_count >= v_threshold THEN
    PERFORM lock_cheater_account(p_user_id, 'Auto-locked after ' || v_new_count || ' cheat flags');
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PART 7: Trigger — Auto-validate on save attempts
-- ============================================================================

-- Trigger function: Validate state before allowing a save
CREATE OR REPLACE FUNCTION validate_player_save()
RETURNS TRIGGER AS $$
DECLARE
  v_server_tick BIGINT;
  v_server_money NUMERIC;
BEGIN
  -- Check if account is locked
  IF NEW.is_locked = true THEN
    RAISE EXCEPTION 'Account is locked. Reason: %', COALESCE(NEW.lock_reason, 'Unknown');
  END IF;

  -- If server_game_state exists, compare against it
  SELECT game_tick, money INTO v_server_tick, v_server_money
  FROM server_game_state
  WHERE user_id = NEW.user_id;

  IF FOUND THEN
    -- Reject if client tick went backwards (time manipulation)
    IF NEW.server_game_tick < v_server_tick THEN
      PERFORM increment_cheat_flag(
        NEW.user_id,
        'tick_manipulation',
        'Game tick went backwards. Server: ' || v_server_tick || ', Client: ' || NEW.server_game_tick,
        'high'
      );
      RAISE EXCEPTION 'Invalid save: game tick regression detected';
    END IF;

    -- Flag if money is significantly higher than server record without plausible earnings
    IF NEW.money > (v_server_money * 2 + 100000) THEN
      PERFORM increment_cheat_flag(
        NEW.user_id,
        'money_manipulation',
        'Money jump detected. Server: ' || v_server_money || ', Client: ' || NEW.money,
        'critical'
      );
      -- Don't reject outright — could be legitimate offline earnings
      -- But flag for investigation
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trg_validate_player_save ON player_progress;
CREATE TRIGGER trg_validate_player_save
  BEFORE UPDATE ON player_progress
  FOR EACH ROW
  EXECUTE FUNCTION validate_player_save();


-- ============================================================================
-- PART 8: Seed research prerequisites from game_config_research
-- Purpose: Build the server-side research dependency tree from existing config
-- ============================================================================

-- Insert research prerequisites from the existing game_config_research table
-- The prerequisites field in game_config_research is a JSONB array of research IDs
INSERT INTO research_prerequisites (research_id, prerequisite_id)
SELECT
  r.id AS research_id,
  prereq::TEXT AS prerequisite_id
FROM game_config_research r,
     jsonb_array_elements_text(r.prerequisites) AS prereq
WHERE r.prerequisites IS NOT NULL
  AND jsonb_array_length(r.prerequisites) > 0
ON CONFLICT (research_id, prerequisite_id) DO NOTHING;


-- ============================================================================
-- PART 9: Clean up old sessions (maintenance function)
-- ============================================================================

-- Function to clean up stale sessions (offline for > 24 hours)
CREATE OR REPLACE FUNCTION cleanup_stale_sessions()
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM player_sessions
  WHERE is_online = false
    AND disconnected_at IS NOT NULL
    AND disconnected_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- PART 10: Create admin_users table (was in backend migration but never applied)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin', 'viewer')),
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.admin_users IS 'Authorized admin users for IndustriaX Backend access control';

-- Enable RLS on admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Super admins can view all
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_users' AND policyname = 'Super admins can view all admin users'
  ) THEN
    CREATE POLICY "Super admins can view all admin users"
      ON public.admin_users FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
        )
      );
  END IF;

  -- Admins can view their own record
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_users' AND policyname = 'Admins can view their own record'
  ) THEN
    CREATE POLICY "Admins can view their own record"
      ON public.admin_users FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  -- Super admins can insert
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_users' AND policyname = 'Super admins can insert admin users'
  ) THEN
    CREATE POLICY "Super admins can insert admin users"
      ON public.admin_users FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
        )
      );
  END IF;

  -- Super admins can update
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_users' AND policyname = 'Super admins can update admin users'
  ) THEN
    CREATE POLICY "Super admins can update admin users"
      ON public.admin_users FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
        )
      );
  END IF;

  -- Super admins can delete
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'admin_users' AND policyname = 'Super admins can delete admin users'
  ) THEN
    CREATE POLICY "Super admins can delete admin users"
      ON public.admin_users FOR DELETE
      USING (
        EXISTS (
          SELECT 1 FROM public.admin_users au
          WHERE au.user_id = auth.uid() AND au.role = 'super_admin'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON public.admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);

-- Seed the initial admin user
INSERT INTO public.admin_users (user_id, email, role)
VALUES (
  '1b4d0dc3-e4d2-4fc0-b731-9782243ad061',
  'admin@industriax.com',
  'super_admin'
) ON CONFLICT (user_id) DO NOTHING;


-- ============================================================================
-- DONE! Summary of what was created:
-- ============================================================================
--
-- EXISTING TABLES MODIFIED:
--   player_progress   → Added validated_state_hash, last_validated_tick,
--                        cheat_flag_count, is_locked, lock_reason
--   player_actions    → Extended action_type enum with 14 new types
--   player_sessions   → Formalized (was created via API, now has RLS)
--
-- NEW TABLES:
--   validated_actions      → Action validation queue (pending → validated → applied)
--   server_game_state      → Authoritative server-side game state
--   research_prerequisites → Server-side research dependency tree
--   cheat_investigations   → Detailed cheat incident tracking
--   admin_users            → Admin access control (was never applied)
--
-- NEW FUNCTIONS:
--   validate_research_prereqs()  → Check if research prerequisites are met
--   validate_game_action()       → Server-side action validation
--   compute_offline_ticks()      → Server-authoritative offline progress
--   lock_cheater_account()       → Lock a cheating account
--   increment_cheat_flag()       → Flag + auto-lock after threshold
--   cleanup_stale_sessions()     → Maintenance cleanup
--
-- NEW TRIGGERS:
--   trg_validate_player_save     → Auto-validate on every save attempt
--
-- ============================================================================
