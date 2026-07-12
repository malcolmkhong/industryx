# app/api File Migration Plan

Purpose: exact manual migration checklist for `src/app/api`.

Current scan result:

- Existing files scanned under `src/app/api`: 65
- Existing route files: 64
- Existing helper files: 1 (`src/app/api/auth/request-ip-log-helper.ts`)
- This plan file is new and is not included in the 66 scanned existing files.
- If this plan stays inside `src/app/api`, total files become 66: 65 API/helper files + 1 plan file.

## Migration Rule

First pass is a path migration only.

Meaning:

- Move whole file from old path to new path.
- Keep file name as `route.ts` unless `Rename` says otherwise.
- Let VS Code update imports on move.
- Do not split large route files yet.
- Do not delete routes yet.
- Do not create redirects/adapters until the path migration plan is accepted.
- Be aware: moving a Next.js App Router `route.ts` changes its public API URL.

## Proposed Top-Level API Domains

```text
src/app/api/
|-- API_STRUCTURE_PLAN.md              [NEW FILE]
|-- admin/                             [EXISTING]
|   |-- audit/                         [EXISTING, expanded]
|   |-- config/                        [NEW FOLDER]
|   |-- database/                      [NEW FOLDER]
|   |-- economy/                       [EXISTING, expanded]
|   |-- investigations/                [EXISTING]
|   |-- market/                        [EXISTING]
|   |-- players/                       [EXISTING]
|   |-- support/                       [EXISTING]
|   |-- system/                        [NEW FOLDER]
|   `-- users/                         [NEW FOLDER]
|-- auth/                              [EXISTING]
|   `-- _shared/                       [NEW FOLDER]
|-- game/                              [EXISTING]
|   |-- actions/                       [NEW FOLDER]
|   |-- config/                        [NEW FOLDER]
|   |-- leaderboard/                   [NEW FOLDER]
|   |-- production/                    [NEW FOLDER]
|   |-- rewards/                       [NEW FOLDER]
|   |-- session/                       [NEW FOLDER]
|   `-- state/                         [EXISTING, expanded]
|-- market/                            [EXISTING]
|   |-- history/                       [NEW FOLDER]
|   |-- news/                          [NEW FOLDER]
|   |-- pressure/                      [NEW FOLDER]
|   |-- supply/                        [NEW FOLDER]
|   `-- trades/                        [NEW FOLDER]
|-- platform/                          [NEW FOLDER]
|   |-- capacity/                      [NEW FOLDER]
|   |-- health/                        [NEW FOLDER]
|   `-- waitlist/                      [NEW FOLDER]
|-- player/                            [EXISTING]
|   `-- progress/                      [NEW FOLDER]
`-- support/                           [EXISTING]
```

## Action Refactor Addendum

After the initial 66-file path migration, the old monolithic action route was
split into thin per-action routes backed by one shared server runner.

Server action runner files:

```text
src/lib/game/actions/server/actionCommandRunner.ts
|-- handlers/
|   `-- actionHandlers.ts
`-- shared/
    |-- actionConfig.ts
    |-- actionContext.ts
    |-- actionPersistence.ts
    |-- actionTiming.ts
    `-- actionTypes.ts
```

Thin action route files:

```text
src/app/api/game/actions/
|-- assign-worker/route.ts
|-- build/route.ts
|-- buy/route.ts
|-- claim-daily-reward/route.ts
|-- claim-quest/route.ts
|-- collect-drone/route.ts
|-- collect-payout/route.ts
|-- fulfill-contract/route.ts
|-- hire-worker/route.ts
|-- legacy/route.ts
|-- prestige/route.ts
|-- research/route.ts
|-- sell/route.ts
|-- set-game-speed/route.ts
|-- start-drone-mission/route.ts
|-- toggle-building/route.ts
|-- transport/route.ts
|-- upgrade-storage/route.ts
|-- upgrade-transport-line/route.ts
|-- upgrade-worker/route.ts
`-- upgrade/route.ts
```

## Before And After File Map

Exact 66-file map. Every scanned existing API/helper file is listed.

| # | Before file | Current URL | After file | New URL | Rename |
|---:|---|---|---|---|---|
| 1 | `src/app/api/route.ts` | `/api` | deleted | deleted | Removed unused placeholder |
| 2 | `src/app/api/health/route.ts` | `/api/health` | `src/app/api/platform/health/route.ts` | `/api/platform/health` | No |
| 3 | `src/app/api/capacity/route.ts` | `/api/capacity` | `src/app/api/platform/capacity/status/route.ts` | `/api/platform/capacity/status` | No |
| 4 | `src/app/api/waitlist/route.ts` | `/api/waitlist` | `src/app/api/platform/waitlist/route.ts` | `/api/platform/waitlist` | No |
| 5 | `src/app/api/tables/route.ts` | `/api/tables` | `src/app/api/admin/database/tables/route.ts` | `/api/admin/database/tables` | No |
| 6 | `src/app/api/config/[table]/route.ts` | `/api/config/[table]` | `src/app/api/admin/config/[table]/route.ts` | `/api/admin/config/[table]` | No |
| 7 | `src/app/api/config/[table]/[id]/route.ts` | `/api/config/[table]/[id]` | `src/app/api/admin/config/[table]/[id]/route.ts` | `/api/admin/config/[table]/[id]` | No |
| 8 | `src/app/api/cron/validate-ticks/route.ts` | `/api/cron/validate-ticks` | `src/app/api/platform/cron/validate-ticks/route.ts` | `/api/platform/cron/validate-ticks` | No |
| 9 | `src/app/api/news-llm/route.ts` | `/api/news-llm` | `src/app/api/market/news/llm/route.ts` | `/api/market/news/llm` | No |
| 10 | `src/app/api/auth/request-ip-log-helper.ts` | helper only | `src/app/api/auth/_shared/request-ip-log-helper.ts` | helper only | No |
| 11 | `src/app/api/auth/callback/route.ts` | `/api/auth/callback` | `src/app/api/auth/callback/route.ts` | `/api/auth/callback` | No |
| 12 | `src/app/api/auth/confirm-link/route.ts` | `/api/auth/confirm-link` | `src/app/api/auth/identity/confirm-link/route.ts` | `/api/auth/identity/confirm-link` | No |
| 13 | `src/app/api/auth/link-identity/route.ts` | `/api/auth/link-identity` | `src/app/api/auth/identity/link/route.ts` | `/api/auth/identity/link` | No |
| 14 | `src/app/api/auth/me/route.ts` | `/api/auth/me` | `src/app/api/auth/session/me/route.ts` | `/api/auth/session/me` | No |
| 15 | `src/app/api/auth/migrate-guest/route.ts` | `/api/auth/migrate-guest` | `src/app/api/auth/guest/migrate/route.ts` | `/api/auth/guest/migrate` | No |
| 16 | `src/app/api/auth/quickstart/route.ts` | `/api/auth/quickstart` | `src/app/api/auth/guest/quickstart/route.ts` | `/api/auth/guest/quickstart` | No |
| 17 | `src/app/api/auth/register-device/route.ts` | `/api/auth/register-device` | `src/app/api/auth/device/register/route.ts` | `/api/auth/device/register` | No |
| 18 | `src/app/api/auth/update-profile/route.ts` | `/api/auth/update-profile` | `src/app/api/auth/profile/update/route.ts` | `/api/auth/profile/update` | No |
| 19 | `src/app/api/player/route.ts` | `/api/player` | `src/app/api/player/progress/route.ts` | `/api/player/progress` | No |
| 20 | `src/app/api/player/profile/route.ts` | `/api/player/profile` | `src/app/api/player/profile/route.ts` | `/api/player/profile` | No |
| 21 | `src/app/api/support/tickets/route.ts` | `/api/support/tickets` | `src/app/api/support/tickets/route.ts` | `/api/support/tickets` | No |
| 22 | `src/app/api/support/tickets/[id]/route.ts` | `/api/support/tickets/[id]` | `src/app/api/support/tickets/[id]/route.ts` | `/api/support/tickets/[id]` | No |
| 23 | `src/app/api/support/tickets/[id]/messages/route.ts` | `/api/support/tickets/[id]/messages` | `src/app/api/support/tickets/[id]/messages/route.ts` | `/api/support/tickets/[id]/messages` | No |
| 24 | `src/app/api/leaderboard/route.ts` | `/api/leaderboard` | `src/app/api/game/leaderboard/route.ts` | `/api/game/leaderboard` | No |
| 25 | `src/app/api/leaderboard/submit/route.ts` | `/api/leaderboard/submit` | `src/app/api/game/leaderboard/submit/route.ts` | `/api/game/leaderboard/submit` | No |
| 26 | `src/app/api/game/action/route.ts` | `/api/game/action` | `src/app/api/game/actions/legacy/route.ts` | `/api/game/actions/legacy` | No |
| 27 | `src/app/api/game/compute/route.ts` | `/api/game/compute` | `src/app/api/game/production/compute/route.ts` | `/api/game/production/compute` | No |
| 28 | `src/app/api/game/daily-reward/route.ts` | `/api/game/daily-reward` | `src/app/api/game/rewards/daily/route.ts` | `/api/game/rewards/daily` | No |
| 29 | `src/app/api/game/definitions/route.ts` | `/api/game/definitions` | `src/app/api/game/config/definitions/route.ts` | `/api/game/config/definitions` | No |
| 30 | `src/app/api/game/heartbeat/route.ts` | `/api/game/heartbeat` | `src/app/api/game/session/heartbeat/route.ts` | `/api/game/session/heartbeat` | No |
| 31 | `src/app/api/game/initial-state/route.ts` | `/api/game/initial-state` | `src/app/api/game/state/initial/route.ts` | `/api/game/state/initial` | No |
| 32 | `src/app/api/game/offline/route.ts` | `/api/game/offline` | `src/app/api/game/state/offline-progress/route.ts` | `/api/game/state/offline-progress` | No |
| 33 | `src/app/api/game/state/route.ts` | `/api/game/state` | `src/app/api/game/state/sync/route.ts` | `/api/game/state/sync` | No |
| 34 | `src/app/api/game/market-history/route.ts` | `/api/game/market-history` | `src/app/api/market/history/route.ts` | `/api/market/history` | No |
| 35 | `src/app/api/game/trade/route.ts` | `/api/game/trade` | `src/app/api/market/trades/execute/route.ts` | `/api/market/trades/execute` | No |
| 36 | `src/app/api/game/trades/route.ts` | `/api/game/trades` | `src/app/api/market/trades/history/route.ts` | `/api/market/trades/history` | No |
| 37 | `src/app/api/market/action/route.ts` | `/api/market/action` | `src/app/api/market/pressure/record/route.ts` | `/api/market/pressure/record` | No |
| 38 | `src/app/api/market/aggregate-supply/route.ts` | `/api/market/aggregate-supply` | `src/app/api/market/supply/aggregate/route.ts` | `/api/market/supply/aggregate` | No |
| 39 | `src/app/api/market/state/route.ts` | `/api/market/state` | `src/app/api/market/state/route.ts` | `/api/market/state` | No |
| 40 | `src/app/api/market/tick/route.ts` | `/api/market/tick` | `src/app/api/market/tick/route.ts` | `/api/market/tick` | No |
| 41 | `src/app/api/admin/actions/route.ts` | `/api/admin/actions` | `src/app/api/admin/audit/player-actions/route.ts` | `/api/admin/audit/player-actions` | No |
| 42 | `src/app/api/admin/admin-actions/route.ts` | `/api/admin/admin-actions` | `src/app/api/admin/audit/admin-actions/route.ts` | `/api/admin/audit/admin-actions` | No |
| 43 | `src/app/api/admin/audit/export/route.ts` | `/api/admin/audit/export` | `src/app/api/admin/audit/export/route.ts` | `/api/admin/audit/export` | No |
| 44 | `src/app/api/admin/admins/route.ts` | `/api/admin/admins` | `src/app/api/admin/users/admins/route.ts` | `/api/admin/users/admins` | No |
| 45 | `src/app/api/admin/admins/[id]/route.ts` | `/api/admin/admins/[id]` | `src/app/api/admin/users/admins/[id]/route.ts` | `/api/admin/users/admins/[id]` | No |
| 46 | `src/app/api/admin/admins/[id]/role/route.ts` | `/api/admin/admins/[id]/role` | `src/app/api/admin/users/admins/[id]/role/route.ts` | `/api/admin/users/admins/[id]/role` | No |
| 47 | `src/app/api/admin/permissions/[userId]/route.ts` | `/api/admin/permissions/[userId]` | `src/app/api/admin/users/permissions/[userId]/route.ts` | `/api/admin/users/permissions/[userId]` | No |
| 48 | `src/app/api/admin/economy/route.ts` | `/api/admin/economy` | `src/app/api/admin/economy/overview/route.ts` | `/api/admin/economy/overview` | No |
| 49 | `src/app/api/admin/investigations/route.ts` | `/api/admin/investigations` | `src/app/api/admin/investigations/route.ts` | `/api/admin/investigations` | No |
| 50 | `src/app/api/admin/investigations/[id]/route.ts` | `/api/admin/investigations/[id]` | `src/app/api/admin/investigations/[id]/route.ts` | `/api/admin/investigations/[id]` | No |
| 51 | `src/app/api/admin/jobs/route.ts` | `/api/admin/jobs` | `src/app/api/admin/system/jobs/route.ts` | `/api/admin/system/jobs` | No |
| 52 | `src/app/api/admin/monitoring/route.ts` | `/api/admin/monitoring` | `src/app/api/admin/system/monitoring/route.ts` | `/api/admin/system/monitoring` | No |
| 53 | `src/app/api/admin/stats/route.ts` | `/api/admin/stats` | `src/app/api/admin/system/stats/route.ts` | `/api/admin/system/stats` | No |
| 54 | `src/app/api/admin/system-status/route.ts` | `/api/admin/system-status` | `src/app/api/admin/system/status/route.ts` | `/api/admin/system/status` | No |
| 55 | `src/app/api/admin/market/route.ts` | `/api/admin/market` | `src/app/api/admin/market/overview/route.ts` | `/api/admin/market/overview` | No |
| 56 | `src/app/api/admin/market/resources/route.ts` | `/api/admin/market/resources` | `src/app/api/admin/market/resources/route.ts` | `/api/admin/market/resources` | No |
| 57 | `src/app/api/admin/market/resources/[id]/route.ts` | `/api/admin/market/resources/[id]` | `src/app/api/admin/market/resources/[id]/route.ts` | `/api/admin/market/resources/[id]` | No |
| 58 | `src/app/api/admin/players/route.ts` | `/api/admin/players` | `src/app/api/admin/players/route.ts` | `/api/admin/players` | No |
| 59 | `src/app/api/admin/players/bulk/route.ts` | `/api/admin/players/bulk` | `src/app/api/admin/players/bulk/route.ts` | `/api/admin/players/bulk` | No |
| 60 | `src/app/api/admin/players/compare/route.ts` | `/api/admin/players/compare` | `src/app/api/admin/players/compare/route.ts` | `/api/admin/players/compare` | No |
| 61 | `src/app/api/admin/players/[id]/route.ts` | `/api/admin/players/[id]` | `src/app/api/admin/players/[id]/route.ts` | `/api/admin/players/[id]` | No |
| 62 | `src/app/api/admin/players/[id]/auth/route.ts` | `/api/admin/players/[id]/auth` | `src/app/api/admin/players/[id]/auth/route.ts` | `/api/admin/players/[id]/auth` | No |
| 63 | `src/app/api/admin/players/[id]/lock/route.ts` | `/api/admin/players/[id]/lock` | `src/app/api/admin/players/[id]/lock/route.ts` | `/api/admin/players/[id]/lock` | No |
| 64 | `src/app/api/admin/support/tickets/route.ts` | `/api/admin/support/tickets` | `src/app/api/admin/support/tickets/route.ts` | `/api/admin/support/tickets` | No |
| 65 | `src/app/api/admin/support/tickets/[id]/route.ts` | `/api/admin/support/tickets/[id]` | `src/app/api/admin/support/tickets/[id]/route.ts` | `/api/admin/support/tickets/[id]` | No |
| 66 | `src/app/api/admin/support/tickets/[id]/messages/route.ts` | `/api/admin/support/tickets/[id]/messages` | `src/app/api/admin/support/tickets/[id]/messages/route.ts` | `/api/admin/support/tickets/[id]/messages` | No |

## After Folder Tree With Files

This is the target tree after the manual move. It contains 66 migrated files plus this plan file if kept.

```text
src/app/api/
|-- API_STRUCTURE_PLAN.md
|-- admin/
|   |-- audit/
|   |   |-- admin-actions/route.ts
|   |   |-- export/route.ts
|   |   `-- player-actions/route.ts
|   |-- config/
|   |   |-- [table]/
|   |   |   |-- [id]/route.ts
|   |   |   `-- route.ts
|   |-- database/
|   |   `-- tables/route.ts
|   |-- economy/
|   |   `-- overview/route.ts
|   |-- investigations/
|   |   |-- [id]/route.ts
|   |   `-- route.ts
|   |-- market/
|   |   |-- overview/route.ts
|   |   `-- resources/
|   |       |-- [id]/route.ts
|   |       `-- route.ts
|   |-- players/
|   |   |-- [id]/
|   |   |   |-- auth/route.ts
|   |   |   |-- lock/route.ts
|   |   |   `-- route.ts
|   |   |-- bulk/route.ts
|   |   |-- compare/route.ts
|   |   `-- route.ts
|   |-- support/
|   |   `-- tickets/
|   |       |-- [id]/
|   |       |   |-- messages/route.ts
|   |       |   `-- route.ts
|   |       `-- route.ts
|   |-- system/
|   |   |-- jobs/route.ts
|   |   |-- monitoring/route.ts
|   |   |-- stats/route.ts
|   |   `-- status/route.ts
|   `-- users/
|       |-- admins/
|       |   |-- [id]/
|       |   |   |-- role/route.ts
|       |   |   `-- route.ts
|       |   `-- route.ts
|       `-- permissions/
|           `-- [userId]/route.ts
|-- auth/
|   |-- _shared/request-ip-log-helper.ts
|   |-- callback/route.ts
|   |-- device/register/route.ts
|   |-- guest/
|   |   |-- migrate/route.ts
|   |   `-- quickstart/route.ts
|   |-- identity/
|   |   |-- confirm-link/route.ts
|   |   `-- link/route.ts
|   |-- profile/update/route.ts
|   `-- session/me/route.ts
|-- game/
|   |-- actions/legacy/route.ts
|   |-- config/definitions/route.ts
|   |-- leaderboard/
|   |   |-- route.ts
|   |   `-- submit/route.ts
|   |-- production/compute/route.ts
|   |-- rewards/daily/route.ts
|   |-- session/heartbeat/route.ts
|   `-- state/
|       |-- initial/route.ts
|       |-- offline-progress/route.ts
|       `-- sync/route.ts
|-- market/
|   |-- history/route.ts
|   |-- news/llm/route.ts
|   |-- pressure/record/route.ts
|   |-- state/route.ts
|   |-- supply/aggregate/route.ts
|   |-- tick/route.ts
|   `-- trades/
|       |-- execute/route.ts
|       `-- history/route.ts
|-- platform/
|   |-- capacity/status/route.ts
|   |-- cron/validate-ticks/route.ts
|   |-- health/route.ts
|   `-- waitlist/route.ts
|-- player/
|   |-- profile/route.ts
|   `-- progress/route.ts
`-- support/
    `-- tickets/
        |-- [id]/
        |   |-- messages/route.ts
        |   `-- route.ts
        `-- route.ts
```

## Manual Move Order

1. Move platform routes: rows 1-4 and 8.
2. Move admin config/database routes: rows 5-7.
3. Move market news route: row 9.
4. Move auth helper/routes: rows 10-18.
5. Move player/support routes: rows 19-23.
6. Move leaderboard routes: rows 24-25.
7. Move game routes: rows 26-33.
8. Move market routes: rows 34-40.
9. Move admin routes: rows 41-66.

## Important API Contract Warning

Moving these files changes public API URLs. Before doing the real move:

- Update all client fetch callers.
- Update tests that call old endpoints.
- Decide whether temporary legacy adapters are needed for old URLs.
- Run typecheck and targeted route tests.
- Use `rg "/api/<old-path>" src tests` after every batch.

## After Manual Move, Codex Should Check

```powershell
rg --files src/app/api | Measure-Object -Line
rg "/api/game/action|/api/game/trade|/api/news-llm|/api/leaderboard|/api/capacity|/api/tables|/api/config" src tests -n
npm run typecheck
npx eslint src/app/api --cache --cache-location "$env:TEMP\\industryx-eslintcache" --format stylish
```

Expected first command if this plan remains in `src/app/api`:

```text
66
```

Expected migrated API/helper files excluding this plan:

```text
65
```
