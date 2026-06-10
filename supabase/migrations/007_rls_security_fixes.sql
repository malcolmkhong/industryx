-- ============================================================================
-- Migration: 007_rls_security_fixes
-- Description: Fix critical RLS vulnerabilities discovered during audit
-- Purpose: Prevent unauthorized read/write access to sensitive tables
--
-- CHANGES:
--   1. Fix server_game_state: restrict service role policy to auth.role() check
--   2. Fix admin_actions: restrict service role policy to auth.role() check
--   3. Fix cheat_investigations: restrict service role policy to auth.role() check
--   4. Fix player_sessions: consolidate duplicate policies, restrict to auth.role()
--   5. Fix player_actions: restrict service role policy to auth.role() check
--   6. Fix player_progress: restrict service role policy, remove public admin read
--   7. Fix admin_users: replace self-referencing policies with is_game_admin()
--
-- BACKGROUND:
--   The original migrations used USING (true) for "service role" policies,
--   which actually allows ALL authenticated and anonymous users to access
--   the data. The Supabase service_role key bypasses RLS entirely, so
--   these policies were redundant for service role but created a security
--   hole for anon/authenticated users.
--
--   This migration replaces USING (true) with USING (auth.role() = 'service_role')
--   which properly restricts access to service role API calls only.
--
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================================


-- ============================================================================
-- PART 1: server_game_state
-- ============================================================================
DROP POLICY IF EXISTS "Service role can do everything on server_game_state" ON server_game_state;
DROP POLICY IF EXISTS "Service role full access on server_game_state" ON server_game_state;

CREATE POLICY "Service role full access on server_game_state" ON server_game_state
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Keep: Users can read own server game state (already correct)


-- ============================================================================
-- PART 2: admin_actions
-- ============================================================================
DROP POLICY IF EXISTS "Service role full access on admin_actions" ON admin_actions;

CREATE POLICY "Service role full access on admin_actions" ON admin_actions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');


-- ============================================================================
-- PART 3: cheat_investigations
-- ============================================================================
DROP POLICY IF EXISTS "Service role can do everything on cheat_investigations" ON cheat_investigations;
DROP POLICY IF EXISTS "Service role full access on cheat_investigations" ON cheat_investigations;

CREATE POLICY "Service role full access on cheat_investigations" ON cheat_investigations
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');


-- ============================================================================
-- PART 4: player_sessions
-- ============================================================================
DROP POLICY IF EXISTS "Service role can do everything on sessions" ON player_sessions;
DROP POLICY IF EXISTS "Service role manages sessions" ON player_sessions;
DROP POLICY IF EXISTS "Service role full access on player_sessions" ON player_sessions;

CREATE POLICY "Service role full access on player_sessions" ON player_sessions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Keep: Users can read own sessions (already correct)


-- ============================================================================
-- PART 5: player_actions
-- ============================================================================
DROP POLICY IF EXISTS "Service role can do everything on actions" ON player_actions;
DROP POLICY IF EXISTS "Service role full access on player_actions" ON player_actions;

CREATE POLICY "Service role full access on player_actions" ON player_actions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Keep: Users can read own actions, Users can insert own actions (already correct)


-- ============================================================================
-- PART 6: player_progress
-- ============================================================================
DROP POLICY IF EXISTS "Service role can do everything" ON player_progress;
DROP POLICY IF EXISTS "Service role full access on player_progress" ON player_progress;
DROP POLICY IF EXISTS "Player progress: admin can read all" ON player_progress;

CREATE POLICY "Service role full access on player_progress" ON player_progress
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Keep: owner can read/insert/update (already correct)


-- ============================================================================
-- PART 7: admin_users
-- Fix infinite recursion caused by self-referencing RLS policies
-- ============================================================================
DROP POLICY IF EXISTS "Super admins can view all admin users" ON admin_users;
DROP POLICY IF EXISTS "Admins can view their own record" ON admin_users;
DROP POLICY IF EXISTS "Super admins can insert admin users" ON admin_users;
DROP POLICY IF EXISTS "Super admins can update admin users" ON admin_users;
DROP POLICY IF EXISTS "Super admins can delete admin users" ON admin_users;
DROP POLICY IF EXISTS "Game admins can view all admin_users" ON admin_users;
DROP POLICY IF EXISTS "Game admins can insert admin_users" ON admin_users;
DROP POLICY IF EXISTS "Game admins can update admin_users" ON admin_users;
DROP POLICY IF EXISTS "Game admins can delete admin_users" ON admin_users;

-- Use is_game_admin() function instead of self-referencing admin_users table
-- This avoids the infinite recursion issue
CREATE POLICY "Game admins can view all admin_users" ON admin_users
  FOR SELECT USING (is_game_admin() OR user_id = auth.uid());

CREATE POLICY "Game admins can insert admin_users" ON admin_users
  FOR INSERT WITH CHECK (is_game_admin());

CREATE POLICY "Game admins can update admin_users" ON admin_users
  FOR UPDATE USING (is_game_admin()) WITH CHECK (is_game_admin());

CREATE POLICY "Game admins can delete admin_users" ON admin_users
  FOR DELETE USING (is_game_admin());


-- ============================================================================
-- DONE! Summary of what was changed:
-- ============================================================================
--
-- SECURITY FIXES:
--   server_game_state  → Service role policy now uses auth.role() = 'service_role'
--   admin_actions      → Service role policy now uses auth.role() = 'service_role'
--   cheat_investigations → Service role policy now uses auth.role() = 'service_role'
--   player_sessions    → Consolidated 2 duplicate policies → 1 with auth.role() check
--   player_actions     → Service role policy now uses auth.role() = 'service_role'
--   player_progress    → Service role policy now uses auth.role() = 'service_role'
--   admin_users        → Fixed infinite recursion using is_game_admin() function
--
-- REMOVED POLICIES:
--   "Service role can do everything on server_game_state" (USING true = insecure)
--   "Service role can do everything on cheat_investigations" (USING true = insecure)
--   "Service role can do everything on sessions" (USING true = insecure)
--   "Service role manages sessions" (duplicate)
--   "Service role can do everything on actions" (USING true = insecure)
--   "Service role can do everything" on player_progress (USING true = insecure)
--   "Player progress: admin can read all" (USING true = insecure)
--   All self-referencing admin_users policies (caused infinite recursion)
--
-- ============================================================================
