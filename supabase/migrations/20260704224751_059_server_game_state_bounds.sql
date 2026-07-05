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
