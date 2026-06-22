-- ============================================================================
-- Migration 032: Extend admin_actions CHECK constraint for new action types
-- ============================================================================
-- Purpose: Add audit logging for config table writes and admin management.
--          The original CHECK constraint (migration 006) only allowed 6 types.
-- ============================================================================

ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_type_check;

ALTER TABLE public.admin_actions ADD CONSTRAINT admin_actions_action_type_check
  CHECK (action_type IN (
    'lock_account',
    'unlock_account',
    'reset_state',
    'edit_state',
    'create_config_row',
    'update_config_row',
    'delete_config_row',
    'resolve_investigation',
    'dismiss_investigation',
    'add_admin',
    'remove_admin',
    'change_admin_role'
  ));
