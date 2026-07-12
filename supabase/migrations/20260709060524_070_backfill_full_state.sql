-- Phase 12 — Initial State Server-Side (P0 data-loss fix)
-- Backfills missing keys in `server_game_state.full_state` for the
-- ~209 of 221 player rows that were inserted before the canonical-state
-- server-side helper existed.
--
-- Idempotent: COALESCE preserves any existing keys on a row. Re-runnable.
-- Does NOT bump state_hash (recomputed on next legitimate save).
--
-- Covers the visible-bug fields (resourceCapacity, drones, weather,
-- payoutConfig, stats). The other canonical fields (megaProjects, quests,
-- automationUnlocks, prestigeState.bonuses, etc.) follow via cloud-sync
-- the first time the player makes any action — that's the safe path because
-- re-serializing the JS structures into JSONB literals requires the helper.

BEGIN;

------------------------------------------------------------------
-- Build the canonical shape as CTEs.
------------------------------------------------------------------
WITH capacities AS (
  SELECT
    jsonb_object_agg(id, base_capacity) AS caps,
    jsonb_object_agg(id, 0) AS zeros
  FROM game_config_resources
),
game AS (
  SELECT
    weather_change_min_ticks AS wmin,
    weather_change_max_ticks AS wmax,
    base_payout_interval AS payout,
    initial_drone_speed_level AS ds,
    initial_drone_capacity_level AS dc,
    initial_drone_fuel_efficiency_level AS df
  FROM game_config_game
  LIMIT 1
)
UPDATE server_game_state s
SET full_state = s.full_state
  || jsonb_build_object(
    'resourceCapacity',
      COALESCE(s.full_state->'resourceCapacity', (SELECT caps FROM capacities)),
    'transportLines',
      COALESCE(s.full_state->'transportLines', '[]'::jsonb),
    'powerGrid',
      COALESCE(
        s.full_state->'powerGrid',
        jsonb_build_object(
          'totalProduction', 0,
          'totalConsumption', 0,
          'efficiency', 1,
          'overload', false,
          'plants', '[]'::jsonb
        )
      ),
    'drones',
      COALESCE(
        s.full_state->'drones',
        jsonb_build_object(
          'fleet',
            jsonb_build_array(
              jsonb_build_object(
                'id', gen_random_uuid()::text,
                'status', 'idle',
                'missionEndTick', 0,
                'missionId', NULL,
                'speedLevel', (SELECT ds FROM game),
                'capacityLevel', (SELECT dc FROM game),
                'fuelEfficiencyLevel', (SELECT df FROM game)
              )
            ),
          'completedMissions', 0,
          'totalEarned', 0
        )
      ),
    'weather',
      COALESCE(
        s.full_state->'weather',
        jsonb_build_object(
          'current', 'clear',
          'intensity', 0,
          'remaining', 0,
          'nextChange',
            (SELECT wmin FROM game)
            + floor(
                random()
                * (
                  (SELECT wmax FROM game)
                  - (SELECT wmin FROM game)
                )
              )::int
        )
      ),
    'payoutConfig',
      COALESCE(
        s.full_state->'payoutConfig',
        jsonb_build_object(
          'basePayoutInterval', (SELECT payout FROM game),
          'lastPayoutTick', 0,
          'totalPayoutsReceived', 0,
          'autoCollect', true
        )
      ),
    'stats',
      COALESCE(
        s.full_state->'stats',
        jsonb_build_object(
          'totalResourcesProduced', (SELECT zeros FROM capacities),
          'totalResourcesSold', (SELECT zeros FROM capacities),
          'peakEfficiency', 0,
          'factoriesBuilt', 0,
          'transportLinesBuilt', 0,
          'researchCompleted', 0,
          'contractsCompleted', 0,
          'playTime', 0
        )
      ),
    'storageUpgradeLevels',
      COALESCE(s.full_state->'storageUpgradeLevels', (SELECT zeros FROM capacities))
  )
WHERE
  full_state = '{}'::jsonb
  OR NOT (full_state ? 'resourceCapacity')
  OR NOT (full_state ? 'drones')
  OR NOT (full_state ? 'weather')
  OR NOT (full_state ? 'payoutConfig');

COMMIT;
