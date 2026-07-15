-- Migration 073: Create device_bindings table for unified device-to-user
-- binding storage. Replaces the device-binding role currently filled by
-- guest_identities.device_id.
--
-- Why this migration exists:
--   Per AUTH_ORCHESTRATOR_REDESIGN_PLAN.md §8 (frozen 2026-07-14):
--     - Schema audit completed: guest_identities cannot model both
--       authenticated device association AND active guest binding for
--       the same device.
--     - New table with binding_type discriminator + status lifecycle.
--     - Partial unique index enforces one active guest per device.
--     - No global UNIQUE(device_id) (would block sign-out-to-guest flow).
--
-- What this migration does:
--   1. Creates public.device_bindings table.
--   2. Creates partial unique index for one active guest per device.
--   3. Adds standard RLS policies (service-role full + user read-own).
--   4. Backfills from existing guest_identities rows where device_id is set.
--   5. Adds public.audit_orphan_bindings() SQL function for plan §19 report.
--   6. Wires updated_at trigger (reuses public.set_updated_at() from 027).
--
-- What this migration does NOT do (deferred to PR 4):
--   - Drop guest_identities.device_id column. Stays until the new
--     /api/auth/bootstrap RPC ships and all legacy callers become wrappers.
--   - Drop the partial unique index on guest_identities.fingerprint.
--     Fingerprint remains as risk-signal telemetry, not identity lookup.
--
-- Idempotent: all DDL uses IF NOT EXISTS / DROP IF EXISTS guards.

BEGIN;

-- ============================================================================
-- 1. CREATE device_bindings table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.device_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  binding_type TEXT NOT NULL
    CHECK (binding_type IN ('authenticated_association', 'active_guest')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'revoked', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_device_bindings_user_id
  ON public.device_bindings(user_id);

CREATE INDEX IF NOT EXISTS idx_device_bindings_device_id
  ON public.device_bindings(device_id);

CREATE INDEX IF NOT EXISTS idx_device_bindings_user_active
  ON public.device_bindings(user_id)
  WHERE status = 'active';

-- ============================================================================
-- 3. PARTIAL UNIQUE INDEX: one active guest binding per device
--    Authenticated associations are NOT constrained by this index,
--    allowing coexistence with one active_guest binding on the same device
--    (per plan §8 sign-out-to-guest lifecycle).
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_guest_binding_per_device
  ON public.device_bindings (device_id)
  WHERE binding_type = 'active_guest'
    AND status = 'active';

-- ============================================================================
-- 4. RLS
-- ============================================================================
ALTER TABLE public.device_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on device_bindings" ON public.device_bindings;
DROP POLICY IF EXISTS "Users can read own device bindings" ON public.device_bindings;

CREATE POLICY "Service role full access on device_bindings" ON public.device_bindings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can read own device bindings" ON public.device_bindings
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- 5. updated_at TRIGGER (reuses public.set_updated_at() from migration 027)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_device_bindings_set_updated_at ON public.device_bindings;
CREATE TRIGGER trg_device_bindings_set_updated_at
  BEFORE UPDATE ON public.device_bindings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 6. BACKFILL from existing guest_identities rows
--    For each non-null device_id, create a corresponding device_bindings row.
--    - Superseded guest_identities rows map to status='superseded'.
--    - Active rows map to status='active'.
--    - ON CONFLICT DO NOTHING keeps the migration idempotent.
-- ============================================================================
INSERT INTO public.device_bindings (
  device_id,
  user_id,
  binding_type,
  status,
  created_at,
  updated_at
)
SELECT
  gi.device_id,
  gi.user_id,
  'active_guest'::TEXT,
  CASE
    WHEN gi.superseded_by IS NOT NULL THEN 'superseded'
    ELSE 'active'
  END,
  COALESCE(gi.created_at, NOW()),
  COALESCE(gi.last_used_at, NOW())
FROM public.guest_identities gi
WHERE gi.device_id IS NOT NULL
  AND gi.device_id <> ''
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. AUDIT FUNCTION: audit_orphan_bindings()
--    Returns one row per issue category with count.
--    Per plan §19 observability and audit reporting.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.audit_orphan_bindings()
RETURNS TABLE (
  issue TEXT,
  count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- auth user without profile
  SELECT 'auth_user_without_profile'::TEXT, COUNT(*)::BIGINT
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE p.id IS NULL

  UNION ALL

  -- profile without game state
  SELECT 'profile_without_game_state'::TEXT, COUNT(*)::BIGINT
  FROM public.profiles p
  LEFT JOIN public.server_game_state s ON s.user_id = p.id
  WHERE s.user_id IS NULL

  UNION ALL

  -- active guest binding whose guest user is missing profile
  SELECT 'active_guest_binding_missing_profile'::TEXT, COUNT(*)::BIGINT
  FROM public.device_bindings db
  LEFT JOIN public.profiles p ON p.id = db.user_id
  WHERE db.binding_type = 'active_guest'
    AND db.status = 'active'
    AND p.id IS NULL

  UNION ALL

  -- active guest binding whose guest user is missing server_game_state
  SELECT 'active_guest_binding_missing_state'::TEXT, COUNT(*)::BIGINT
  FROM public.device_bindings db
  LEFT JOIN public.server_game_state s ON s.user_id = db.user_id
  WHERE db.binding_type = 'active_guest'
    AND db.status = 'active'
    AND s.user_id IS NULL

  UNION ALL

  -- duplicate active bindings per device (should be 0 by partial unique index)
  SELECT 'duplicate_active_guest_binding'::TEXT, COALESCE(SUM(c - 1), 0)::BIGINT
  FROM (
    SELECT COUNT(*) - 1 AS c
    FROM public.device_bindings
    WHERE binding_type = 'active_guest' AND status = 'active'
    GROUP BY device_id
    HAVING COUNT(*) > 1
  ) dups

  UNION ALL

  -- orphan guest shell: superseded guest identity with no remaining active binding
  SELECT 'orphan_guest_shell'::TEXT, COUNT(*)::BIGINT
  FROM public.guest_identities gi
  LEFT JOIN public.device_bindings db
    ON db.user_id = gi.user_id AND db.status = 'active'
  WHERE gi.superseded_by IS NOT NULL
    AND db.id IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.audit_orphan_bindings() TO service_role;

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================
COMMENT ON TABLE public.device_bindings IS
  'Migration 073: device-to-user binding storage. Supports authenticated_association and active_guest binding_type. Partial unique index enforces one active guest per device.';

COMMENT ON INDEX public.unique_active_guest_binding_per_device IS
  'Migration 073: one active guest binding per device_id. Authenticated associations are not constrained by this index, allowing coexistence per plan §8.';

COMMENT ON FUNCTION public.audit_orphan_bindings() IS
  'Migration 073: plan §19 audit report. Returns counts of orphan/inconsistent binding-related rows.';

COMMIT;
