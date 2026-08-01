-- Authenticated progress lifecycle and guarded initial-state provisioning.
-- A missing server_game_state row never proves an account is new.
-- No gameplay rows are changed, regenerated, or deleted in this migration.

BEGIN;

-- 1. Lifecycle marker and profile-only backfill.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS progress_lifecycle TEXT;

UPDATE public.profiles AS profile
SET progress_lifecycle = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.server_game_state AS state
    WHERE state.user_id = profile.id
  ) THEN 'active'
  ELSE 'recovery_required'
END;

ALTER TABLE public.profiles
  ALTER COLUMN progress_lifecycle SET DEFAULT 'never_initialized',
  ALTER COLUMN progress_lifecycle SET NOT NULL;

DO $add_progress_lifecycle_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_progress_lifecycle_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_progress_lifecycle_check
      CHECK (
        progress_lifecycle IN (
          'never_initialized',
          'active',
          'recovery_required'
        )
      );
  END IF;
END
$add_progress_lifecycle_constraint$;

COMMENT ON COLUMN public.profiles.progress_lifecycle IS
  'Irreversible progress lifecycle. New profiles begin never_initialized; first state creation activates; recovery_required never auto-resets.';

CREATE OR REPLACE FUNCTION public.enforce_progress_lifecycle_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.progress_lifecycle = OLD.progress_lifecycle THEN
    RETURN NEW;
  END IF;

  -- A lifecycle can advance into recovery, but can never be reset to make
  -- an existing account look new again.
  IF (OLD.progress_lifecycle = 'never_initialized' AND NEW.progress_lifecycle = 'active')
     OR (OLD.progress_lifecycle = 'active' AND NEW.progress_lifecycle = 'recovery_required')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Invalid progress lifecycle transition from % to %',
    OLD.progress_lifecycle,
    NEW.progress_lifecycle
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_enforce_progress_lifecycle
  ON public.profiles;

CREATE TRIGGER trg_profiles_enforce_progress_lifecycle
  BEFORE UPDATE OF progress_lifecycle ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_progress_lifecycle_transition();

-- 2. Enforce lifecycle ownership for every first state write.
CREATE OR REPLACE FUNCTION public.guard_initial_server_game_state_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lifecycle TEXT;
BEGIN
  -- Ordinary updates, including INSERT ... ON CONFLICT DO UPDATE, retain an
  -- existing state row and are not first-state creation.
  IF TG_OP = 'UPDATE' AND NEW.user_id = OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM public.server_game_state AS existing_state
    WHERE existing_state.user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  -- Lock the target profile before creating or moving its first state row.
  -- Missing, active-without-state, and recovery profiles all fail closed.
  SELECT progress_lifecycle
    INTO v_lifecycle
  FROM public.profiles
  WHERE id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND OR v_lifecycle IS DISTINCT FROM 'never_initialized' THEN
    RAISE EXCEPTION
      'Initial server_game_state write requires never_initialized profile for user %',
      NEW.user_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_progress_lifecycle_after_initial_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Same transaction as the successful initial insert or ownership move.
  -- A recovery lifecycle is intentionally never cleared by a later write.
  UPDATE public.profiles
  SET progress_lifecycle = 'active'
  WHERE id = NEW.user_id
    AND progress_lifecycle = 'never_initialized';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_server_game_state_guard_initial_write
  ON public.server_game_state;

CREATE TRIGGER trg_server_game_state_guard_initial_write
  BEFORE INSERT OR UPDATE OF user_id ON public.server_game_state
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_initial_server_game_state_write();

DROP TRIGGER IF EXISTS trg_server_game_state_activate_progress_lifecycle
  ON public.server_game_state;

CREATE TRIGGER trg_server_game_state_activate_progress_lifecycle
  AFTER INSERT OR UPDATE OF user_id ON public.server_game_state
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_progress_lifecycle_after_initial_state();

-- 3. Bootstrap-only classification before guest-upgrade evaluation.
CREATE OR REPLACE FUNCTION public.classify_authenticated_progress_lifecycle(
  p_user_id UUID
)
RETURNS TABLE (
  status TEXT,
  progress_lifecycle TEXT,
  has_game_state BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lifecycle TEXT;
  v_has_state BOOLEAN := FALSE;
BEGIN
  SELECT profile.progress_lifecycle
    INTO v_lifecycle
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id;

  IF NOT FOUND THEN
    status := 'ERROR';
    progress_lifecycle := NULL;
    has_game_state := NULL;
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.server_game_state AS state
    WHERE state.user_id = p_user_id
  ) INTO v_has_state;

  IF v_lifecycle = 'never_initialized' AND NOT v_has_state THEN
    status := 'NEW_ACCOUNT';
    progress_lifecycle := v_lifecycle;
    has_game_state := FALSE;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_lifecycle = 'active' AND v_has_state THEN
    status := 'ACTIVE';
    progress_lifecycle := v_lifecycle;
    has_game_state := TRUE;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- active + missing state, recovery_required, unknown values, and
  -- never_initialized + state are inconsistent and require recovery.
  status := 'ERROR';
  progress_lifecycle := v_lifecycle;
  has_game_state := v_has_state;
  error_code := 'STATE_RECOVERY_REQUIRED';
  RETURN NEXT;
  RETURN;
END;
$$;

-- 4. The authenticated first-state transaction boundary.
CREATE OR REPLACE FUNCTION public.provision_authenticated_initial_state(
  p_user_id UUID
)
RETURNS TABLE (
  status TEXT,
  state_created BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lifecycle TEXT;
  v_has_state BOOLEAN := FALSE;
BEGIN
  -- Lock profile, verify lifecycle, create one state row, and activate the
  -- profile in the same transaction. Any exception rolls all changes back.
  SELECT profile.progress_lifecycle
    INTO v_lifecycle
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    status := 'ERROR';
    state_created := NULL;
    error_code := 'STATE_RECOVERY_REQUIRED';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.server_game_state AS state
    WHERE state.user_id = p_user_id
  ) INTO v_has_state;

  IF v_lifecycle = 'never_initialized' AND NOT v_has_state THEN
    -- The existing placeholder-default trigger supplies config-derived
    -- denormalized values; bootstrap hydration produces complete state.
    INSERT INTO public.server_game_state (
      user_id,
      money,
      game_tick,
      game_speed,
      state_version,
      full_state,
      state_hash
    ) VALUES (
      p_user_id,
      0,
      0,
      1,
      1,
      jsonb_build_object('bootstrap_pending', TRUE),
      ''
    );

    -- The lifecycle AFTER INSERT trigger performs this transition too. Keep
    -- it explicit here so the provisioning RPC owns its full contract.
    UPDATE public.profiles
    SET progress_lifecycle = 'active'
    WHERE id = p_user_id
      AND progress_lifecycle = 'never_initialized';

    status := 'PROVISIONED';
    state_created := TRUE;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_lifecycle = 'active' AND v_has_state THEN
    status := 'ACTIVE';
    state_created := FALSE;
    error_code := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  status := 'ERROR';
  state_created := FALSE;
  error_code := 'STATE_RECOVERY_REQUIRED';
  RETURN NEXT;
  RETURN;
END;
$$;

-- Compatibility only. The old implementation created a profile and state for
-- any existing auth id. It now delegates to the guarded contract.
CREATE OR REPLACE FUNCTION public.ensure_profile_and_state(
  p_user_id UUID
)
RETURNS TABLE (
  status TEXT,
  profile_created BOOLEAN,
  state_created BOOLEAN,
  needs_recovery BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_provision RECORD;
BEGIN
  SELECT *
    INTO v_provision
  FROM public.provision_authenticated_initial_state(p_user_id);

  status := CASE WHEN v_provision.error_code IS NULL THEN 'OK' ELSE 'ERROR' END;
  profile_created := FALSE;
  state_created := v_provision.state_created;
  needs_recovery := v_provision.error_code = 'STATE_RECOVERY_REQUIRED';
  error_code := v_provision.error_code;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.classify_authenticated_progress_lifecycle(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.provision_authenticated_initial_state(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_profile_and_state(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.classify_authenticated_progress_lifecycle(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_authenticated_initial_state(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_profile_and_state(UUID)
  TO service_role;

COMMENT ON FUNCTION public.classify_authenticated_progress_lifecycle(UUID) IS
  'Returns NEW_ACCOUNT only for never_initialized profile with no state; every inconsistent lifecycle requires recovery.';
COMMENT ON FUNCTION public.provision_authenticated_initial_state(UUID) IS
  'Locks a never_initialized profile, creates one initial state row, and transitions to active atomically.';
COMMENT ON FUNCTION public.ensure_profile_and_state(UUID) IS
  'Compatibility wrapper for rollout callers. Delegates to lifecycle-guarded provisioning and never regenerates active or recovery progress.';

COMMIT;
