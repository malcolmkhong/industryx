-- Migration 054: Lock guest_identities to one fingerprint per active identity.
--
-- Purpose: close multi-account loophole.
-- Currently: `fingerprint` column has only a plain B-tree index, NOT unique.
--   Result: the same device fingerprint can create N guest accounts by repeating
--   /api/auth/quickstart with the same {fingerprint, device_id} tuple.
--
-- Industry standard: One device fingerprint → one active identity.
--   If you want to switch accounts, you must:
--     1) Bind to an existing auth provider (Google/GitHub), or
--     2) Get a new device.
--
-- Idempotency strategy:
--   PARTIAL UNIQUE INDEX WHERE superseded_by IS NULL.
--   - Prevents duplicate active identities for same fingerprint.
--   - Historical/archived identities (superseded_by set) are exempt.
--   - This lets us keep audit trail of past identities without blocking rebinds.

-- ============================================================================
-- 1. PRE-FLIGHT DEDUP (no-op if no duplicates exist)
-- ============================================================================
DO $$
DECLARE
  dup_record RECORD;
BEGIN
  FOR dup_record IN
    SELECT fingerprint
    FROM guest_identities
    WHERE superseded_by IS NULL
      AND fingerprint IS NOT NULL
      AND fingerprint <> ''
      AND fingerprint <> 'unknown'
    GROUP BY fingerprint
    HAVING COUNT(*) > 1
  LOOP
    UPDATE guest_identities gi_dup
    SET
      superseded_by = (
        SELECT user_id FROM guest_identities gi_first
        WHERE gi_first.fingerprint = gi_dup.fingerprint
          AND gi_first.superseded_by IS NULL
        ORDER BY gi_first.created_at ASC
        LIMIT 1
      ),
      superseded_at = NOW(),
      is_primary = FALSE
    WHERE gi_dup.fingerprint = dup_record.fingerprint
      AND gi_dup.superseded_by IS NULL
      AND gi_dup.id <> (
        SELECT id FROM guest_identities gi_first
        WHERE gi_first.fingerprint = dup_record.fingerprint
          AND gi_first.superseded_by IS NULL
        ORDER BY gi_first.created_at ASC
        LIMIT 1
      );
  END LOOP;
END $$;

-- ============================================================================
-- 2. CREATE UNIQUE PARTIAL INDEX
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_identities_one_active_per_fingerprint
  ON public.guest_identities (fingerprint)
  WHERE superseded_by IS NULL
    AND fingerprint IS NOT NULL
    AND fingerprint <> ''
    AND fingerprint <> 'unknown';

-- ============================================================================
-- 3. RECORD MIGRATION
-- ============================================================================
COMMENT ON INDEX public.idx_guest_identities_one_active_per_fingerprint IS
  'Migration 054: enforces one active guest identity per device fingerprint. Superseded/archived identities are exempt to preserve audit trail.';

