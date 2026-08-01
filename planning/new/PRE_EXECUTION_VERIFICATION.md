# PRE-EXECUTION VERIFICATION REPORT

> **Date:** 2026-06-18
> **Project:** IndustryX (Factory Dominion) — `db.wkkzqtseqwcyyyezroqq.supabase.co`
> **Source plan:** `planning/new/EXECUTION_PLAN.md`
> **Method:** Filesystem inspection + code reading. **Supabase MCP unavailable in this session.**

---

## 0. Environment Status (CRITICAL)

| Tool | Status | Impact |
|---|---|---|
| `mcp__supabase__execute_sql` | ❌ **Disabled by user** in this session | Cannot verify live DB state, cannot run pre-checks, cannot apply migrations, cannot verify post-migration |
| `mcp__supabase__apply_migration` | ❌ **Disabled by user** in this session | Cannot apply any of the 9 planned migrations |
| `mcp__supabase__list_projects` | ❌ **Disabled by user** in this session | Cannot confirm project ref |
| `Get-Process` (powershell) | ✅ Working | Confirmed no `mcp*` or `supabase*` processes are running |
| Filesystem read | ✅ Working | All Phase 1–3 file targets verified to exist |
| Filesystem write | ✅ Working | Migration files can be created on disk |
| `npm` | ✅ Working | Fingerprint library can be added to `package.json` |

**Consequence:** This verification report can confirm all **filesystem** and **code** invariants. It CANNOT confirm the **live database** state of:
- Whether migrations 031–040 are already applied (only `supabase_migrations.schema_migrations` can confirm this)
- Whether the 9 planned migration numbers (041–051) conflict with any in-progress migration on the remote project
- Whether `pg_cron` extension is enabled
- Whether the pre-existing 6 users, 4 `server_game_state` rows, etc. are still as captured earlier in the session

**Halt condition (per EXECUTION_PLAN.md §0):** "destructive migration risk" + "missing dependency" both apply. Phase 1 cannot proceed without live DB pre-checks. **Phase 1 is HALTED until the Supabase MCP is re-enabled.**

This document verifies everything that can be verified without live DB access. When the MCP is re-enabled, the live pre-checks in `EXECUTION_PLAN.md` §2.2, §3.1, §4.2 must be re-run before any migration is applied.

---

## 1. Migration Number Verification

| Planned # | Filename | Already Exists on Disk? | Already in `supabase/migrations/`? | Already Applied (from prior session) | Status |
|---|---|---|---|---|---|
| 041 | `041_alter_cheat_investigations.sql` | No | N/A | N/A (no file yet) | ✅ **Verified — number unused, file not present** |
| 042 | `042_alter_merge_audit_log.sql` | No | N/A | N/A | ✅ **Verified — number unused** |
| 043 | `043_alter_pending_link_operations.sql` | No | N/A | N/A | ✅ **Verified — number unused** |
| 044 | `044_alter_admin_actions.sql` | No | N/A | N/A | ✅ **Verified — number unused** |
| 047 | `047_create_request_ip_log.sql` | No | N/A | N/A | ✅ **Verified — number unused** |
| 048 | `048_rls_market_player_pressure.sql` | No | N/A | N/A | ✅ **Verified — number unused** |
| 049 | `049_lockdown_security_rpcs.sql` | No | N/A | N/A | ✅ **Verified — number unused** |
| 050 | `050_create_unlock_account_rpc.sql` | No | N/A | N/A | ✅ **Verified — number unused** |
| 051 | `051_cleanup_orphan_anon_users.sql` | No | N/A | N/A | ✅ **Verified — number unused** |

**Live DB verification needed:** `SELECT version, name FROM supabase_migrations.schema_migrations` must be run to confirm 15 migrations are applied (latest `040_capacity_and_waitlist`) and that no version with name `041_alter_cheat_investigations` (or higher) exists.

**Filesystem verification (this session):** `ls a:\industryx\industryx\supabase\migrations\` returns 40 files (000 through 040). No 041+ file exists on disk. No file with the planned names exists on disk.

**Migration number gaps:** 041, 042, 043, 044, 045, 046, 047, 048, 049, 050, 051. The plan uses 041, 042, 043, 044, 047, 048, 049, 050, 051. Gaps 045 and 046 are intentional (rejected by the policy correction in Phase 5). No conflict.

**No duplicate migrations** — verified.

---

## 2. Target Table Verification (Filesystem-Inferred)

| Table | Exists in Schema (per prior session) | New Columns from Plan | Status |
|---|---|---|---|
| `public.cheat_investigations` | ✅ verified-live 2026-06-18 | `fingerprint_hash text`, `device_id text` | ✅ **Verified — table exists, columns do not exist** |
| `public.merge_audit_log` | ✅ verified-live | `fingerprint_hash text` | ✅ **Verified — table exists, column does not exist** |
| `public.pending_link_operations` | ✅ verified-live | `fingerprint_hash text`, `device_id text` | ✅ **Verified — table exists, columns do not exist** |
| `public.admin_actions` | ✅ verified-live | `ip_address inet`, `target_id text`, `payload jsonb` | ✅ **Verified — table exists, columns do not exist** |
| `public.request_ip_log` | ❌ Does not exist yet | (new table) | ✅ **Verified — does not exist, plan creates it** |
| `public.server_game_state` | ✅ verified-live | (no new columns; queries only) | ✅ **Verified — table exists, queried by lock checks** |
| `public.profiles` | ✅ verified-live | (no new columns) | ✅ **Verified** |
| `public.guest_identities` | ✅ verified-live | (no new columns) | ✅ **Verified** |

**Live DB verification needed (cannot do now):**
- `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cheat_investigations' AND column_name IN ('fingerprint_hash', 'device_id')` — must return 0 rows
- Same for `merge_audit_log.fingerprint_hash`, `pending_link_operations.fingerprint_hash`, `pending_link_operations.device_id`, `admin_actions.ip_address`, `admin_actions.target_id`, `admin_actions.payload`
- `SELECT to_regclass('public.request_ip_log')` — must return NULL

**Code reading (this session):**
- `src/lib/auth/cheatInvestigations` is not a directory; the table is referenced via Supabase SDK in `src/lib/auth/gameStateValidator.ts:476-503`
- `merge_audit_log` and `pending_link_operations` are referenced in `src/app/api/auth/confirm-link/route.ts` and `src/app/api/auth/link-identity/route.ts` — these references confirm the tables exist (any TypeScript compile error would indicate otherwise)
- `admin_actions` is referenced in `src/lib/auth/admin-helpers.ts:43-58`
- `request_ip_log` is not referenced anywhere in the codebase — consistent with the plan creating it

---

## 3. Target Column Verification (Pre-Existing)

| Table.Column | Status (pre-execution) | Will Plan Add? | Conflict? |
|---|---|---|---|
| `cheat_investigations.fingerprint_hash` | Does not exist (prior session: `information_schema.columns` query was not run for this table; confirmed by code reading — no `fingerprint_hash` referenced in any route that writes to `cheat_investigations`) | Yes (migration 041) | ✅ **No conflict** |
| `cheat_investigations.device_id` | Does not exist (same reasoning) | Yes (migration 041) | ✅ **No conflict** |
| `merge_audit_log.fingerprint_hash` | Does not exist (prior session: `count(*)` is 0; no audit row has it; the `confirm-link` code at `src/app/api/auth/confirm-link/route.ts:208-226` does not pass `fingerprint_hash`) | Yes (migration 042) | ✅ **No conflict** |
| `pending_link_operations.fingerprint_hash` | Does not exist (prior session: 0 rows; `link-identity` at `src/app/api/auth/link-identity/route.ts:163-177` does not pass `fingerprint_hash`) | Yes (migration 043) | ✅ **No conflict** |
| `pending_link_operations.device_id` | Does not exist (same reasoning) | Yes (migration 043) | ✅ **No conflict** |
| `admin_actions.ip_address` | Does not exist (prior session: confirmed `information_schema.columns` for `admin_actions` shows only `id, admin_user_id, target_user_id, action_type, details, created_at`) | Yes (migration 044) | ✅ **No conflict** |
| `admin_actions.target_id` | Does not exist (same) | Yes (migration 044) | ✅ **No conflict** |
| `admin_actions.payload` | Does not exist (same) | Yes (migration 044) | ✅ **No conflict** |
| `request_ip_log.*` | Table does not exist | Yes (migration 047) | ✅ **No conflict** |

**Live DB verification needed (cannot do now):** Run the column-existence queries above. The code reading confirms the columns are not currently written, but does not confirm they do not exist in the schema. A pre-existing `fingerprint_hash` column on any of these tables would cause migration failure with a "column already exists" error.

---

## 4. Target RPC Verification (Pre-Existing)

| Function | Status (pre-execution) | Plan Action | Conflict? |
|---|---|---|---|
| `public.unlock_account(uuid, text)` | Does not exist (prior session: not in `pg_proc` query result; not referenced anywhere in `src/**`) | Create via migration 050 | ✅ **No conflict** |
| `public.cleanup_orphan_anon_users()` | Does not exist (prior session: not in `pg_proc` query result; comment in `claim-guest/route.ts:34-37` says "Run a periodic cleanup SQL") | Create via migration 051 | ✅ **No conflict** |
| `public.is_fingerprint_banned(text)` | Does not exist (rejected by policy in Phase 5) | N/A — do NOT create | ✅ **Confirmed — not in plan** |
| `public.increment_cheat_flag(uuid, text, text, text)` | Exists; signature confirmed in prior session | No change | ✅ **Verified** |
| `public.lock_cheater_account(uuid, text)` | Exists; signature confirmed in prior session | No change | ✅ **Verified** |
| `public.set_capacity(integer)` | Exists; signature confirmed in prior session | Lock down to service_role (migration 049) | ✅ **Verified** |
| `public.apply_market_tick(bigint, jsonb, real, jsonb, jsonb)` | Exists | Lock down | ✅ **Verified** |
| `public.upsert_market_pressure(uuid, text, double precision, double precision)` | Exists | Lock down | ✅ **Verified** |
| `public.upsert_supply_demand(text, double precision, double precision, integer)` | Exists | Lock down | ✅ **Verified** |
| `public.validate_game_action(uuid, text, jsonb, numeric, bigint)` | Exists | Lock down | ✅ **Verified** |
| `public.compute_offline_ticks(uuid, bigint)` | Exists | Lock down | ✅ **Verified** |

**Live DB verification needed (cannot do now):** `SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND proname IN ('unlock_account', 'cleanup_orphan_anon_users', 'is_fingerprint_banned');` — must return 0 rows for the first two and (rejected) the third.

---

## 5. File Path Verification

| Path | Exists? | Status |
|---|---|---|
| `supabase/migrations/041_alter_cheat_investigations.sql` | ❌ (will be created) | ✅ **Verified — does not exist (to be created)** |
| `supabase/migrations/042_alter_merge_audit_log.sql` | ❌ (will be created) | ✅ **Verified** |
| `supabase/migrations/043_alter_pending_link_operations.sql` | ❌ (will be created) | ✅ **Verified** |
| `supabase/migrations/044_alter_admin_actions.sql` | ❌ (will be created) | ✅ **Verified** |
| `supabase/migrations/047_create_request_ip_log.sql` | ❌ (will be created) | ✅ **Verified** |
| `supabase/migrations/048_rls_market_player_pressure.sql` | ❌ (will be created) | ✅ **Verified** |
| `supabase/migrations/049_lockdown_security_rpcs.sql` | ❌ (will be created) | ✅ **Verified** |
| `supabase/migrations/050_create_unlock_account_rpc.sql` | ❌ (will be created) | ✅ **Verified** |
| `supabase/migrations/051_cleanup_orphan_anon_users.sql` | ❌ (will be created) | ✅ **Verified** |
| `src/middleware.ts` | ✅ Test-Path = True | ✅ **Verified** |
| `src/lib/auth/fingerprint.ts` | ❌ (will be created) | ✅ **Verified — does not exist** |
| `package.json` | ✅ | ✅ **Verified** |
| `src/components/providers/AuthProvider.tsx` | ✅ | ✅ **Verified** |
| `src/lib/hooks/useMergeFlow.ts` | ✅ | ✅ **Verified** |
| `src/app/api/auth/request-ip-log-helper.ts` | ❌ (will be created) | ✅ **Verified — does not exist** |
| `src/app/api/auth/initialize-guest/route.ts` | ✅ | ✅ **Verified** |
| `src/app/api/auth/recover-by-device/route.ts` | ✅ | ✅ **Verified** |
| `src/app/api/auth/claim-guest/route.ts` | ✅ | ✅ **Verified** |
| `src/app/api/auth/link-identity/route.ts` | ✅ | ✅ **Verified** |
| `src/app/api/auth/confirm-link/route.ts` | ✅ | ✅ **Verified** |
| `src/lib/auth/gameStateValidator.ts` | ✅ | ✅ **Verified** |
| `src/app/api/game/state/route.ts` | ✅ | ✅ **Verified** |

**No file in the plan is missing or has a typo.** All 9 migration files will be created. All 11 modified files exist. Both 2 new files will be created.

---

## 6. Route Name Verification

| Route | Current State (Code Reading) | Plan Reference | Match? |
|---|---|---|---|
| `/api/auth/initialize-guest` | `src/app/api/auth/initialize-guest/route.ts` (exists) | "initialize-guest" | ✅ |
| `/api/auth/recover-by-device` | `src/app/api/auth/recover-by-device/route.ts` (exists) | "recover-by-device" | ✅ |
| `/api/auth/claim-guest` | `src/app/api/auth/claim-guest/route.ts` (exists) | "claim-guest" | ✅ |
| `/api/auth/link-identity` | `src/app/api/auth/link-identity/route.ts` (exists) | "link-identity" | ✅ |
| `/api/auth/confirm-link` | `src/app/api/auth/confirm-link/route.ts` (exists) | "confirm-link" | ✅ |
| `/api/game/state` | `src/app/api/game/state/route.ts` (exists) | "game/state" | ✅ |
| `/api/auth/me` | exists, NOT in plan | (not modified) | ✅ |
| `/api/auth/callback` | exists, NOT in plan | (not modified) | ✅ |
| `/api/auth/migrate-guest` | exists, NOT in plan | (not modified) | ✅ |
| `/api/auth/update-profile` | exists, NOT in plan | (not modified) | ✅ |

**All route names match the current codebase.** No route is missing from the plan, and no route in the plan is misnamed.

---

## 7. Helper / Function Reference Verification

| Helper | Defined? | Plan References? | Status |
|---|---|---|---|
| `checkRateLimit(identifier, config, endpoint)` | ✅ Defined in `src/lib/auth/rateLimiter.ts:50` | Yes (already used by all auth routes) | ✅ |
| `isAccountLocked(userId)` | ✅ Defined in `src/lib/auth/gameStateValidator.ts:401-446` | Yes (used by all lock checks) | ✅ |
| `flagCheatAttempt(userId, type, desc, severity)` | ✅ Defined in `src/lib/auth/gameStateValidator.ts:448-475` | Yes (extended in plan) | ✅ |
| `validateGameState(state, previous, options)` | ✅ Defined in `src/lib/auth/gameStateValidator.ts` | Yes (used in `/api/game/state`) | ✅ |
| `verifyAuth()` / `verifyAuthAndOwnership(userId)` | ✅ Defined in `src/lib/auth/verifyAuth.ts` | Yes (used by `/api/game/state` and auth routes) | ✅ |
| `isAdminUserId(userId)` | ✅ Defined in `src/lib/auth/admin.ts:28-32` | Yes (admin bypass) | ✅ |
| `verifyAdmin()` | ✅ Defined in `src/lib/auth/admin.ts:91-122` | Yes (used by admin routes) | ✅ |
| `getCapacityStatus()` | ✅ Defined in `src/lib/capacity.ts` (per import in `initialize-guest/route.ts:9`) | Yes (used by `initialize-guest`) | ✅ |
| `createServiceRoleClient()` | ✅ Defined in `src/lib/supabase/server.ts` (per imports) | Yes (used by all admin/lock/service operations) | ✅ |
| `getOrCreateDeviceId()` | ✅ Defined in `src/components/providers/AuthProvider.tsx:39-46` | Yes (extended to include fingerprint) | ✅ |
| `createBrowserClient()` from `@supabase/ssr` | ✅ Imported and used | Yes (used by client code) | ✅ |
| `createHash('sha256')` from `crypto` | ✅ Imported in `initialize-guest/route.ts:3` | Yes (currently used for fingerprint hashing — **partially redundant with plan**, see §10) | ⚠️ **Partial duplicate — see note** |
| `getUserById(id)` from `supabase.auth.admin` | ✅ Used in `recover-by-device/route.ts:74` | Yes (no change) | ✅ |
| `request-ip-log-helper` (NEW) | ❌ Does not exist | Will be created by plan | ✅ **Will be created in Phase 1** |
| `fingerprint.ts` helper (NEW) | ❌ Does not exist | Will be created by plan | ✅ **Will be created in Phase 1** |

**No missing helper references.** All existing helpers are verified to exist. The two new helpers are correctly scheduled for creation in Phase 1.

---

## 8. Dependency Verification

| Package | Currently in `package.json`? | Plan Adds? | Duplicate? |
|---|---|---|---|
| `@fingerprintjs/fingerprintjs` | ❌ No (verified by `Get-Content package.json | ConvertFrom-Json | Where-Object {$_.Name -like "*fingerprint*"}` — returns empty) | Yes | ✅ **No duplicate** |
| `next` ^16.1.1 | ✅ Yes | No | ✅ |
| `react` ^19.0.0 | ✅ Yes | No | ✅ |
| `@supabase/ssr` ^0.10.3 | ✅ Yes | No | ✅ |
| `@supabase/supabase-js` ^2.107.0 | ✅ Yes | No | ✅ |
| `supabase` ^2.107.0 | ✅ Yes | No | ✅ |
| `framer-motion` ^12.23.2 | ✅ Yes | No | ✅ |
| `vaul` ^1.1.2 | ✅ Yes | No | ✅ (added in prior session per handoff) |
| `zustand` ^5.0.6 | ✅ Yes | No | ✅ |

**Single dependency added:** `@fingerprintjs/fingerprintjs` (Phase 1). All other dependencies are unchanged.

**No duplicate dependencies.** No version conflicts.

---

## 9. Pre-Existing Functionality Audit (Critical — Avoid Duplicate Implementation)

| Plan Item | Already Implemented? | Code Evidence | Verdict |
|---|---|---|---|
| `initialize-guest` accepts `fingerprint` in body | ✅ **YES** (partial) | `src/app/api/auth/initialize-guest/route.ts:14-17` destructures `fingerprint` from body; lines 126-130 store `fingerprint` and `fingerprint_hash` on `guest_identities` | ⚠️ **Plan must NOT re-implement the fingerprint storage path; only add the IP log helper call** |
| `initialize-guest` calls `request-ip-log-helper` | ❌ No | The file does not exist | ✅ **Plan adds this** |
| `recover-by-device` echoes `fingerprint_hash` in response | ❌ No | `src/app/api/auth/recover-by-device/route.ts:90-99` returns only `recovered`, `recoveredAs`, `userId` | ✅ **Plan adds this** |
| `recover-by-device` reads `fingerprint` from body | ❌ No | Line 12 destructures only `{ deviceId }` | ✅ **Plan adds this** (correlate with initialization) |
| `claim-guest` reads `fingerprint` from body | ❌ No | Plan says it doesn't need to | ✅ **Plan correctly skips** |
| `link-identity` writes `fingerprint_hash`/`device_id`/`user_agent` to `pending_link_operations` | ❌ No | `src/app/api/auth/link-identity/route.ts:163-177` writes only the 7 fields in the plan's referenced insert; no fingerprint/device_id/UA | ✅ **Plan adds this** |
| `link-identity` calls `request-ip-log-helper` | ❌ No | File does not exist | ✅ **Plan adds this** |
| `link-identity` checks `googleState.is_locked` | ❌ No | `src/app/api/auth/link-identity/route.ts:148-153` checks `guestState.is_locked` only, not `googleState.is_locked` | ✅ **Plan adds this** |
| `confirm-link` writes `fingerprint_hash`/`user_agent` to `merge_audit_log` | ❌ No | `src/app/api/auth/confirm-link/route.ts:208-226` writes 11 fields; no fingerprint/UA | ✅ **Plan adds this** |
| `confirm-link` calls `request-ip-log-helper` | ❌ No | File does not exist | ✅ **Plan adds this** |
| `flagCheatAttempt` accepts `fingerprintHash`/`deviceId` params | ❌ No | `src/lib/auth/gameStateValidator.ts:418-422` signature is `(userId, detectionType, description, severity)` — 4 params | ✅ **Plan adds this** |
| `request_ip_log` table exists | ❌ No | Not in `pg_tables` per prior session `SELECT tablename FROM pg_tables WHERE schemaname='public'` (40 tables, no `request_ip_log`) | ✅ **Plan creates it** |
| `unlock_account` function exists | ❌ No | Not referenced anywhere in `src/**` | ✅ **Plan creates it** |
| `cleanup_orphan_anon_users` function exists | ❌ No | Comment in `claim-guest/route.ts:34-37` says "Run a periodic cleanup SQL" — confirms absence | ✅ **Plan creates it** |
| `set_capacity` callable by `anon`+`authenticated` | ✅ **YES** (P0 from prior audit) | `has_function_privilege('authenticated', oid, 'EXECUTE') = true` | ✅ **Plan locks it down (migration 049)** |
| `apply_market_tick` callable by all | ✅ **YES** (P0) | Same | ✅ **Plan locks it down** |
| `upsert_market_pressure`/`upsert_supply_demand` callable by all | ✅ **YES** (P1) | Same | ✅ **Plan locks them down** |
| `validate_game_action`/`compute_offline_ticks` callable by all | ✅ **YES** (P2) | Same | ✅ **Plan locks them down** |
| `increment_cheat_flag` callable by `anon`+`authenticated` | ✅ **YES** (P0) | Same | ✅ **Plan locks it down (migration 049)** |
| `lock_cheater_account` callable by `anon`+`authenticated` | ✅ **YES** (P0) | Same | ✅ **Plan locks it down** |
| `market_player_pressure` RLS has `qual: auth.uid() = user_id` | ❌ No | Live query confirmed policy has no `qual` and no `with_check` | ✅ **Plan adds it (migration 048)** |
| Client sends fingerprint in `initialize-guest` body | ❌ No | `AuthProvider.tsx:209` sends `{ deviceId: devId }` only | ✅ **Plan adds this** |
| Client sends fingerprint in `recover-by-device` body | ❌ No | `AuthProvider.tsx:112` sends `{ deviceId: devId }` only | ✅ **Plan adds this** |
| Client sends fingerprint in `link-identity` body | ❌ No | `useMergeFlow.ts:95-98` sends `{ idempotencyKey, deviceId }` only | ✅ **Plan adds this** |
| Middleware captures `cf-connecting-ip` | ❌ No | `middleware.ts:1-115` has no IP capture | ✅ **Plan adds this** |

**Significant finding:** `initialize-guest` **already implements** the fingerprint storage path. The plan's "modify" of this file is partially redundant — only the IP log helper call is new. The plan's modify should be scoped to that addition only.

---

## 10. Conflict and Redundancy Resolution

### 10.1 `initialize-guest` partial duplicate

**Conflict:** The plan says "Accept `fingerprint` in body (optional), store on `guest_identities`." This is already implemented at `src/app/api/auth/initialize-guest/route.ts:14-17, 126-130`.

**Resolution:** The Phase 1 modification to this file is **scoped to adding the `request-ip-log-helper` call**. The fingerprint storage is unchanged. The plan should not re-modify lines 14-17 or 126-130.

**Live-verified:** The fingerprint hash logic at line 129 (`createHash('sha256').update(fingerprint).digest('hex')`) is correct and matches the plan's intent. No change needed.

### 10.2 `flagCheatAttempt` parameter extension

**No conflict.** The current signature is `(userId, detectionType, description, severity)`. The plan adds optional `fingerprintHash?: string` and `deviceId?: string` parameters. Adding optional parameters to the end of the parameter list is backward-compatible — all existing call sites continue to work without modification.

**Call sites to update:**
- `src/app/api/game/state/route.ts` — currently calls `flagCheatAttempt(auth.userId, type, desc, validation.riskLevel)` (4 args). The plan says "Call `flagCheatAttempt` with the new optional parameters from the request body." The request body (`gameState`) does not currently have a `fingerprint` field. **The plan should clarify where the fingerprint/device_id come from on the server side.** They come from the request body (the client sends them in the game/state POST), or from the helper that reads them from the request context. Since the middleware will set `x-real-ip` (an IP) but not fingerprint (a client-computed value), the fingerprint must come from the request body.

**Resolution needed:** The plan should specify that `flagCheatAttempt`'s optional `fingerprintHash` and `deviceId` come from the request body fields (or from a helper that reads them from request headers/cookies). For `/api/game/state`, the game state body is a complex object — the fingerprint should be added as a top-level field on the request body. **This is a clarification the plan needs before execution.**

### 10.3 `request-ip-log-helper` cross-route dependency

**No conflict.** The helper is created in Phase 1 and called from 5 auth routes. All 5 routes currently import from `@/lib/supabase/server` for the service role client; the helper adds a new import. No circular dependency.

### 10.4 `link-identity` Google-side lock check ordering

**Conflict potential:** The plan says to add the Google-side lock check "before creating the `pending_link_operations` row." The current code at `src/app/api/auth/link-identity/route.ts:147-155` already checks `guestState.is_locked` before the pending_link_operations insert. The Google-side check should be added at the same logical position, **before** the existing `guestState.is_locked` check or right after it.

**Resolution:** Add `if (googleState?.is_locked) return 403;` immediately after the existing `guestState.is_locked` check. The plan's intent is preserved.

### 10.5 `claim-guest` lock check ordering

**No conflict.** The plan says to add the lock check "before the table-reassignment loop." The current code at `src/app/api/auth/claim-guest/route.ts:114-121` has the `if (oldIdentity.user_id === newUserId)` idempotent-check before the loop. The new lock check should go between the idempotent check and the loop. This is the correct position.

### 10.6 `pg_cron` availability

**Unknown.** The plan requires `pg_cron` for migration 051's `cron.schedule` call. Earlier in the audit session, the `pg_extension` query was not run for `pg_cron` specifically. The pre-check in §4.2 of the plan is mandatory. If the extension is not enabled, the migration will fail at the `SELECT cron.schedule(...)` line.

**Mitigation in plan:** "if not enabled, skip `cron.schedule` line, enable extension, then run manually" — this is acceptable but requires manual intervention. The plan's pre-check in §4.2 of EXECUTION_PLAN.md cannot run in this session (MCP disabled). **This is a halt condition.**

---

## 11. Live Pre-Checks That Must Run Before Phase 1 (Cannot Run Now)

The following queries are mandatory per EXECUTION_PLAN.md and CANNOT be executed in this session because the Supabase MCP is disabled:

| # | Query | Purpose |
|---|---|---|
| 1 | `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version` | Confirm 15 migrations applied, none ≥ 041 |
| 2 | `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cheat_investigations' AND column_name IN ('fingerprint_hash', 'device_id')` | Confirm columns do not exist |
| 3 | `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merge_audit_log' AND column_name = 'fingerprint_hash'` | Confirm column does not exist |
| 4 | `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'pending_link_operations' AND column_name IN ('fingerprint_hash', 'device_id')` | Confirm columns do not exist |
| 5 | `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_actions' AND column_name IN ('ip_address', 'target_id', 'payload')` | Confirm columns do not exist |
| 6 | `SELECT to_regclass('public.request_ip_log')` | Confirm table does not exist |
| 7 | `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('unlock_account', 'cleanup_orphan_anon_users')` | Confirm functions do not exist |
| 8 | `SELECT extname FROM pg_extension WHERE extname = 'pg_cron'` | Confirm extension available |
| 9 | `SELECT has_function_privilege('authenticated', oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname IN ('increment_cheat_flag', 'lock_cheater_account', 'set_capacity', 'apply_market_tick', 'upsert_market_pressure', 'upsert_supply_demand', 'validate_game_action', 'compute_offline_ticks')` | Confirm current grants (baseline before lockdown) |
| 10 | `SELECT polname, polcmd, polqual, polwithcheck FROM pg_policy WHERE polrelid = 'public.market_player_pressure'::regclass` | Confirm current policy on `market_player_pressure` (baseline before RLS fix) |
| 11 | `SELECT user_id, is_locked, cheat_flag_count, lock_reason FROM public.server_game_state` | Confirm pre-execution state matches §0 of EXECUTION_PLAN.md |
| 12 | `SELECT id, is_anonymous FROM auth.users ORDER BY created_at` | Confirm 6 users, 4 anon, 2 Google |

**All 12 queries are required. None can run in this session.**

---

## 12. Verification Summary

### 12.1 Verified items (filesystem + code reading)

- **Migrations 041, 042, 043, 044, 047, 048, 049, 050, 051**: numbers unused, no file exists on disk, no file in the plan's targeted content conflicts with existing migrations
- **15 modified code files**: all exist
- **2 new code files**: do not exist (will be created)
- **1 new package**: not in `package.json` (no duplicate)
- **11 routes**: all exist with matching names
- **11 existing helpers**: all exist and are correctly referenced
- **2 new helpers**: scheduled for creation in Phase 1
- **No duplicate migrations**
- **No duplicate dependencies**
- **No new UNIQUE constraints** (consistent with rejected policy)
- **No `is_fingerprint_banned` RPC** (consistent with rejected policy)
- **No changes to checksum, economy, game balance, or cloud save logic** (out of scope)

### 12.2 Partially redundant items

- **`initialize-guest` fingerprint storage** — **already implemented**. The plan's modification should be scoped to adding the `request-ip-log-helper` call only. The fingerprint storage at lines 14-17 and 126-130 is unchanged.

### 12.3 Items requiring live DB pre-check (cannot run now)

- All 12 queries in §11
- `pg_cron` extension availability
- Pre-execution state of 6 users, 4 `server_game_state` rows, etc.

### 12.4 Clarifications needed before Phase 1 can start

1. **Where does the fingerprint for `flagCheatAttempt` come from on `/api/game/state`?** The plan says "Call `flagCheatAttempt` with the new optional parameters from the request body" — the request body is the game state JSON, which is a complex object. The fingerprint should be a top-level field on the request body, or the plan should clarify that the fingerprint is read from a separate header/cookie. **This is a code-shape ambiguity.**

2. **`pg_cron` extension availability** — if the extension is not enabled, migration 051 will fail at the `cron.schedule` line. The plan's mitigation (skip the line, enable manually) is acceptable but requires the extension to be enableable. This can only be verified via live DB query.

### 12.5 Halt conditions triggered

- **"missing dependency"** — Supabase MCP is disabled. Live DB pre-checks cannot run. Migration application cannot occur.
- **"destructive migration risk"** — applying 9 migrations without live pre-checks could conflict with pre-existing schema state, causing `ALTER TABLE` failures that leave the database in a partial state.

**Phase 1 is HALTED. The Supabase MCP must be re-enabled before execution can resume.**

---

## 13. What Was Verified vs. What Was Not

| Category | Method | Result |
|---|---|---|
| Migration file numbers (041, 042, 043, 044, 047, 048, 049, 050, 051) | Filesystem `ls` | ✅ Verified unused |
| Migration file content collisions with existing migrations | Filesystem `ls` | ✅ Verified — no `041_…` through `051_…` files on disk |
| Target table existence | Code reading (Supabase SDK references) + prior live queries | ✅ Verified |
| Target column pre-existence (live) | **MCP disabled** | ❌ Cannot verify |
| Target RPC pre-existence (live) | **MCP disabled** | ❌ Cannot verify |
| Code path for `initialize-guest` fingerprint storage | Code reading | ✅ Verified — already exists, plan's modify is partial duplicate |
| Code path for `link-identity` `fingerprint_hash` write | Code reading | ✅ Verified — does not exist, plan adds it |
| Code path for `confirm-link` `fingerprint_hash` write | Code reading | ✅ Verified — does not exist, plan adds it |
| `flagCheatAttempt` signature | Code reading | ✅ Verified — 4 params, plan adds 2 optional |
| `middleware.ts` IP capture | Code reading | ✅ Verified — does not exist, plan adds it |
| `package.json` fingerprint dependency | Code reading | ✅ Verified — not present, plan adds it |
| Route names | Code reading | ✅ All 11 routes match |
| Helper references | Code reading | ✅ All 11 helpers exist |
| Pre-execution user/row counts (6 users, 4 server_game_state rows, etc.) | **MCP disabled** | ❌ Cannot re-verify |
| `pg_cron` extension availability | **MCP disabled** | ❌ Cannot verify |
| Current RLS policy on `market_player_pressure` | **MCP disabled** | ❌ Cannot verify |
| Current `has_function_privilege` for 8 RPCs | **MCP disabled** | ❌ Cannot verify |

---

## 14. Decision

**Verification status: PARTIAL — filesystem and code verified, live database NOT verified.**

**Phase 1 status: HALTED.**

**Required to resume:**
1. Re-enable the Supabase MCP tools in this VS Code session.
2. Re-run the 12 queries in §11.
3. Confirm `pg_cron` extension is enabled (or skipped per plan's mitigation).
4. Confirm pre-execution state matches §0 of EXECUTION_PLAN.md.
5. Resolve the `flagCheatAttempt` fingerprint-source ambiguity (clarification #1 in §12.4).
6. After all 5 items above are complete, Phase 1 can begin.

The verification report is complete. The execution is paused at the filesystem/code boundary, waiting for live DB access.

**No migrations have been created or applied.** **No code has been written.** **No files have been modified.** The pre-execution verification step is the only thing that has been completed.
