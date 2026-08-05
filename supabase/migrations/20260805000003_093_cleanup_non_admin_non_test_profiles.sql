-- 093_cleanup_non_admin_non_test_profiles.sql
--
-- Production cleanup: delete ALL profiles except admin. Synthetic-prefix
-- "test" profiles also go per CEO directive ("delete all user profile,
-- noneed to verify, we will test after delete").
--
-- FK cascade order handled via ON DELETE CASCADE on dependent tables.
-- RESTRICT and NO ACTION FK blockers are nulled or deleted first.

BEGIN;

-- Step 1: RESTRICT blockers + NO ACTION FK blockers that reference
-- ghost users with NOT NULL columns (merge_receipts.kept_user_id).
DELETE FROM public.game_state_recovery_receipts
 WHERE user_id IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

DELETE FROM public.game_state_recovery_cases
 WHERE user_id IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

-- merge_receipts: kept_user_id is NOT NULL, archived_user_id is NULLable.
-- Delete entirely if it touches a ghost, NULL archived_user_id if it
-- only references a ghost via the nullable column.
DELETE FROM public.merge_receipts
 WHERE kept_user_id IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 )
    OR archived_user_id IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

-- Step 2: NULL nullable NO ACTION FK columns that point at ghost users.
UPDATE public.game_state_recovery_cases
   SET status = 'rejected',
       approved_by = NULL
 WHERE approved_by IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

UPDATE public.device_bindings
   SET superseded_by = NULL
 WHERE superseded_by IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

UPDATE public.guest_identities
   SET superseded_by = NULL
 WHERE superseded_by IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

UPDATE public.guest_state_archive
   SET archived_by_auth_user_id = NULL
 WHERE archived_by_auth_user_id IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

UPDATE public.support_tickets
   SET accepted_by = NULL
 WHERE accepted_by IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

UPDATE public.cheat_investigations
   SET resolved_by = NULL
 WHERE resolved_by IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

UPDATE public.admin_users
   SET added_by = NULL
 WHERE added_by IN (
   SELECT id FROM auth.users
    WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061'
 );

UPDATE public.profiles
   SET linked_account_id = NULL
 WHERE linked_account_id IS NOT NULL
   AND linked_account_id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';

-- Step 3: Delete ALL profiles except admin.
DELETE FROM public.profiles
 WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';

-- Step 4: admin_users before auth.users (CASCADE).
DELETE FROM public.admin_users
 WHERE user_id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';

-- Step 5: Delete auth.users. CASCADE handles ~30 dependent tables.
DELETE FROM auth.users
 WHERE id != '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';

COMMIT;

DO $$
DECLARE
  v_profiles INT;
  v_auth INT;
  v_bindings INT;
  v_states INT;
  v_admins INT;
BEGIN
  SELECT count(*) INTO v_profiles FROM profiles;
  SELECT count(*) INTO v_auth FROM auth.users;
  SELECT count(*) INTO v_bindings FROM device_bindings;
  SELECT count(*) INTO v_states FROM server_game_state;
  SELECT count(*) INTO v_admins FROM admin_users;
  RAISE NOTICE '[093] POST-CLEANUP: profiles=%, auth.users=%, device_bindings=%, server_game_state=%, admin_users=%',
    v_profiles, v_auth, v_bindings, v_states, v_admins;
END $$;