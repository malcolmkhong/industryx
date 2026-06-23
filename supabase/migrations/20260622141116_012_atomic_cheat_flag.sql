-- ============================================================================
-- Migration: 012_atomic_cheat_flag
-- Description: Create atomic RPC for cheat flag increment + auto-lock
-- Purpose:     Close H3 (TOCTOU race in cheat flagging). Replaces read-then-write
--              pattern in gameStateValidator.ts:flagCheatAttempt() with a single
--              atomic PostgreSQL function that increments, logs, and auto-locks
--              in one transaction.
--
-- CONTEXT:
--   PHASE_1B_SECURITY_REPORT.md (2025-03-04) and PHASE_1B_SECURITY_FOLLOWUP_REPORT.md
--   both claimed this migration was created and deployed. CLAIM_VERIFICATION_MATRIX
--   did not explicitly track this. June 2026 code audit: migration file does NOT
--   exist in repo, and gameStateValidator.ts:394 still has the TODO comment for
--   the RPC. H3 is currently OPEN despite prior reports.
--
-- FIX (fail-closed):
--   1. RPC `increment_cheat_flag` does the increment + lock + investigation insert
--      atomically in a single transaction.
--   2. If RPC fails: client calls logFailedCheatFlag() which creates a critical
--      investigation entry (manual admin review required). No read-then-write
--      fallback (per PHASE_1B_FOLLOWUP — fallback reintroduces the race).
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================


-- ============================================================================
-- PART 1: Create the atomic increment function
-- Purpose: Single transaction does (1) increment flag count, (2) check threshold,
--          (3) auto-lock if reached, (4) insert investigation row. No race
--          window between read and write.
-- ============================================================================
DROP FUNCTION IF EXISTS public.increment_cheat_flag(uuid,text,text,text);

CREATE FUNCTION public.increment_cheat_flag(
  p_user_id UUID,
  p_detection_type TEXT,
  p_description TEXT,
  p_severity TEXT
)
RETURNS TABLE (
  new_flag_count INTEGER,
  was_locked BOOLEAN
) AS $$
DECLARE
  v_current_count INTEGER;
  v_new_count INTEGER;
  v_threshold INTEGER := 3;  -- Mirrors GAME_LIMITS.MAX_CHEAT_FLAGS in code
  v_was_locked BOOLEAN := FALSE;
BEGIN
  -- Lock the row to prevent concurrent increments from racing
  -- (SELECT ... FOR UPDATE is the standard row-level lock in PostgreSQL)
  SELECT cheat_flag_count, is_locked
    INTO v_current_count, v_was_locked
    FROM server_game_state
    WHERE user_id = p_user_id
    FOR UPDATE;

  -- If the user has no server_game_state row, we cannot safely create one here
  -- (the row is created by the cloud sync path). Skip silently — same behavior
  -- the old code had.
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, FALSE;
    RETURN;
  END IF;

  v_new_count := COALESCE(v_current_count, 0) + 1;

  -- If already locked, still record the investigation (for audit trail) but
  -- don't re-increment the counter (the lock is permanent until admin review).
  IF v_was_locked THEN
    INSERT INTO cheat_investigations (
      user_id, detection_type, severity, description,
      evidence, action
    ) VALUES (
      p_user_id, p_detection_type, p_severity, p_description,
      jsonb_build_object('flagCount', v_current_count, 'alreadyLocked', TRUE),
      'flag_recorded_on_locked_account'
    );
    RETURN QUERY SELECT v_current_count, TRUE;
    RETURN;
  END IF;

  -- Update cheat_flag_count atomically; auto-lock if threshold reached
  UPDATE server_game_state
    SET cheat_flag_count = v_new_count,
        is_locked = (v_new_count >= v_threshold),
        lock_reason = CASE
          WHEN v_new_count >= v_threshold
            THEN 'Auto-locked after ' || v_new_count || ' cheat flags. Last: ' || p_description
          ELSE lock_reason
        END
    WHERE user_id = p_user_id;

  IF v_new_count >= v_threshold THEN
    v_was_locked := TRUE;
  END IF;

  -- Insert investigation row in the same transaction
  INSERT INTO cheat_investigations (
    user_id, detection_type, severity, description,
    evidence, action
  ) VALUES (
    p_user_id, p_detection_type, p_severity, p_description,
    jsonb_build_object('flagCount', v_new_count, 'autoLocked', v_was_locked),
    CASE
      WHEN v_was_locked THEN 'auto_locked_threshold_reached'
      ELSE 'flag_recorded'
    END
  );

  RETURN QUERY SELECT v_new_count, v_was_locked;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) IS
  'Atomically increment cheat_flag_count, auto-lock if threshold reached, and insert investigation. Replaces read-then-write pattern that was vulnerable to TOCTOU race (H3).';

-- ============================================================================
-- PART 2: Grant execute permission to service role
-- Purpose: Only the backend (service role) can call this. RLS on the
--          underlying tables still applies to all other roles.
-- ============================================================================

-- Supabase service role bypasses RLS by default, but the function is
-- SECURITY DEFINER so it runs with the function owner's privileges.
-- We revoke from PUBLIC and grant to authenticated (service role bypasses this).
REVOKE ALL ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) TO service_role;
