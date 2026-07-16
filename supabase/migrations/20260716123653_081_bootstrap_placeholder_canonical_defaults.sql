-- ============================================================================
-- Migration: 081_bootstrap_placeholder_canonical_defaults
-- Description: BUG-093 — when a bootstrap RPC inserts a placeholder row
--              (full_state = {"bootstrap_pending": true}) into
--              server_game_state, populate the denormalized columns from
--              game_config_game.starting_money (and related defaults)
--              instead of hardcoding 0. Without this, the read-side hydration
--              in `buildCompleteFullStateForServerRow` trusted
--              row.money = 0 over canonical.money = 2000 and shipped a
--              zero-money ServerGameData to the client.
--
--              Two layers of fix:
--              1) BEFORE INSERT trigger on server_game_state: any future
--                 placeholder row (full_state->>bootstrap_pending = true) gets
--                 denormalized columns set from game_config_game. Trigger-only
--                 so it applies uniformly to every RPC and future writers.
--              2) Backfill UPDATE: repopulate denormalized columns on the
--                 existing 18 placeholder rows (verified 2026-07-16) so the
--                 read-side fix isn't required for them.
--
-- Bug:        BUG-093
-- ============================================================================

-- ── 1. Trigger function ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bootstrap_placeholder_canonical_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_starting_money NUMERIC;
  v_base_payout_interval INT;
BEGIN
  -- Only fire on placeholder rows. Skip every other insert path.
  IF NEW.full_state IS NULL
     OR (NEW.full_state->>'bootstrap_pending')::boolean IS DISTINCT FROM TRUE
  THEN
    RETURN NEW;
  END IF;

  -- Pull canonical defaults from the global config row.
  SELECT starting_money::numeric,
         base_payout_interval::int
    INTO v_starting_money,
         v_base_payout_interval
    FROM public.game_config_game
   WHERE id = 'global';

  IF NOT FOUND THEN
    v_starting_money := 2000;
    v_base_payout_interval := 100;
  END IF;

  NEW.money               := v_starting_money;
  NEW.total_money_earned  := 0;
  NEW.research_points     := 0;
  NEW.game_tick           := 0;
  NEW.game_speed          := 1;
  NEW.state_version       := 1;
  NEW.state_hash          := COALESCE(NULLIF(NEW.state_hash, ''), 'placeholder');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bootstrap_placeholder_canonical_defaults
  ON public.server_game_state;

CREATE TRIGGER bootstrap_placeholder_canonical_defaults
  BEFORE INSERT ON public.server_game_state
  FOR EACH ROW
  WHEN ((NEW.full_state->>'bootstrap_pending')::boolean = true)
  EXECUTE FUNCTION public.bootstrap_placeholder_canonical_defaults();

-- ── 2. Backfill existing placeholder rows ──────────────────────────────
UPDATE public.server_game_state sgs
   SET money              = gcg.starting_money::numeric,
       total_money_earned = 0,
       research_points    = 0,
       game_tick          = 0,
       game_speed         = 1,
       state_version      = 1,
       state_hash         = COALESCE(NULLIF(sgs.state_hash, ''), 'placeholder')
  FROM public.game_config_game gcg
 WHERE gcg.id = 'global'
   AND sgs.full_state IS NOT NULL
   AND (sgs.full_state->>'bootstrap_pending')::boolean = true;
