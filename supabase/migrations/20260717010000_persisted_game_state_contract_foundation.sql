-- Priority 4 foundation: additive metadata only.
--
-- This migration intentionally does NOT update any existing full_state JSON.
-- Historical rows remain metadata-null until an approved recovery/import
-- process classifies them. Lifecycle enforcement is introduced later.

BEGIN;

ALTER TABLE public.server_game_state
  ADD COLUMN IF NOT EXISTS payload_schema_version INTEGER,
  ADD COLUMN IF NOT EXISTS payload_lifecycle TEXT,
  ADD COLUMN IF NOT EXISTS payload_checksum TEXT;

DO $add_payload_lifecycle_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'server_game_state_payload_lifecycle_check'
      AND conrelid = 'public.server_game_state'::regclass
  ) THEN
    ALTER TABLE public.server_game_state
      ADD CONSTRAINT server_game_state_payload_lifecycle_check
      CHECK (
        payload_lifecycle IS NULL
        OR payload_lifecycle IN (
          'bootstrap_pending',
          'complete',
          'legacy_unverified',
          'recovery_required'
        )
      );
  END IF;
END
$add_payload_lifecycle_constraint$;

COMMENT ON COLUMN public.server_game_state.payload_schema_version IS
  'Version of the raw full_state payload schema. Distinct from state_version, which is CAS concurrency only.';
COMMENT ON COLUMN public.server_game_state.payload_lifecycle IS
  'bootstrap_pending, complete, legacy_unverified, or recovery_required. Nullable during controlled legacy rollout.';
COMMENT ON COLUMN public.server_game_state.payload_checksum IS
  'Server-generated HMAC of recursively canonicalized full_state for complete payloads.';

-- Existing bootstrap RPCs insert the exact sentinel payload. Tag only future
-- sentinel inserts; this does not classify or modify historical player JSON.
CREATE OR REPLACE FUNCTION public.tag_bootstrap_pending_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.full_state = jsonb_build_object('bootstrap_pending', TRUE) THEN
    NEW.payload_schema_version := NULL;
    NEW.payload_lifecycle := 'bootstrap_pending';
    NEW.payload_checksum := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_server_game_state_tag_bootstrap_pending_payload
  ON public.server_game_state;

CREATE TRIGGER trg_server_game_state_tag_bootstrap_pending_payload
  BEFORE INSERT ON public.server_game_state
  FOR EACH ROW
  EXECUTE FUNCTION public.tag_bootstrap_pending_payload();

COMMIT;
