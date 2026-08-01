# Autonoma test-data — Implementation tracker

> Living checklist for the `/api/autonoma` integration. Check items as
> they ship; never mark a box green without a DB query, an HTTP call,
> or a CLI run that proves it.

## Status legend

- [x] = done and verified
- [ ] = not yet done
- [-] = genuinely blocked (named in the comment)

## 1. Endpoint

- [x] `POST /api/autonoma` mounted under `src/app/api/autonoma/route.ts`
- [x] Bridges Next.js App Router to `@autonoma-ai/sdk` `handleRequest`
- [x] Verifies `AUTONOMA_SHARED_SECRET` + `CHECKSUM_SECRET` at boot
- [x] Returns 404 in `NODE_ENV=production` (fail closed)

## 2. Auth callback

- [x] Mints a real Supabase session via GoTrue `password` grant
- [x] Returns cookie + Authorization header + credentials
- [x] Wired through the SDK's `auth` hook on `HandlerConfig`

## 3. Factories (per entity, per the planner's entity audit)

### User & identity

- [x] `profiles` (via `auth.admin.createUser` + `handle_new_user`)
- [x] `device_bindings` (per-run `id`, per-run `device_id`)
- [x] `guest_identities` (per-run `fingerprint`)
- [x] `player_sessions` (per-run `session_token`)

### Gameplay

- [x] `server_game_state` (per-run `user_id`)
- [x] `player_progress` (per-run `user_id`)
- [x] `player_actions` (per-run `id`, action counter salt)
- [x] `trade_history` (per-run `id`)
- [x] `game_config_market_history` (per-run `id`)
- [x] `market_player_pressure` (PK = `user_id,resource`)
- [x] `market_supply_demand` (PK = `resource`)
- [x] `leaderboard` (per-run `id`)
- [x] `daily_rewards` (per-run `id`)
- [x] `user_streaks` (per-run `user_id`)
- [x] `game_state_recovery_cases` (per-run `id` + `original_state_id`)
- [x] `game_state_recovery_receipts` (per-run `id` + `case_id`)

### Static config

- [x] `game_config_resources` (PK `id` text, per-run prefix)
- [x] `game_config_buildings` (PK `id` text, per-run prefix)
- [x] `game_config_research` (PK `id` text, per-run prefix)
- [x] `game_config_production_recipes` (PK `id` text, FK rewritten)
- [x] `game_config_production_chains` (PK `id` text, FK rewritten)
- [x] `game_config_automation`
- [x] `game_config_workers`
- [x] `game_config_transport`
- [x] `game_config_market` (PK `resource_id`, per-run prefix)
- [x] `game_config_prestige_bonuses`
- [x] `game_config_rank_thresholds` (PK `rank` smallint, per-run offset)
- [x] `game_config_quest_definitions`
- [x] `game_config_daily_rewards` (PK `day`, per-run offset)
- [x] `game_config_event_templates`
- [x] `game_config_seasonal_events`
- [x] `game_config_mega_projects`
- [x] `game_config_game` (per-run `id`)
- [x] `game_config_weather`
- [x] `game_config_balancing_rules`
- [x] `game_config_balance` (PK `key`, per-run suffix)

### Admin / moderation / ops

- [x] `admin_users`
- [x] `admin_permissions`
- [x] `admin_actions`
- [x] `cheat_investigations`
- [x] `support_tickets`
- [x] `support_messages`
- [x] `waitlist_entries` (unique `email` per-run)
- [x] `rate_limits` (unique `(identifier,endpoint,window_start)`)
- [x] `request_ip_log`
- [x] `fingerprint_events`
- [x] `bootstrap_telemetry`

### Auth-merge

- [x] `pending_link_operations` (per-run `idempotency_key`)
- [x] `merge_receipts` (per-run `operation_id`)
- [x] `merge_audit_log` (per-run `merge_receipt_id`)
- [x] `guest_state_archive`

### Singleton global state

- [-] `server_market_state` — singleton; second concurrent run shares
  the existing row instead of inserting. Teardown is a no-op so the
  global market isn't wiped mid-test.
- [-] `server_weather_state` — same singleton limitation as
  `server_market_state`.
- [x] `app_config` (PK `key`, per-run suffix)
- [x] `global_weather_schedule` (per-run `id`)
- [x] `global_market_event_schedule` (per-run `id`)

## 4. Teardown

- [x] Every factory returns a PK-shaped ref
- [x] Every factory has a teardown that deletes by PK
- [x] SDK runs teardowns in reverse-dependency order via topo sort
- [x] Singleton teardowns are intentional no-ops (see above)

## 5. Recipe

- [x] `C:\Users\malco\.autonoma\a-industryx-industryx\recipe.json` ships
      the full "standard" scenario
- [x] Per-entity slice recipes live alongside for incremental validation

## 6. Validation

- [x] `sdk discover` returns the Zod-derived schema
- [x] Per-entity slices pass `up` + `down` + DB row check
- [x] Full recipe passes `up` + `down` + DB row check
- [-] Two-concurrent-instances proof passes — see "Known limitations"
  below for the singleton carve-out

## 7. Ship-it

- [x] Work committed on `autonoma-integration` branch
- [x] Branch pushed to `origin/autonoma-integration`
- [x] Pull request opened against `main`
- [x] Completion marker written

## Known limitations (documented, not silently dropped)

### Singleton rows

- `server_market_state` and `server_weather_state` each have a single
  production row (PK `id = 1`). The schema forces this: two concurrent
  runs of "standard" cannot both own the singleton, so the factories
  insert with `id = 2` and **catch the unique-constraint violation**,
  falling back to a read of the existing row. The factory contract is
  therefore "ensure the singleton exists with sensible canonical
  values" rather than "own this row for the duration of the run".
  Teardown is intentionally a no-op — wiping the live global market
  mid-test would corrupt production reads.
- This means a `down` against either singleton returns `ok: true`
  without deleting the row. Per the integration spec's escape hatch,
  the limitation is documented here rather than weakening the
  constraint.

### `app_config` collision

- `app_config.key` is the unique PK and several production rows share
  schema-level keys (`maintenance_mode`, `max_capacity`, …). The
  factory salt suffixes each key with the run short id, so a real
  production key like `maintenance_mode` becomes
  `app-maintenance_mode-7f3a1b2c`. Recipes that need to read the
  production keys directly should query without the suffix.

### Guest identities partial unique

- `guest_identities` carries a partial unique index on `fingerprint
  WHERE superseded_by IS NULL`. The factory salts `fingerprint`
  with the run short id so two concurrent runs don't trip the index,
  at the cost of `fingerprint` no longer matching the user's actual
  browser fingerprint (which is fine — the test runner doesn't read
  it back).