-- 076_market_supply_state.sql
-- V-032 / PR-BP-2 (2026-07-15): Persist server-authoritative per-player
-- supply projection so /api/market/supply/aggregate can read it without
-- touching the stripped UI-only `full_state.productionSnapshot`.
--
-- Background (Phase 13):
--   `productionSnapshot` is a UI-only field. `stripUIFields` removes it
--   from `full_state` before persistence so client-only data never leaks
--   back into hydration. The aggregate cron historically read
--   `full_state.productionSnapshot`, which is therefore always undefined
--   and silently zeroed every player's contribution.
--
-- Fix:
--   Persist the slim server-pure projection (`production`,
--   `actualConsumption`, `updatedAt`) on a dedicated top-level column.
--   The column is server-authoritative data — NEVER a UI key — so it
--   must NOT appear in `SERVER_STATE_UI_FIELDS` (see
--   src/lib/db/game/serverGameStatePayload.ts). `stripUIFields` only
--   touches fields embedded inside `full_state`, so adding a new sibling
--   column needs no change to the strip list.
--
-- Writers:
--   src/lib/game/actions/server/shared/elapsedTickPersistence.ts
--     (via buildMarketSupplyProjection in snapshot/marketSupplyProjection.ts)
-- Reader:
--   src/app/api/market/supply/aggregate/route.ts
--     (via pageServerGameStateFullState in db/game/serverGameState.ts)

ALTER TABLE server_game_state
  ADD COLUMN IF NOT EXISTS market_supply JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Optional partial index: speeds up "rows updated in the last N seconds"
-- inspection; aggregate cron scans all rows so no index on the read path.
CREATE INDEX IF NOT EXISTS idx_server_game_state_market_supply_updated
  ON server_game_state ((market_supply ->> 'updatedAt'))
  WHERE market_supply <> '{}'::jsonb;

-- Defense-in-depth: zero out the new column if the column already
-- existed but a future migration strips `productionSnapshot` writes
-- again. TRUNCATE-style recovery is handled by the cron recompute.
