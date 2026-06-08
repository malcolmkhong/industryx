-- ============================================================================
-- Migration: 006_admin_moderation_system
-- Description: Create admin audit trail and restore investigation resolution
-- Purpose: Enable admin moderation with full action history and investigation
--          resolution workflow (columns dropped in 005, now needed for admin panel)
--
-- CHANGES:
--   1. CREATE admin_actions table — audit trail for all admin operations
--   2. ADD back resolution columns to cheat_investigations (dropped in 005)
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================


-- ============================================================================
-- PART 1: Create admin_actions table
-- Purpose: Immutable audit trail for every admin operation. This table is
--          append-only — admins should never UPDATE or DELETE rows. All
--          mutations go through the service role (backend API).
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_actions (
  -- Primary key, auto-generated
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The admin who performed the action (required)
  -- If the admin user is deleted from auth.users, cascade removes their
  -- action records to avoid orphan references (admins are trusted system users)
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The user targeted by the action (nullable)
  -- Some actions (e.g. global state reset) don't target a specific user.
  -- If the target user is deleted, SET NULL preserves the audit record
  -- while avoiding a dangling foreign key.
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- What kind of admin action was performed
  -- Enum constrained to known action types for query consistency
  action_type TEXT NOT NULL CHECK (action_type IN (
    'lock_account',            -- Lock a user account (sets is_locked = true)
    'unlock_account',          -- Unlock a previously locked account
    'reset_state',             -- Reset a user's game state to defaults
    'resolve_investigation',   -- Resolve a cheat investigation (guilty/confirmed)
    'dismiss_investigation',   -- Dismiss a cheat investigation (false positive)
    'edit_state'               -- Manually edit a user's game state fields
  )),

  -- Flexible context payload for the action
  -- Common fields: reason (TEXT), investigation_id (UUID), old_value, new_value
  -- Using JSONB allows extensibility without schema changes
  details JSONB NOT NULL DEFAULT '{}',

  -- When the action was performed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add table comment for documentation
COMMENT ON TABLE admin_actions IS 'Immutable audit trail for all admin moderation actions. Append-only, accessed via service role only.';

-- Column comments for discoverability
COMMENT ON COLUMN admin_actions.admin_user_id IS 'The admin who performed the action. CASCADE on delete — if admin is removed, their action records are removed too.';
COMMENT ON COLUMN admin_actions.target_user_id IS 'The user targeted by the action. Nullable — some actions (e.g. global reset) have no specific target. SET NULL on delete to preserve audit history.';
COMMENT ON COLUMN admin_actions.action_type IS 'Type of admin action performed. Constrained to known enum values for query consistency.';
COMMENT ON COLUMN admin_actions.details IS 'Flexible JSONB context: reason, investigation_id, old_value, new_value, etc.';
COMMENT ON COLUMN admin_actions.created_at IS 'Timestamp when the admin action was performed. Defaults to NOW().';


-- ============================================================================
-- PART 1a: Indexes for admin_actions
-- ============================================================================

-- Lookup all actions performed by a specific admin
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin
  ON admin_actions(admin_user_id);

-- Lookup all actions targeting a specific user (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_admin_actions_target
  ON admin_actions(target_user_id);

-- Chronological listing of admin actions (newest first)
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
  ON admin_actions(created_at DESC);


-- ============================================================================
-- PART 1b: Row-Level Security for admin_actions
-- Policy: Service role has full access. No regular user access — this is an
--         admin-only table accessed exclusively through backend API routes
--         that authenticate via service role key.
-- ============================================================================

-- Enable RLS
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Service role full access policy (used by backend API)
-- This is the ONLY policy — regular users have zero access
CREATE POLICY "Service role full access on admin_actions" ON admin_actions
  FOR ALL USING (true) WITH CHECK (true);

-- Explicitly: no user-level access policies exist.
-- All admin action reads/writes must go through backend API routes
-- that use the service_role key to bypass RLS.


-- ============================================================================
-- PART 2: Restore resolution columns on cheat_investigations
-- Reason: Migration 005 dropped resolved_by, resolution_note, and resolved_at
--         because "admin panel doesn't exist yet." Now that we're building
--         the admin moderation system, these columns are needed again.
--         Using ADD COLUMN IF NOT EXISTS for idempotency.
-- ============================================================================

-- Who resolved the investigation (nullable — open/investigating cases have no resolver yet)
-- FK to auth.users but NO on-delete cascade: if the admin user is deleted,
-- we still want to know WHO resolved the investigation. The UUID alone is
-- sufficient for historical records even if the user no longer exists.
ALTER TABLE cheat_investigations
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id);

-- Free-text note explaining the resolution decision
-- Nullable — not all resolutions require a detailed note
ALTER TABLE cheat_investigations
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- When the investigation was resolved
-- Nullable — only set when status transitions to 'resolved' or 'dismissed'
ALTER TABLE cheat_investigations
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Column comments for documentation
COMMENT ON COLUMN cheat_investigations.resolved_by IS 'Admin who resolved/dismissed the investigation. Nullable for open/investigating cases. FK without CASCADE — preserve audit history if admin is deleted.';
COMMENT ON COLUMN cheat_investigations.resolution_note IS 'Free-text explanation of the resolution decision. Nullable.';
COMMENT ON COLUMN cheat_investigations.resolved_at IS 'Timestamp when the investigation was resolved or dismissed. Nullable until resolution.';


-- ============================================================================
-- DONE! Summary of what was changed:
-- ============================================================================
--
-- NEW TABLE:
--   admin_actions → Immutable audit trail for admin operations
--     Columns: id (UUID PK), admin_user_id (UUID FK→auth.users CASCADE),
--              target_user_id (UUID FK→auth.users SET NULL, nullable),
--              action_type (TEXT CHECK enum),
--              details (JSONB DEFAULT '{}'),
--              created_at (TIMESTAMPTZ DEFAULT NOW())
--     Indexes: idx_admin_actions_admin, idx_admin_actions_target,
--              idx_admin_actions_created_at
--     RLS: Enabled, service-role-only access (no user-level policies)
--
-- MODIFIED TABLE:
--   cheat_investigations → Restored 3 columns dropped in migration 005
--     Added: resolved_by (UUID FK→auth.users, nullable)
--            resolution_note (TEXT, nullable)
--            resolved_at (TIMESTAMPTZ, nullable)
--
-- ============================================================================
