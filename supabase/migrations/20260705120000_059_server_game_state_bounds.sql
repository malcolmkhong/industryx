-- Migration 059: defense-in-depth bounds on server_game_state
--
-- The route handler in /api/game/state/route.ts already validates money /
-- research_points / resources / buildings via gameStateValidator.ts. This
-- migration adds DB-level CHECK constraints as a last line of defense
-- against future code regressions that might bypass validation.
--
-- The upper bounds here match GAME_LIMITS in src/lib/auth/gameStateValidator.ts:
--   MAX_MONEY            = 1e12  (1 trillion)
--   MAX_RESOURCE_AMOUNT  = 1e9   (1 billion per resource)
--   MAX_RESEARCH_POINTS  = 1e9   (already lower-bounded in 005)
--   MAX_BUILDINGS        = 500   (already enforced on buildings_count)
--
-- We DO NOT add a CHECK on the JSONB columns (buildings, resources, full_state)
-- because Postgres CHECK cannot inspect JSONB content without an IMMUTABLE
-- function. Application-layer validation stays responsible for those; this
-- migration only hardens the numeric columns.

-- Money: upper bound. Lower bound already enforced by existing 005 constraint.
ALTER TABLE public.server_game_state
  DROP CONSTRAINT IF EXISTS server_game_state_money_upper_check;

ALTER TABLE public.server_game_state
  ADD CONSTRAINT server_game_state_money_upper_check
  CHECK (money <= 1e12);

-- Research points: upper bound (matches GAME_LIMITS.MAX_RESEARCH_POINTS).
-- Lower bound already enforced by existing constraint.
ALTER TABLE public.server_game_state
  DROP CONSTRAINT IF EXISTS server_game_state_research_points_upper_check;

ALTER TABLE public.server_game_state
  ADD CONSTRAINT server_game_state_research_points_upper_check
  CHECK (research_points <= 1e9);

-- Total money earned: upper bound.
ALTER TABLE public.server_game_state
  DROP CONSTRAINT IF EXISTS server_game_state_total_money_earned_upper_check;

ALTER TABLE public.server_game_state
  ADD CONSTRAINT server_game_state_total_money_earned_upper_check
  CHECK (total_money_earned <= 1e15);
