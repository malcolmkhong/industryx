-- 078_storage_max_bulk_upgrade.sql
-- V-030 (PR-BP-3 §2.11, 2026-07-15): move `MAX_STORAGE_UPGRADE = 100` literal
-- out of `src/lib/game/production/engine/validators/storage.ts` and into
-- the server-authoritative balance config.
--
-- Background:
--   The validator capped bulk-upgrade requests at 100 levels via a
--   hardcoded constant. Tuning required a code edit + ship; no
--   data-driven knob. ARC-002 forbids hardcoded client-side game
--   balance values; the audit flagged this under §5.5
--   (literal removal) and §5.8 (resource-loss risks).
--
-- Fix:
--   Add `maxBulkUpgradeLevels` to the existing `storage` row of
--   `game_config_balance`. Preserves the legacy literal exactly so
--   the first server boot after deploy is a no-op.
--
-- Idempotent: `jsonb_set` keyed on top-level `maxBulkUpgradeLevels`.

BEGIN;

UPDATE game_config_balance
   SET value = jsonb_set(
         value,
         '{maxBulkUpgradeLevels}',
         '100'::jsonb,
         true
       ),
       updated_at = now()
 WHERE key = 'storage'
   AND NOT (value ? 'maxBulkUpgradeLevels');

COMMIT;
