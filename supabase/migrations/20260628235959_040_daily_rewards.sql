-- Migration 040: Daily Rewards table
-- Server-authoritative daily reward tracking.
-- Each row records one claim per user per UTC day.

CREATE TABLE IF NOT EXISTS daily_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  day_of_streak integer NOT NULL DEFAULT 1,
  reward_day integer NOT NULL CHECK (reward_day BETWEEN 1 AND 7),
  reward_type text NOT NULL,
  reward_amount numeric NOT NULL DEFAULT 0,
  reward_resource text,
  streak_multiplier numeric NOT NULL DEFAULT 1,
  total_streak integer NOT NULL DEFAULT 1,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast "last claim" lookup
CREATE INDEX IF NOT EXISTS idx_daily_rewards_user_date ON daily_rewards(user_id, claim_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_rewards_user_streak ON daily_rewards(user_id, claimed_at DESC);

-- Enable RLS
ALTER TABLE daily_rewards ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (API route uses service role)
CREATE POLICY "Service role full access"
  ON daily_rewards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can read their own rows
CREATE POLICY "Users read own daily rewards"
  ON daily_rewards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Track streak state per user
CREATE TABLE IF NOT EXISTS user_streaks (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak integer NOT NULL DEFAULT 0,
  longest_streak integer NOT NULL DEFAULT 0,
  total_logins integer NOT NULL DEFAULT 0,
  last_claim_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access streaks"
  ON user_streaks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Upsert function for user_streaks
CREATE OR REPLACE FUNCTION upsert_user_streak(
  p_user_id uuid,
  p_current_streak integer,
  p_longest_streak integer,
  p_total_logins integer,
  p_last_claim_date date
) RETURNS user_streaks
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result user_streaks;
BEGIN
  INSERT INTO user_streaks (user_id, current_streak, longest_streak, total_logins, last_claim_date)
  VALUES (p_user_id, p_current_streak, p_longest_streak, p_total_logins, p_last_claim_date)
  ON CONFLICT (user_id) DO UPDATE SET
    current_streak = p_current_streak,
    longest_streak = GREATEST(user_streaks.longest_streak, p_longest_streak),
    total_logins = p_total_logins,
    last_claim_date = p_last_claim_date,
    updated_at = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$;
