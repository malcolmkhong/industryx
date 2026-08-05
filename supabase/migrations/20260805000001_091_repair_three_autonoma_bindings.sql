-- 091_repair_three_autonoma_bindings.sql
--
-- One-off data repair for 3 stuck device_bindings created by the Autonoma
-- end-to-end test runner on 2026-08-03. The bindings reference profiles
-- (progress_lifecycle='never_initialized') but have NO server_game_state
-- row, so bootstrap RPCs return STATE_RECOVERY_REQUIRED (HTTP 422).
--
-- The RPCs refuse to auto-provision progress because migration 079
-- (progress_lifecycle_guarded_provisioning) intentionally requires
-- explicit recovery to prevent silent state corruption. This migration
-- is the explicit recovery for these 3 known fixtures.
--
-- Pre-check (run before applying):
--   SELECT b.user_id, b.binding_type, p.progress_lifecycle
--   FROM device_bindings b
--   LEFT JOIN profiles p ON p.id = b.user_id
--   LEFT JOIN server_game_state s ON s.user_id = b.user_id
--   WHERE b.status = 'active'
--     AND s.user_id IS NULL
--     AND p.progress_lifecycle IS DISTINCT FROM 'active';
--
-- Affected users (all Autonoma test fixtures, no real users):
--   5fdd7006-dd9f-563c-a652-968603b21d46  admin-e78a2657@industryx.test
--   105ed8c3-0611-5c8b-a03d-13c680a6c36c  guest+cli-1785+guest-2@autonoma.local
--   f9a2568f-d121-5d69-a630-9c8323c8e3ed  guest+cli-1785+guest-3@autonoma.local
--
-- After this migration, bootstrap for these device ids returns 200
-- BOOTSTRAP_READY (state_hash='placeholder', all defaults).

BEGIN;

-- 1. Insert a server_game_state row for each stuck user. Defaults match
--    the canonical fresh-player schema: 1000 starting money, no progress.
-- 2000 matches `game_config_game.starting_money` in production, not the
-- 1000 server_game_state column default. The column default is for
-- locally-fresh rows; live players start with whatever
-- game_config_game.starting_money says. Verified 2026-08-05:
--   SELECT starting_money FROM game_config_game WHERE id = 'global';
--   -> 2000
INSERT INTO public.server_game_state (user_id, money, state_hash)
VALUES
  ('5fdd7006-dd9f-563c-a652-968603b21d46', 2000, 'placeholder'),
  ('105ed8c3-0611-5c8b-a03d-13c680a6c36c', 2000, 'placeholder'),
  ('f9a2568f-d121-5d69-a630-9c8323c8e3ed', 2000, 'placeholder')
ON CONFLICT (user_id) DO NOTHING;

-- 2. Transition progress_lifecycle from 'never_initialized' to 'active'
--    for the same three users. This is what migration 079 expects for
--    a bootstrap-ready state.
UPDATE public.profiles
SET progress_lifecycle = 'active',
    updated_at = NOW()
WHERE id IN (
  '5fdd7006-dd9f-563c-a652-968603b21d46',
  '105ed8c3-0611-5c8b-a03d-13c680a6c36c',
  'f9a2568f-d121-5d69-a630-9c8323c8e3ed'
)
AND progress_lifecycle IS DISTINCT FROM 'active';

-- 3. Verify: there should be 0 active device_bindings that still lack
--    server_game_state after this migration runs. The verification is
--    non-fatal so the migration completes even if (in the unlikely event
--    of new bindings arriving mid-run) the count is non-zero.
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT count(*) INTO remaining
  FROM device_bindings b
  LEFT JOIN server_game_state s ON s.user_id = b.user_id
  WHERE b.status = 'active' AND s.user_id IS NULL;
  IF remaining > 0 THEN
    RAISE NOTICE '[091] % device_bindings still lack server_game_state after repair', remaining;
  ELSE
    RAISE NOTICE '[091] all active device_bindings now have server_game_state';
  END IF;
END $$;

COMMIT;