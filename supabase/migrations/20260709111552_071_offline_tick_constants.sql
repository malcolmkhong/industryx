-- ============================================================================
-- Offline-tick tuning constants: server-driven, fail-closed
-- ============================================================================
-- Moves three game-pacing constants out of hardcoded values in
-- src/app/api/game/offline/route.ts into the game_config_game table so
-- operators can tune offline progression without a code deploy.
--
-- Per RULES.md [ARC-002]: "All game-tuning values ... MUST come from
-- Supabase at runtime. Hardcoded client-side values for these are
-- forbidden."
--
-- Per RULES.md [SEC-002]: "If authentication, account lock check, or
-- database read fails, the operation MUST be denied. Returning
-- permissive defaults on error is a security hole." The route code
-- reads these columns with NO code-level fallback; if any value is
-- missing, NaN, or out of range, loadFullConfig() returns null and
-- the POST handler responds 503.
--
-- Per RULES.md [DB-006]: "Fields with natural bounds MUST have CHECK
-- constraints in the DB as the last line of defense." All three columns
-- have explicit CHECK constraints.
-- ============================================================================

ALTER TABLE public.game_config_game
  ADD COLUMN IF NOT EXISTS tick_interval_ms integer NOT NULL DEFAULT 1000
    CHECK (tick_interval_ms > 0 AND tick_interval_ms <= 60000),
  ADD COLUMN IF NOT EXISTS max_offline_ticks integer NOT NULL DEFAULT 86400
    CHECK (max_offline_ticks > 0 AND max_offline_ticks <= 604800),
  ADD COLUMN IF NOT EXISTS min_offline_ms integer NOT NULL DEFAULT 60000
    CHECK (min_offline_ms >= 0 AND min_offline_ms <= 3600000);

COMMENT ON COLUMN public.game_config_game.tick_interval_ms IS
  'Real-world milliseconds per game tick at 1x speed. Default 1000 = 1 tick/sec.';
COMMENT ON COLUMN public.game_config_game.max_offline_ticks IS
  'Hard cap on offline tick computation to bound server work. Default 86400 = 24h of 1x ticks.';
COMMENT ON COLUMN public.game_config_game.min_offline_ms IS
  'Minimum offline duration (ms) before offline rewards are computed. Anti-spam floor. Default 60000 = 1 minute.';
