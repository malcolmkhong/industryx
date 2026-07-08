# IndustryaX Refactor Plan — v2 (2026-07-08)

**Updated scope:** Game tick authority, config authority split, anti-cheat hardening, admin tooling review.

**Goal:** Server owns authoritative game state and game time. Client renders. Actions validated server-side. Config is data-driven, not module-shared.

**Date:** 2026-07-08
**Status:** Phase 1+2 partial done (build action only). Phases 3–6 planned.

---

## Critical Focus (Review Before Implementation)

- Server is the only authority for `money`, `totalMoneyEarned`, `gameTick`, `buildings`, `resources`, `researchPoints`, `completedResearch`, `workers`, `transportLines`, `payouts`, `drones`, `weather`, `activeEvents`, `contracts`, `activeResearch`, `quests`, `megaProjects`.
- Client is renderer + intent dispatcher. No local mutation of game state.
- All cost/price/duration calculations: server-side.
- Config (building defs, research tree, market prices, event templates): DB → server only. Client receives pre-rendered display data via API responses.
- Anti-cheat: per-action validation + server-driven tick + admin queue + grace period. NOT 3-flag instant lock.
- Do not break: existing `/api/game/trade`, `/api/game/offline` (server-driven tick is already there), `/api/admin/*`, `gameStateValidator` HMAC/checksum, `isAccountLocked` fail-closed, RLS policies.

---

## What's Done (Phase 1+2 + 3 + 4 + 5 + 7)

| Phase | Status | Files / Commits |
|---|---|---|
| 1: Server-authoritative `build` validator + route persist | ✅ DONE | `serverEngine.ts:validateBuildAction`, `action/route.ts` |
| 2: Client `buildBuilding` applies server `correctedState` | ✅ DONE | `actions/buildings.ts`, `actionValidator.ts`, `serverActions.ts` |
| 3: Server seed `total_money_earned: 0` | ✅ DONE | `serverGameState.ts:478` |
| 4: Tick-backwards tiered validation (drift<100 → `low`, ≥100 → `critical`) | ✅ DONE | `gameStateValidator.ts:258-274` |
| 5: 409 auto-hydrate client | ✅ DONE | `CloudSyncService.ts:222-230` |
| **7: Server-authoritative tick (on-demand injection)** | ✅ **DONE** | `applyElapsedTicks.ts` (new), `action/route.ts`, `state/route.ts`, `offline/route.ts`, `heartbeat/route.ts`, `GameShell.tsx`, `useGameTickLoop.ts` — commit `8a279e5` |
| **8: Config authority split + tier centralization SSOT** | ✅ **DONE** | `tiers.ts`, `uiCatalog.ts`, `balanceConfig.ts`, `configCache.ts`, `configLoader.server.ts`, `serverConfigFetcher.ts`, `productionCalculator.ts` — commit `0cb769b` |
| **2 (JWT): Local JWT verification with JWKS cache** | ✅ **DONE** | `jwtVerify.ts`, `jwksCache.ts`, `verifyAuth.ts` — commit `5c79144` |
| **DB sync (migrations 060-068)** | ✅ **DONE** | 9 migrations applied to production — commit `4f6404e` |
| **UI/UX audit remediation** | ✅ **DONE** | 24 panels + GameShell + headers — commit `2f3d3d1` |
| **Chore (docs, tests/, deletes, .gitignore)** | ✅ **DONE** | `.rules` rewrite, 119 test files unlocked, admin/offline/data cleanup — commit `e71b8f9` |

**Test count:** 65 → 84 (+6 server-authoritative build, +5 tick-backwards tier, +8 applyElapsedTicks, +7 jwtVerify). Lint clean. 0 uncommitted files. All 6 commits pushed to `origin/main` (7cb4b4a..e71b8f9). DB in sync (81 migrations).

---

## Phase 6 — Remaining Action Server-Authoritization

**Status:** 🔄 **READY TO START** — all pre-conditions met (Phase 7 done, Phase 8 done, market state verified in `full_state`).

**Goal:** Apply the same pattern as `build` to the remaining 11 actions.

**Pattern (proven on `build`):**
1. Server validator returns `{ valid, error?, correctedState? }` with authoritative post-action state.
2. Route handler persists `correctedState` atomically via `saveServerGameStateOptimistic`.
3. Client wrapper surfaces `correctedState`; mutation is `set(serverState)`, never local-cost.

| Action | File | Effort |
|---|---|---|
| `upgradeBuilding` | `actions/buildings.ts:upgradeBuilding` | S (mirror build) |
| `sellResource` | `actions/market.ts:sellResource` | M (server-side price from `serverMarket` snapshot in full_state) |
| `buyResource` | `actions/market.ts:buyResource` | M |
| `startResearch` | `actions/research.ts` | M |
| `hireWorker` | `actions/workers.ts:hireWorker` | S |
| `assignWorker` | `actions/workers.ts:assignWorker` | S |
| `sendDrone` (start mission) | `actions/drones.ts:sendDrone` | M |
| `collectDrone` | `actions/drones.ts:collectDrone` | M (server computes payout, fuel efficiency) |
| `collectPayout` | `actions/payouts.ts:collectPayout` | S |
| `claimQuestReward` | `actions/quests.ts:claimQuestReward` | S |
| `fulfillContract` | `actions/contracts.ts:fulfillContract` | S |
| `claimDailyReward` | `actions/dailyRewards.ts:claimDailyReward` | S |
| `upgradeStorage` | `actions/storage.ts:upgradeStorage` | S |
| `buildTransportLine` / `upgradeTransportLine` | `actions/transport.ts` | M |
| `toggleBuilding` | `actions/buildings.ts:toggleBuilding` | XS (boolean flip, no money) |
| `doPrestige` | `actions/prestige.ts:doPrestige` | M (resets state, computes score, awards corp points — high-risk target) |

**Skip** (already server-driven or trivial): `set_game_speed` (own persist path), `paused` (UI toggle), game tick itself (Phase 7).

**Pre-conditions (now all met):**
- ✅ Phase 7 (tick injection) shipped. Actions see current gameTick/resources.
- ✅ Phase 8 (config split) shipped. Validators receive explicit `GameConfig` parameter.
- ⏳ Market state persistence: verify `full_state.serverMarket` is updated on every market tick. (TODO before starting `sell`/`buy`.)

**Test:** Unit test per action mirroring `tests/unit/serverAuthoritativeBuild.test.ts`. Critical cases:
- Affordability check uses **scaled cost** (currentCount exponent), not base cost.
- Mega-project bonuses applied server-side.
- `totalMoneyEarned` only incremented on income paths (sell, payout, contract, quest reward), not spend paths (build, upgrade, hire).
- After-action atomic persist verified (state_version bump + correctedState in DB).
- Corrected state rejected by client if money/buildings diff from expected (defense in depth).

---

## Phase 7 — Game Tick Authority (Server-Driven, On-Demand)

**Status:** ✅ **DONE** (commit `8a279e5`).

**What was delivered:**
- New `src/lib/auth/applyElapsedTicks.ts`: Postgres `now_iso()` RPC → `elapsed_seconds → floor(seconds × game_speed)` → capped at `MAX_TICK_RATE_PER_SECOND=50`. Fail-closed on RPC/config error.
- `POST /api/game/action` injects ticks BEFORE action validation. `POST /api/game/offline`, `POST /api/game/heartbeat`, `POST /api/game/state` use server timestamp from `now_iso()`.
- `gameStateValidator.ts`: tick-backwards tiered (drift<100=low, drift≥100=critical).
- Client: `useGameTickLoop` is now UI display only (no `gameTickAction` call). `GameShell` removed the call + 5 dead selectors.
- New `instrumentation.ts`: pre-warm config cache at Next.js boot. New `src/proxy.ts` (Next.js 16 middleware convention).
- `configLoader.server.ts` + `serverConfigFetcher.ts`: server-side game config loading (Phase 8 prerequisite).

**Why on-demand (not SSE/WebSocket):** 500 SSE connections = 86GB/day, exceeds free tier (2GB/mo). On-demand ticks via existing save + action endpoints = ~20GB/mo. See `docs/REFACTOR_SERVER_AUTHORITATIVE_ACTIONS.md` git history for the full bandwidth math.

**What stays the same:**
- `gameTickAction()` still exported (no callers; kept for tests + future "simulate offline" UI).
- `runServerTicks()` server-side helper unchanged.
- Client display tick (1Hz) preserved for animation continuity.

**Anti-cheat improvement:**
- Before: client mutated state, server validated every 2 min. Window: ~2 min × N ticks.
- After: server injects ticks before every action validation. Cheater must persist through server path to see effect.

**Verification:**
- 84/84 vitest passing (8 new applyElapsedTicks, 5 tick-backwards tier).
- `tsc --noEmit` clean.
- DB `now_iso()` RPC exists (migration `20260615091957`), reused.
- `server_game_state.last_tick_at` column exists (migration `004`), reused.

**Out-of-scope (deferred to later phases):**
- Client drift sync endpoint `/api/game/server-time` — not needed; client uses `performance.now()` for animation only.
- Per-second global tick — game logic is per-action; UI animation is per-second. Two independent clocks, one source of truth (DB).

**Full design doc:** see `docs/REFACTOR_SERVER_AUTHORITATIVE_ACTIONS.md` git history (commit prior to `8a279e5` for the original 7.1–7.9 design notes).

---


## Phase 8 — Config Authority Split

**Status:** ✅ **DONE** (commits `0cb769b`, `8a279e5` for `configLoader.server.ts`).

**What was delivered:**
- New `src/lib/game/tiers.ts`: SSOT for `TIER_INFO`, `MAX_TIER`, `ALL_TIERS`, `getTierColor`, `getTierInfo`, `isValidTier`. Architecture test enforces (no hardcoded tier arrays in panels).
- New `src/lib/game/uiCatalog.ts`: client-side UI metadata catalog (3,215 LOC). Decomposition candidate for next refactor.
- New `src/lib/game/configLoader.server.ts` + `src/lib/db/serverConfigFetcher.ts`: server-side config loading with 60s poller + ETag cache.
- `src/lib/game/balanceConfig.ts`: server-side balance SSOT (TRADE_COMMISSION_RATE, SLIPPAGE_*, MAX_SLIPPAGE, BUILDING_DEFS, etc.).
- `src/lib/game/configCache.ts`: 60s in-memory cache, read-only after `updateFromSupabase()` runs.
- `src/lib/game/productionCalculator.ts`: removed hardcoded constants, reads from config.
- `src/lib/game/store.ts`, `store-types.ts`, `types.ts`, `actionValidator.ts`: config-driven.

**Starting-money drift bug (8.3):** ✅ FIXED. The 3 hardcoded values (`serverGameState.ts:478`, `guestMigrationValidator.ts:50`, `initialState.ts:75`) now read from `game_config_game.starting_money` via `getStartingMoney()` helper.

**Validator signature change:** `runServerTicks(state, ticks, config)` and `validateBuildAction(state, config, ...)` now take explicit `GameConfig` parameter. No module-level globals.

**Out-of-scope (deferred):**
- Path B (atomic all-at-once) was considered and rejected in favor of Path A (incremental).
- Decomposition of `uiCatalog.ts` (3,215 LOC exceeds 2000 hard limit per `ARC-006`). Future refactor.

**Verification:**
- 17/17 balanceConfig validation tests passing.
- 6/6 tier centralization tests passing.
- 84/84 full vitest suite still passing.

---

## Phase 9 — Anti-Cheat Hardening (FIX BLOCK LOGIC)

### 9.1 — Current Lock Flow

```
flag count = 3 → auto-lock (set in `increment_cheat_flag` RPC at threshold)
```

This is too aggressive. New players with flaky networks hit 3 stale saves → locked. Real cheats get 1-shot lock (no grace).

### 9.2 — Target Industry-Standard

| Stage | Threshold | Action |
|---|---|---|
| 1 | Flag count = 1 | Log to `cheat_investigations` + admin notification. Player sees soft warning. |
| 2 | Flag count = 3 | **Send to admin review queue.** Continue allowing play but restrict high-value actions (sell, withdraw, leaderboard submit). |
| 3 | Flag count >= 5 OR admin confirms cheat | Hard lock + manual intervention. |

**Configuration:** `game_config_game.cheat_flag_lock_threshold` (default 5).

### 9.3 — Implementation

**File:** `src/lib/auth/gameStateValidator.ts`
- Change `flagCheatAttempt` to NOT auto-lock; just increment counter.
- New `maybeAutoLock(userId)` called separately after threshold check.

**File:** `supabase/migrations/<n>_cheat_grace_period.sql`
- Add column `cheat_flag_threshold integer DEFAULT 5`.
- Modify `increment_cheat_flag` RPC: increment counter, set `is_locked = true` only if `cheat_flag_count >= cheat_flag_threshold`.

**File:** `src/lib/db/cheatInvestigations.ts`
- New flag classification: `soft` (1-2 flags), `medium` (3-4), `hard` (5+).
- Admin queue at `/api/admin/investigations` already exists; verify it surfaces by stage.

**File:** `src/app/api/admin/investigations/route.ts`
- New endpoint `POST /api/admin/investigations/[id]/resolve` to dismiss vs lock.

### 9.4 — Out-of-scope Anti-Cheat Improvements

- Rate limit per game action (already exists, levels may need tuning).
- Per-tick inflation cron (already exists at `/api/cron/validate-ticks`). Verify it runs.

---

## Phase 10 — Backend Admin Tooling Review

### 10.1 — Config Editing

`/api/config/[table]` exists for admin to edit DB rows. Tables:
- `game_config_buildings`, `game_config_research`, `game_config_workers`, `game_config_resources`, etc.

**Verify:**
- All config writes go through the same path (service role + RLS bypass).
- Audit log written for every admin config change.
- Edits propagate to live server via `configLoader` re-fetch (TTL or manual invalidation).

### 10.2 — Admin-Managed Lists

- `cheat_investigations` (already exists) — extend for grace-period flow.
- `player_actions` audit log (already exists).
- `admin_actions` audit log (already exists).

### 10.3 — Config Invalidation

Server `configCache` is loaded at boot and refreshed every 5 min via `configLoader.server.ts`. Admin edits take up to 5 min to take effect.

**Improvement:** Add `/api/admin/config/invalidate` (admin-only) that calls `configCache.invalidate()` to force reload on next request.

---

## Validation Checklist (post-implementation, all phases)

1. `bunx tsc --noEmit` — clean.
2. `bun run lint` — 0 errors.
3. `bunx vitest run` — 76+ tests pass, 0 regressions.
4. Manual smoke:
   - [ ] Fresh guest signs in, no `INITIAL_GUEST_STATE_VALUES` drift between client and server.
   - [ ] Build iron mine → server cost matches DB `starting_money`-scaled formula.
   - [ ] Game tick loop runs on server (verify by stopping client tick and confirming tick advances via API call).
   - [ ] Trigger cheat flag = 1 — game continues, no lock.
   - [ ] Trigger 5 cheat flags — admin notification, not auto-lock.
   - [ ] Admin unlocks via `/api/admin/players/[id]/lock`.
5. SQL check:
   - [ ] New guests use `starting_money` from `game_config_game`.
   - [ ] Existing locked accounts stay locked until manually reviewed.

---

## Out-of-Scope / Don't Touch

- ❌ `/api/game/trade` (separate system, already robust).
- ❌ `/api/game/offline` (server-driven tick is the migration target).
- ❌ Supabase RLS policies.
- ❌ `gameStateValidator.ts` HMAC + checksum logic.
- ❌ `isAccountLocked` fail-closed logic.
- ❌ `data.ts` (already removed in Phase 5.2).
- ❌ `prisma/*` (already removed).

---

## Rollback Plan

Each phase is independent:
- Phase 6 (action auth): git revert.
- Phase 7 (tick auth): keep client tick loop fallback enabled; flip env flag.
- Phase 8 (config): configCache stays in place alongside new explicit-pass path.
- Phase 9 (cheat grace): add env flag to bypass new behavior.

---

## Architectural Decisions Log

| Decision | Why |
|---|---|
| Server owns tick + per-tick deltas | Industry-standard for server-authoritative idle MMO. Anti-cheat focus moves to action anomalies. |
| Client keeps display metadata (resource names/icons) | Pure UI; no security risk. Acceptable to query `/api/config` for display. |
| Grace period before lock (3 flags → review, 5 flags → lock) | Industry-standard. Avoids false-positive lockouts. |
| SSE vs polling for tick stream | SSE preferred (single connection); fallback to polling if SSE blocked by Caddy/proxy. |
| Pass `GameConfig` explicitly to functions instead of module-level read | Better testability, no hidden coupling. |
| Starting money single source of truth = `game_config_game.starting_money` | Operator-tunable, audited, no code redeploy to retune. |

---

## Items Marked for Next Review (Backend Architecture Notes)

- **`configCache` mutable module** — short-cut refactor. Replace with explicit `GameConfig` parameter passing once Phase 8 done.
- **Client `useGameStore`** still bundles 3500+ lines of game logic. Long-term: split into display state vs intent actions. Server becomes single writer.
- **`game_config_game.starting_money = 2000`** in DB vs `1000` hardcoded in code — drifts will continue unless 8.3 is implemented.
- **`gameStateValidator` per-save thresholds** (1.1x multiplier, 50k offset) — may produce false positives under heavy gameplay. Monitor in admin.
- **Server tick timing** — Phases 7 needs Supabase Realtime OR custom SSE OR cron polling. Realtime is recommended.

---

## Phase 11 — Blueprint System Refactor (LAST)

**Reason for last position:** Blueprint depends on (a) server-authoritative build action (Phase 1+2), (b) server-authoritative transport action (Phase 6), (c) DB-backed config (Phase 8). Doing it earlier means rewriting it twice. Doing it last means it converges on the new architecture in one pass.

**Current state (audit 2026-07-08):**

| Issue | Severity | Status |
|---|---|---|
| Buildings: round-trip OK | OK | — |
| Transport lines: saved but never loaded | MEDIUM | Bug |
| Workers: not in Blueprint interface | MEDIUM | Missing |
| Building level/efficiency: lost on load (reset to 1) | MEDIUM | Bug |
| Server validation bypassed in `loadBlueprint` | HIGH | Critical |
| Unbounded `blueprints` array growth | HIGH | Bug |
| `useGameStore` includes `blueprints` in `SERVER_FIELDS` (correct, but persistence rides on cloud sync only) | LOW | Working |
| `confirm()` use vs custom modal | LOW | Cosmetic |
| Tier-5 buildings supported via `BUILDING_DEFS` whitelist | OK | — |

### 11.1 — Server-authoritative persistence (split from game_state JSON)

**Current:** Blueprints are stored in `server_game_state.full_state.blueprints` (JSON blob). Unbounded, no DB-side queryability, can't audit, no per-blueprint permissions.

**Target:** Dedicated `blueprints` table with player FK.

**Migration `20260709_001_blueprints_table.sql`:**
```sql
CREATE TABLE blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  buildings jsonb NOT NULL,
  transport_lines jsonb NOT NULL DEFAULT '[]',
  workers jsonb NOT NULL DEFAULT '[]',
  building_levels jsonb NOT NULL DEFAULT '{}',
  is_shared boolean DEFAULT false,
  likes integer DEFAULT 0,
  saved_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT blueprints_max_per_user UNIQUE_DEFERRABLE -- enforced via trigger
);

CREATE INDEX idx_blueprints_user_id ON blueprints(user_id);
CREATE INDEX idx_blueprints_user_saved ON blueprints(user_id, saved_at DESC);

ALTER TABLE blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on blueprints" ON blueprints
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can read own blueprints" ON blueprints
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own blueprints" ON blueprints
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own blueprints" ON blueprints
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own blueprints" ON blueprints
  FOR DELETE USING (auth.uid() = user_id);
```

**Drop `blueprints` field from `server_game_state.full_state`.** Migration backfill:
```sql
INSERT INTO blueprints (user_id, name, buildings, transport_lines, saved_at)
SELECT
  user_id,
  (bp->>'name')::text,
  (bp->'buildings')::jsonb,
  (bp->'transportLines')::jsonb,
  to_timestamp((bp->>'savedAt')::bigint / 1000)
FROM server_game_state,
  jsonb_array_elements(full_state->'blueprints') as bp
WHERE full_state ? 'blueprints' AND jsonb_array_length(full_state->'blueprints') > 0;
```

**Constraint:** Add max-blueprints check via trigger:
```sql
CREATE OR REPLACE FUNCTION enforce_blueprint_limit()
RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM blueprints WHERE user_id = NEW.user_id) >= current_setting('app.max_blueprints_per_user')::int THEN
    RAISE EXCEPTION 'Blueprint limit reached for user %', NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_blueprint_limit BEFORE INSERT ON blueprints
  FOR EACH ROW EXECUTE FUNCTION enforce_blueprint_limit();
```

**Config:** Add `max_blueprints_per_user` to `game_config_game` (default 50, operator-tunable).

### 11.2 — Server endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/game/blueprint` | POST | Save current state as blueprint (server reads game_state, computes building/transport/worker counts) |
| `/api/game/blueprint/[id]` | GET | Load blueprint by id |
| `/api/game/blueprint/[id]` | PUT | Rename blueprint |
| `/api/game/blueprint/[id]` | DELETE | Delete blueprint |
| `/api/game/blueprint/load/[id]` | POST | **Apply** blueprint — server-authoritative atomic apply, like `bulk_build` action |

### 11.3 — `loadBlueprint` server-authoritative

**Current bug:** `loadBlueprint` mutates client state without calling `validateActionWithServer('build', ...)`. Even after Phase 1+2, blueprint load bypasses enforcement.

**Target:** New `/api/game/blueprint/load/[id]` endpoint takes blueprint ID, server:
1. Loads blueprint from DB (server's view of blueprint).
2. Validates each building: affordability (server uses authoritative config), unlocks (server reads `completed_research`), `MAX_BUILDINGS` cap, tier caps.
3. Computes total cost (server authoritative scaled cost).
4. Checks player can afford total.
5. If pass: atomically apply (insert buildings + transport + workers, deduct money, update stats).
6. If partial (some buildings unavailable): apply what's possible; return partial-success report.
7. Idempotency: `Idempotency-Key` header. Same key + same body → same result.
8. Rate-limit: 5 loads/min/user.

**Response shape:**
```ts
{
  ok: true,
  applied: { buildings: number; transportLines: number; workers: number },
  skipped: Array<{ type: string; reason: 'locked'|'insufficient_money'|'cap_reached'|'unknown' }>,
  newMoney: number
}
```

**Client:** Replaces `loadBlueprint` in `actions/blueprints.ts` with HTTP call. Worker schedule is lost in the current Blueprint shape (Phase 11.4 fixes that).

### 11.4 — Blueprint schema extension

**Current `Blueprint` interface:**
```ts
interface Blueprint {
  id: string;
  name: string;
  buildings: { type: BuildingType; count: number }[];
  transportLines: { type: TransportType; count: number }[];
  savedAt: number;
  shared: boolean;
  likes: number;
}
```

**Target:**
```ts
interface Blueprint {
  id: string;
  name: string;
  buildings: Array<{
    type: BuildingType;
    count: number;
    level?: number;       // NEW — preserve at-load
    active?: boolean;    // NEW
  }>;
  transportLines: { type: TransportType; count: number }[];
  workers: Array<{
    type: WorkerType;     // NEW
    count: number;
    assignedBuildingId?: string;
  }>;                    // NEW
  savedAt: number;
  shared: boolean;
  likes: number;
}
```

**Migration:** existing blueprints without `workers[]` → `workers: []` on import. Building `level` defaults to 1 on import (legacy blueprints are level-1).

### 11.5 — Client cleanup

1. **Remove `blueprints` from `SERVER_FIELDS`** in `store.ts` (DB owns them now).
2. **Remove `blueprints: []` from `createInitialState()`**.
3. **New client hook `useBlueprints(userId)`** — fetches from `/api/game/blueprint` on mount and after each action.
4. **`loadBlueprint` action** → calls `/api/game/blueprint/load/[id]`, applies server's authoritative new state.
5. **`saveBlueprint` action** → POST `/api/game/blueprint`, optimistically push to local list, reconcile on response.
6. **`importBlueprint` action** keeps current client-side parse for the code itself, but the loaded blueprint goes through the save endpoint (server validates against DB config).
7. **`BlueprintPanel`** UI uses `useBlueprints` instead of `state.blueprints`.

### 11.6 — Anti-cheat integration

- Blueprint load fires `player_actions.action_type = 'blueprint_load'` for audit.
- Failed unlock attempts (locked building) on blueprint load: NOT a cheat flag (legitimate player saving plan ahead). Only flag on repeat attempts to load deleted blueprint or after admin disables that building category.
- Blueprint sharing: `is_shared = true` exposes to `/api/community/blueprints/[id]`. Out of scope for refactor.

### 11.7 — Operational defaults (match other phases)

| Setting | DB column / config | Default |
|---|---|---|
| Max blueprints per user | `game_config_game.max_blueprints_per_user` | 50 |
| Max buildings per blueprint | `blueprint_const.max_buildings` | 500 |
| Max transport per blueprint | `blueprint_const.max_transport` | 200 |
| Load rate limit | `RATE_LIMITS.blueprintLoad` | 5/min |

### 11.8 — Test plan

1. Save blueprint with 0 buildings → success, empty list ok.
2. Save with all tier-5 buildings unlocked → round-trip ok.
3. Save at tier 0, try load at tier 5 (after unlock) → all buildings buildable.
4. Save blueprint with 1000 buildings → server reject (limit 500).
5. Save, delete, re-import same code → new id, no collision.
6. Load with insufficient money → partial, skip remaining.
7. Load with insufficient money for all → `applied: 0`, full skip list.
8. Cross-account load (try `userB` loading `userA`'s blueprint id) → RLS blocks.
9. Save 50 blueprints → 51st rejected.
10. Rename via PUT → return 200, list reflects new name.

### 11.9 — Out of scope

- Public blueprint sharing/community feed.
- Blueprint "likes".
- Blueprint versioning / branching.
- Search / filter by category.

These can come after Phase 11 ships without blocking core refactor.

### 11.10 — File impact

| File | Action |
|---|---|
| `supabase/migrations/20260709_001_blueprints_table.sql` | NEW |
| `supabase/migrations/20260709_002_migrate_blueprints_from_fulllstate.sql` | NEW |
| `src/app/api/game/blueprint/route.ts` | NEW (POST list) |
| `src/app/api/game/blueprint/[id]/route.ts` | NEW (GET/PUT/DELETE) |
| `src/app/api/game/blueprint/load/[id]/route.ts` | NEW (POST apply) |
| `src/lib/db/blueprints.ts` | NEW query helpers |
| `src/lib/game/actions/blueprints.ts` | REWRITE — server-authoritative persistence |
| `src/lib/game/types.ts` | UPDATE `Blueprint` interface (11.4 schema) |
| `src/lib/game/constants/initialState.ts` | REMOVE `blueprints: []` |
| `src/lib/game/store.ts` | REMOVE `blueprints` from `SERVER_FIELDS` |
| `src/components/game/BlueprintPanel.tsx` | REWRITE to use `useBlueprints` hook |
| `src/lib/hooks/useBlueprints.ts` | NEW |
| `src/lib/auth/rateLimiter.ts` | ADD `RATE_LIMITS.blueprintLoad` |
| `src/components/providers/GameConfigProvider.tsx` | EXPOSE `max_blueprints_per_user` config |
| `src/lib/config/tables.ts` | ADD `blueprints` table entry for admin GUI |
| `tests/api/game/blueprint.test.ts` | NEW |
| `tests/unit/blueprintServer.test.ts` | NEW |
| `tests/unit/services/blueprintService.test.ts` | DELETE (broken on main per audit 2026-07-08) |

---

## Items Marked for Next Review (Backend Architecture Notes) — UPDATED 2026-07-08

- **`configCache` mutable module** — short-cut refactor. Replace with explicit `GameConfig` parameter passing once Phase 8 done.
- **Client `useGameStore`** still bundles 3500+ lines of game logic. Long-term: split into display state vs intent actions. Server becomes single writer.
- **`game_config_game.starting_money = 2000`** in DB vs `1000` hardcoded in code — drifts will continue unless 8.3 is implemented.
- **`gameStateValidator` per-save thresholds** (1.1x multiplier, 50k offset) — may produce false positives under heavy gameplay. Monitor in admin.
- **Server tick timing** — Phases 7 implemented as on-demand tick injection (no realtime, no SSE) per the on-demand-tick doc. Per-action `ADJUST_STATE_FOR_ELAPSED_TIME` keeps the per-second global-tick feel without a server tick loop. See Phase 7 for details.
- **Blueprint transport lines + workers** — saved but never applied. Phase 11.
- **No server validation in `loadBlueprint`** — bypasses Phase 1+2 enforcement. Phase 11.
- **`useGameStore` includes `blueprints` in `SERVER_FIELDS`** — rides on cloud sync only, no DB row per blueprint. Phase 11.1.


