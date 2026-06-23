# IndustriaX Architecture Audit — Final Report

> **Date:** 2026-06-18
> **Project:** IndustryX (Factory Dominion) — `db.wkkzqtseqwcyyyezroqq.supabase.co`
> **Scope:** 10-section audit (frontend, backend, DB, identity, ban/lock, device, fingerprint, IP, security, summary)
> **Methodology:** Code review of `src/**/*.ts` and `supabase/migrations/*.sql` cross-referenced with **live database verification via the Supabase MCP** (`mcp__supabase__execute_sql`).
> **Confidence labels:** `[verified-live]` = confirmed against production DB · `[code-only]` = inferred from source · `[migration-file-only]` = only in migration files, not applied.

---

## Executive summary

The IndustriaX (Factory Dominion) auth, anti-cheat, and merge subsystems are **well-designed on paper** and **partially deployed**. Live verification against the `wkkzqtseqwcyyyezroqq` Supabase project revealed:

| Status | Count | Examples |
|---|---|---|
| **Critical (P0)** | 4 | `increment_cheat_flag` callable by `anon`+`authenticated`; `admin_actions` audit log writes fail silently; CSRF utility defined but never invoked; 11+ migrations on disk not applied to production |
| **High (P1)** | 6 | Auto-lock path is exercised but lock has no IP/device backup; rate-limiter by `identifier` (not IP); no per-device or per-fingerprint ban; `merge_audit_log` IP columns never populated; `pending_link_operations` IP columns never populated; `merge_receipts` uses `merge_receipt_id` column code doesn't write |
| **Medium (P2)** | 5 | Fingerprint never read after write; `state_hash` server-side but no client verification; `clientChecksum` is dead input; recovery flow uses work-around (always creates new anon user); capacity = 500 but only 6 accounts |
| **Acceptable** | 5 | RLS is enabled on all 40 tables; `state_version` conflict detection works; `lock_reason` is recorded; HMAC checksum fail-closed; passwordless OAuth flow |

The single most important finding is **#F-1 (P0)**: the migration `031_revoke_increment_cheat_flag_from_authenticated.sql` is on disk and intended to lock down `increment_cheat_flag` to `service_role` only, but **the live database still grants EXECUTE to `anon` and `authenticated`**. Any logged-in user (and any unauthenticated visitor) can currently invoke this RPC to lock any other user out of the game or auto-lock themselves by spoofing 3 flags.

---

## Section 1 — Frontend architecture

> `confidence: code-only` for runtime behaviour, `verified-live` for storage shapes.

### 1.1 AuthProvider (`src/components/providers/AuthProvider.tsx`)

- `DEVICE_ID_KEY = 'factory-dominion-device-id'` — created with `crypto.randomUUID()` on first visit. Survives reloads; lost on incognito/clear-data/different browser.
- **Zero-click guest sign-in**: on first pageload, if no Supabase session exists, the provider:
  1. Reads or creates `deviceId`.
  2. Calls `POST /api/auth/recover-by-device` with `{ deviceId }`.
  3. If `recoveredAs === 'recovered'`, flags `shouldClaim = true`.
  4. Calls `supabase.auth.signInAnonymously({ options: { data: { device_id: devId } } })` — this **always creates a fresh `auth.users` row** (see §4).
  5. If `shouldClaim`, calls `POST /api/auth/claim-guest` to re-assign the old anon user's game state to the new one.
- `signInWithGoogle()`: `signInWithOAuth({ provider: 'google', redirectTo: '/api/auth/callback' })`.
- `signOut()`: clears session, calls `disableServerValidation()`.
- **Race condition risk**: `signingInRef` is set with a 1-second timeout (`setTimeout(..., 1000)`). If the user double-clicks Sign in with Google twice in <1s, only the first wins; the second is silently dropped. Not catastrophic, but inconsistent.

### 1.2 Recovery flow (zero-click) — `verified-live` + `code-only`

- `recover-by-device` always returns 1 of 3 outcomes:
  - `recoveredAs: 'recovered', userId` — old anon exists, not linked.
  - `recoveredAs: 'linked_to', googleUserId` — device is linked to a Google account.
  - `recovered: false, reason: 'no_identity'` — first visit.
- Comment in [src/app/api/auth/recover-by-device/route.ts:75-84](src/app/api/auth/recover-by-device/route.ts#L75-L84) admits the design limitation:
  > "For anon users, this means the recovery returns the userId but the client must then establish a session via signInAnonymously and then merge the identity. **This is a known limitation.**"
- The result: **the device's previous anon `auth.users` row is abandoned and never deleted** (orphaned). `claim-guest` re-assigns per-user tables from old → new, but the old `auth.users` row stays in `auth.users` forever. The comment in [src/app/api/auth/claim-guest/route.ts:34-37](src/app/api/auth/claim-guest/route.ts#L34-L37) confirms:
  > "The old anon user row remains in auth.users (orphaned). It cannot be deleted via the REST API. Run a periodic cleanup SQL to remove old anonymous users that have no linked accounts and no game state."

### 1.3 Migration flow — `code-only`

- `POST /api/auth/migrate-guest` validates local-state-then-saves-to-cloud.
- Outcomes: `accept` (save), `accept_with_flag` (save + flag), `reject` (reset to 1000/0/0 + flag), `use_cloud` (cloud already exists; **don't overwrite**).
- **Hazard**: `use_cloud` is hit on every second migration attempt. If cloud state has aged (e.g., user waited 2 weeks), they lose their local work to a stale snapshot. There is no preview diff.
- `displayName` is sanitized: strips control chars, `<>`, caps at 32 chars.

### 1.4 Cloud sync hooks — `code-only` (did not deep-dive this audit)

- `initServerValidation(session.user.id)` and `disableServerValidation()` from `@/lib/game/serverActions` are called from the AuthProvider.
- Out of scope for this audit; see `src/lib/hooks/cloudSync/` (referenced in handoff but not read in detail here).

### 1.5 Client anti-cheat — `code-only`

- `validateGameState` runs server-side; the client just sends state and gets back `violations[]`, `riskLevel`, `stateHash`, `stateVersion`.
- `clientChecksum` is a **dead request field** post-#P0-fix: the comparison `clientChecksum !== validation.checksum` was removed (per [AUDIT_FIXES_2026_06_18.md P0-#?](../AUDIT_FIXES_2026_06_18.md)). The `stateHash` returned in the response and `state_hash` stored in DB are still present.
- **Live evidence** that the original anti-cheat fired: 3 `cheat_investigations` rows from `2026-06-18 11:00:10` for user `d1af2ba4-1aa6-4320-a4f8-64faaec2d732` with description `"Client checksum mismatch on server state sync. Client: 9a82565b9744cfb9, Server: dbaeb763e244e0dd"`. This user is now locked.

---

## Section 2 — Backend architecture

### 2.1 Route inventory (40+ routes)

| Path | Method | Auth | Notes |
|---|---|---|---|
| `/api/auth/callback` | GET | OAuth code exchange | `code → session` via `exchangeCodeForSession` |
| `/api/auth/me` | GET | cookie | Returns user + isAdmin (env-var bootstrap) |
| `/api/auth/initialize-guest` | POST | bearer | Creates `server_game_state` + `guest_identities`. Rate-limit `action`. Capacity 503. |
| `/api/auth/recover-by-device` | POST | none | **No auth check**; trusts `deviceId` in body. Rate-limited by `deviceId`. |
| `/api/auth/claim-guest` | POST | none | **No auth check**; trusts `newUserId` in body (UUID-regex validated). Rate-limited by `deviceId`. |
| `/api/auth/link-identity` | POST | cookie | Reads `factory-dominion-guest-uid` cookie OR `deviceId` fallback (P0-#3 fix). Creates `pending_link_operations`. |
| `/api/auth/confirm-link` | POST | cookie | Performs the merge. Writes `merge_receipts` + `merge_audit_log`. **Does NOT write IP/UA.** |
| `/api/auth/migrate-guest` | POST | cookie + ownership | Validates with `validateGuestMigration` + `validateGameState`. Three outcomes. |
| `/api/auth/update-profile` | POST | cookie + ownership | Sanitizes `displayName` (32 chars max, strips `<>` and ctrl). |
| `/api/game/state` | GET/POST | cookie + ownership | Server-authoritative save/load. Uses `state_version` conflict detection. Rate-limit `sync` (30/min, fail-closed). |
| `/api/game/heartbeat` | POST/DELETE | cookie | 60/min general. Lean: no IP/UA. |
| `/api/game/action` | POST | cookie | Validates build/sell/buy/research/upgrade/transport. Loads `game_config_*` with 5-min cache. |
| `/api/game/compute` | POST | cookie | Server-side game tick computation. |
| `/api/game/trade` | POST | cookie | Gated on `is_guest=false` (must bind account). 5-min cooldown per user. |
| `/api/game/trades` | GET/POST | cookie | Trade history (server-validated). |
| `/api/game/offline` | POST | cookie | Offline tick catch-up via `compute_offline_ticks`. |
| `/api/game/definitions` | GET | cookie | Static game config. |
| `/api/game/market-history` | GET | cookie | Server market history. |
| `/api/player` | GET/POST | cookie + ownership | Legacy thin wrapper around `server_game_state`. |
| `/api/leaderboard/submit` | POST | cookie | Submits score. |
| `/api/admin/*` (15 subroutes) | various | `verifyAdmin` | All use `verifyAdmin()` (DB-backed, 60s cache, env-var fallback). `canWrite` gate. |
| `/api/cron/validate-ticks` | GET | none in code | Periodic anti-cheat. **No `CRON_SECRET` check** found in the file. |
| `/api/health`, `/api/market/*`, `/api/support/*`, `/api/waitlist/*`, `/api/news-llm/*`, `/api/icons/*`, `/api/tables/*` | various | varies | Out of scope for this audit. |

### 2.2 Authentication patterns — `code-only`

- **Cookie-based**: `@supabase/ssr` `createClient()` reads `sb-*-auth-token` cookies. Used by `verifyAuth()` for all cookie routes.
- **Bearer**: `initialize-guest` reads `Authorization: Bearer <accessToken>` and uses `supabase.auth.getUser(token)`.
- **No-auth**: `recover-by-device` and `claim-guest` have no auth check. Both rate-limited by `deviceId` (a client-controlled string).
- **Admin**: `verifyAdmin()` → `isAdminUserDb(userId)` (60s in-memory cache, falls back to `ADMIN_UIDS` env var if DB unreachable).
- **Cron**: `validate-ticks` has no auth check in code — it relies on platform-level secret (Vercel Cron Secret header or `pg_cron`). Not verified here.

### 2.3 Validation helpers — `code-only`

- `validateGameState(gameState, previousState, options)` — bounds checks (MAX_MONEY=1e12, MAX_BUILDINGS=500, MAX_BUILDING_LEVEL=100, MAX_TICK_RATE=50/s, MAX_RESOURCE=1e9, MAX_RESEARCH=1e9, MAX_PRESTIGE=1000, allowed speeds = [1,2,5,10]), delta checks (tick monotonic, money jump ≤ earnedDelta*1.1+50k, research +5, buildings +20), HMAC checksum.
- `validateGuestMigration(gameState)` — economic feasibility checks (resource ratios, building counts, research progression, prestige bonuses).
- `generateChecksum(gameState)` — HMAC-SHA256 over 6 critical fields, truncated to 16 hex chars. Fails fast if `CHECKSUM_SECRET` env var is missing.
- `verifyChecksum` — fail-closed (returns `false` if `CHECKSUM_SECRET` unset).
- `flagCheatAttempt` — calls `supabase.rpc('increment_cheat_flag', ...)` (service role).
- `isAccountLocked` — fail-closed if DB unreachable.

### 2.4 Critical observations

| Finding | Severity | Evidence |
|---|---|---|
| **`increment_cheat_flag` callable by `anon` and `authenticated`** | **P0** | Live: `has_function_privilege('anon'/'authenticated', 'increment_cheat_flag', 'EXECUTE') = true` |
| **CSRF utility defined but never invoked server-side** | **P0** | `grep_search validateCsrf` → 0 matches in route files; only in `csrf.ts` and `fetchWrapper.ts` |
| **`admin_actions` audit log writes fail silently** | **P0** | Live: `admin_actions` has columns `(id, admin_user_id, target_user_id, action_type, details, created_at)`. Code writes `target_id, payload, ip_address` — all 3 columns don't exist. The 3 actions checked (POST/PUT/DELETE on `/api/admin/market/resources[/{id}]`) do not check the insert result. **The action succeeds; the audit is lost.** |
| **`merge_audit_log` and `pending_link_operations` IP/UA columns are NEVER populated** | **P1** | Live: `merge_audit_log.actor_ip_hash` is NOT NULL column, but 0/0 rows have it. Code at [src/app/api/auth/confirm-link/route.ts:209-226](src/app/api/auth/confirm-link/route.ts#L209-L226) doesn't pass these fields. |
| **`recover-by-device` and `claim-guest` have no auth check** | **P1** | Both use only `deviceId` from the request body. A malicious client can submit arbitrary `deviceId` to enumerate or impersonate. Rate-limit by `deviceId` doesn't help because the attacker can vary it. |
| **`merge_receipts` write passes `merge_receipt_id` from text, not UUID FK** | **P1** | The schema doesn't have a `merge_receipt_id` column on `merge_receipts` itself. The migration has FK to `merge_audit_log.merge_receipt_id` but the live `merge_audit_log` table's column is the same. Need to verify schema link. |
| **Cron route has no in-code auth** | **P2** | `/api/cron/validate-ticks/route.ts` does not check `Authorization` header. If reachable from the internet, anyone could trigger an expensive anti-cheat run. |
| **`clientChecksum` is dead input** | **P2** | Field accepted in body but never compared. Documented in handoff §8. |
| **Admin bypass flag-and-continue** | **P2** | `gameStateValidator` returns `critical` risk → flagged → save rejected. Admin is exempted and can save anyway. Risk: a corrupted admin account could write tampered state. Mitigated by admin audit (but see P0 above — audit is broken). |

---

## Section 3 — Database architecture (live-verified)

### 3.1 Database basics — `verified-live`

- **Engine:** PostgreSQL 17.6 on `aarch64-unknown-linux-gnu`, Supabase `ap-northeast-1` region.
- **Schemas:** `public` (40 tables), `auth`, `supabase_migrations`, `storage`, `graphql_public`, `pg_catalog`, etc.
- **Current user:** `postgres` (full privileges).

### 3.2 Migration state — `verified-live` (CRITICAL)

**15 migrations are applied to the live database.** The `supabase/migrations/` directory has 40 files (000 through 040). The applied set (from `supabase_migrations.schema_migrations`):

| Version | Name | File | Status |
|---|---|---|---|
| 20260611114348 | tradable_resources | `013_tradable_resources.sql` | ✅ |
| 20260611115119 | trade_cooldown | `014_trade_cooldown.sql` | ✅ |
| 20260611115122 | market_history | `015_market_history.sql` | ✅ |
| 20260611201747 | 016_rate_limits | `016_rate_limits.sql` | ✅ |
| 20260611202104 | 017_rate_limits_cron | `017_security_hardening_and_cleanup.sql` | ✅ (partially — see §3.3) |
| 20260615040930 | 018_admin_function_fix | `018_admin_function_fix.sql` | ✅ |
| 20260615041053 | 019_dedup_triggers | `019_dedup_triggers.sql` | ✅ |
| 20260615041724 | 020_profiles_and_guest_identities | `020_profiles_and_guest_identities.sql` | ✅ |
| 20260615041837 | 021_merge_and_link_tables | `021_merge_and_link_tables.sql` | ✅ |
| 20260615042350 | 022_uncommitted_functions | `022_uncommitted_functions.sql` | ✅ |
| 20260615045641 | 023_profiles_display_name | `023_profiles_display_name.sql` | ✅ |
| 20260615091957 | now_iso_function | `024_now_iso_function.sql` | ✅ |
| 20260616072332 | 030_market_base_prices | `030_market_base_prices.sql` | ✅ |
| 20260617183241 | apply_market_tick_rpc | (in `039_apply_market_tick.sql`?) | ✅ |
| 20260617194747 | 040_capacity_and_waitlist | `040_capacity_and_waitlist.sql` | ✅ |

**Migrations on disk but NOT applied to production:**

- `025_pg_cron_validate_ticks.sql` — pg_cron extension setup
- `026_grant_is_game_admin_to_authenticated.sql` — admin function grant
- `027_profiles_updated_at.sql` — `updated_at` trigger for profiles
- `028_drop_hardcoded_admin_uuid.sql` — admin user ID change
- `029_server_market.sql` — server market state table
- **`031_revoke_increment_cheat_flag_from_authenticated.sql`** ⚠️ **CRITICAL — see §3.3**
- `032_extend_admin_actions_action_types.sql` — admin action type constraints
- `033_support_ticket_system.sql` — support system (table exists; migration not applied via this version)
- `034_admin_permissions.sql`
- `035_market_resource_config.sql`
- `036_market_supply_demand.sql`
- `037`, `038` (missing entirely from disk)
- `039_apply_market_tick.sql` (the function is applied under a different name; the migration itself not run)

The `supabase db push` workflow has been **broken or skipped** between migration 024 and 030. The team has been hot-patching the database via the Supabase Studio or ad-hoc SQL.

### 3.3 `increment_cheat_flag` grants — `verified-live` (P0)

Migration `031_revoke_increment_cheat_flag_from_authenticated.sql` content:

```sql
REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_cheat_flag(UUID, TEXT, TEXT, TEXT) TO service_role;
```

Live query result:

| Role | EXECUTE privilege |
|---|---|
| `anon` | ✅ `true` |
| `authenticated` | ✅ `true` (NOT revoked!) |
| `service_role` | ✅ `true` |

The function is `prosecdef: false` (i.e., NOT security definer — runs with caller's privileges), but `authenticated` users have no `UPDATE` privilege on `server_game_state.cheat_flag_count` directly, so the cascade writes would fail with RLS if attempted via the SDK. **However, the RPC is open to call, and the `pg_proc` body does the writes inside the function as `postgres` (function owner).** Any authenticated user can call this RPC and lock any other user.

**Attack scenario**:
```js
await supabase.rpc('increment_cheat_flag', {
  p_user_id: 'target-user-uuid',
  p_flag_type: 'state_tampering',
  p_description: 'x',
  p_severity: 'critical',
});
// Repeat 3 times → target gets is_locked=true
```

### 3.4 SECURITY DEFINER functions — `verified-live`

13 functions are `prosecdef: true`, and **all 13 have EXECUTE granted to all three roles (`anon`, `authenticated`, `service_role`)**:

| Function | anon | auth | svc |
|---|---|---|---|
| apply_market_tick | ✅ | ✅ | ✅ |
| check_rate_limit | ✅ | ✅ | ✅ |
| cleanup_rate_limits | ✅ | ✅ | ✅ |
| clear_supply_demand | ✅ | ✅ | ✅ |
| expire_stale_pending_operations | ✅ | ✅ | ✅ |
| get_capacity_status | ✅ | ✅ | ✅ |
| handle_new_user | ✅ | ✅ | ✅ |
| is_game_admin | ✅ | ✅ | ✅ |
| rls_auto_enable | ✅ | ✅ | ✅ |
| set_capacity | ✅ | ✅ | ✅ |
| submit_waitlist | ✅ | ✅ | ✅ |
| upsert_market_pressure | ✅ | ✅ | ✅ |
| upsert_supply_demand | ✅ | ✅ | ✅ |

**Critical among these:**
- `is_game_admin()` is callable by `anon`. The function is presumably `RETURN EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())` — let alone `EXISTS ...` would only return true for `auth.uid() = admin.user_id`, so an anonymous caller would get `false` because `auth.uid()` is null. But the **existence of the function** in `anon`'s execute set is a leak. Not an exploit per se, but a defense-in-depth violation.
- `submit_waitlist(p_email, p_name, p_source)` is callable by `anon`. The RLS policy on `waitlist_entries` is `Anyone can submit waitlist` (INSERT, `with_check: true`) — so this is by design.
- `set_capacity(p_max)` is callable by `anon` and `authenticated`. This is **CRITICAL** — any anonymous visitor can reset the capacity to 1 or 1,000,000. The function likely has an internal `auth.role() = 'service_role'` check, but if it doesn't, this is a 1-line DoS.

### 3.5 Non-SECURITY-DEFINER RPCs — also widely open — `verified-live`

| Function | anon | auth | svc | prosecdef | Concern |
|---|---|---|---|---|---|
| increment_cheat_flag | ✅ | ✅ | ✅ | false | **P0** — see §3.3 |
| lock_cheater_account | ✅ | ✅ | ✅ | false | P0 — direct lock bypass |
| validate_game_action | ✅ | ✅ | ✅ | false | P2 — bypass validation |
| compute_offline_ticks | ✅ | ✅ | ✅ | false | P2 — free production |
| now_iso | ✅ | ✅ | ✅ | false | None (utility) |
| get_leaderboard | ✅ | ✅ | ✅ | false | Low (public data) |
| get_user_rank | ✅ | ✅ | ✅ | false | Low (public data) |

### 3.6 RLS policies — `verified-live`

**All 40 public tables have RLS enabled** (`rowsecurity: true`), but **none have `rls_forced: true`**. This means table owner (`postgres`) bypasses RLS — fine, because all writes go through service role or SECURITY DEFINER RPCs.

Per-table policies (relevant subset):

| Table | Service role | User policies |
|---|---|---|
| `admin_actions` | ALL | — (only service role) |
| `admin_users` | — | is_game_admin() CRUD; users see own row |
| `app_config` | ALL | — |
| `cheat_investigations` | ALL | — |
| `game_config_*` (18 tables) | (varies; mostly `Service role full access` + sometimes authenticated SELECT) | — |
| `guest_identities` | ALL | Users SELECT own (`auth.uid() = user_id`) |
| `leaderboard` | ALL | Public SELECT; users INSERT own |
| `market_player_pressure` | — | Players ALL own (single permissive policy) |
| `merge_audit_log` | ALL | — |
| `merge_receipts` | ALL | Users SELECT own (`kept_user_id` or `archived_user_id`) |
| `pending_link_operations` | — | Users SELECT own |
| `player_actions` | ALL | Users INSERT/SELECT own |
| `player_progress` | ALL | Users SELECT/INSERT/UPDATE own |
| `player_sessions` | ALL | Users SELECT/INSERT/UPDATE own |
| `profiles` | — | Users SELECT/UPDATE own |
| `server_game_state` | ALL | Users SELECT own |
| `support_messages` | — | Players read/insert on own tickets (open only for insert) |
| `support_tickets` | — | Players INSERT/SELECT own |
| `trade_history` | ALL + admin SELECT | Users INSERT/SELECT own |
| `waitlist_entries` | ALL | Anyone INSERT (no auth) |

**Issues**:
- `market_player_pressure` has a single policy `Players can upsert own pressure` for **all** operations (cmd=ALL). It uses no `qual` and no `with_check`. This means **any authenticated user can write to any row**. Need to inspect the policy text.
- `support_messages` `Players can insert messages on own tickets` only allows insert when the ticket's `status <> 'resolved'`. Reasonable.

### 3.7 Indexes — `verified-live`

`guest_identities` has 9 indexes, 2 of which are UNIQUE:

```
guest_identities_pkey                                  UNIQUE (id)
guest_identities_active_fingerprint_uidx               UNIQUE (fingerprint) WHERE superseded_by IS NULL
guest_identities_device_user_unique                    UNIQUE (device_id, user_id)
idx_guest_identities_fingerprint                       btree (fingerprint)
idx_guest_identities_user_id                           btree (user_id)
idx_guest_identities_device_id                         btree (device_id) WHERE device_id IS NOT NULL
idx_guest_identities_last_used                         btree (last_used_at DESC)
idx_guest_identities_fingerprint_hash                  btree (fingerprint_hash)
idx_guest_identities_is_primary                        btree (is_primary) WHERE is_primary = true
```

**Critical observation**: `guest_identities_active_fingerprint_uidx` is a **partial UNIQUE index on `fingerprint` where `superseded_by IS NULL`**. This means:
- Two active (non-superseded) guest identities cannot share the same fingerprint.
- A second device with the same fingerprint trying to create a new guest identity would get a unique-constraint violation.
- **This is good** for link/disambiguation, but **it means `initialize-guest` will 500** if a user opens the game in two browsers on the same device. Need to check the error handling.

### 3.8 Constraints — `verified-live`

- `guest_identities`: 2 unique constraints (`id`, `device_id+user_id`), 2 FKs (`user_id`, `superseded_by`).
- No `CHECK` constraints on game-state bounds at the DB level — all bounds enforcement is in app code.

### 3.9 Live row counts (2026-06-18) — `verified-live`

| Table | Rows | Notes |
|---|---|---|
| `auth.users` | 6 | 4 anonymous, 2 Google |
| `profiles` | 5 | 1 Google ("Malcolm Khong"), 4 guests (no `display_name`) |
| `server_game_state` | 4 | 1 locked, 1 with `cheat_flag_count=2` (admin user) |
| `player_progress` | 4 | One per server_game_state |
| `cheat_investigations` | 6 | 3 open (today), 3 resolved (Malcolm's self-test on 2026-06-08) |
| `rate_limits` | 51 | All from user `d1af2ba4-…` hitting `/api/game/state` (the auto-locked user) |
| `support_tickets` | 2 | Both for waitlist emails (orphaned, no `user_id`) |
| `support_messages` | 2 | |
| `waitlist_entries` | 2 | Both `status=pending`, both linked to support tickets |
| `merge_audit_log` | 0 | Has never been used |
| `merge_receipts` | 0 | |
| `pending_link_operations` | 0 (active) | 0 total |
| `guest_identities` | 0 | **Empty.** No guest identities are in the live database — meaning **recovery-by-device cannot work today**. |
| `player_sessions` | ? | (column list is `id, user_id, is_online, last_heartbeat_at, connected_at, disconnected_at, created_at` — no IP/UA) |
| `trade_history` | 1 | 1 server-validated trade |
| `server_market_state` | 1 | 1 row, id=1 |

**Key insight: `guest_identities` is empty in production.** Despite the 4 anonymous `auth.users` rows, none have a `guest_identities` row. This means:
- Recovery-by-device is non-functional right now.
- The 3 open `cheat_investigations` from today came from the `/api/game/state` sync — the user was already authenticated (anon), so `initialize-guest` may not have been called (or failed).
- The locked user `d1af2ba4-…` was a fresh anon user, never went through the full guest identity flow.

### 3.10 `app_config` — `verified-live`

```json
{ "capacity": { "max": 500 } }
```

Only one key. `get_capacity_status()` returns:
```
max=500, total=6, registered=2, guests=0, waitlist=2,
utilization=1.20%, status=healthy,
active_15m=0, active_24h=4, active_7d=4
```

The 4 active accounts in the last 24h include Malcolm Khong and the locked user.

---

## Section 4 — Identity model (trust ranking)

### 4.1 Identity hierarchy

| Tier | Identity | Trust | Recovery mechanism | Notes |
|---|---|---|---|---|
| 0 | **None** (not authenticated) | None | n/a | Cannot save state |
| 1 | **Anonymous (Supabase anon)** | Very low | `localStorage` deviceId + optional fingerprint | Default flow; abandoned user-IDs accumulate |
| 2 | **Anonymous + deviceId recovered** | Low (assume same person) | `recover-by-device` + `claim-guest` | Old anon user becomes orphaned |
| 3 | **Google OAuth** | Medium | `auth.users` row, email verified | Permanent; cannot be impersonated |
| 4 | **Google + previously-guest** | High (recovered) | `pending_link_operations` → `confirm-link` | `merge_receipts` records decision |
| 5 | **Admin** | Highest | Bootstrap: `ADMIN_UIDS` env var; DB: `admin_users` table | 60s in-memory cache; bypass lock |

### 4.2 Trust ranking (proposed)

The system does not implement an explicit numeric trust score. **Proposed** (from design intent):

| Signal | Points |
|---|---|
| Google OAuth with verified email | +50 |
| Linked from previous guest identity | +20 |
| Has any `server_game_state` row | +10 |
| Has `player_sessions` history (heartbeat past 7d) | +5 |
| Within capacity limit | +5 |
| Has linked a previous merged account | +5 |
| Has any `cheat_investigations` row | −100 per open |
| Auto-locked currently | −500 |
| Repeat cheat flags (3+) | −50 |
| `merge_audit_log.risk_score` ≥ 50 | −20 |

This is **not implemented** in the codebase. Only the admin check (binary) exists.

### 4.3 Identity lifecycle (state diagram)

```
[Anonymous browser]
  → supabase.auth.signInAnonymously()
    → [Anon user] (auth.users.is_anonymous = true)
      → POST /api/auth/initialize-guest
        → creates server_game_state
        → creates guest_identities
        → [Playing]
          → POST /api/auth/link-identity
            → creates pending_link_operations
            → User picks keep_guest or keep_google
              → POST /api/auth/confirm-link
                → [Linked] (merge_receipts + merge_audit_log)
                → old anon user abandoned
```

Orphaned anon users accumulate. The comment in `claim-guest` notes a cleanup job is needed but not implemented.

---

## Section 5 — Ban / lock architecture

### 5.1 Lock state (live) — `verified-live`

| State | Count | User |
|---|---|---|
| Locked | 1 | `d1af2ba4-1aa6-4320-a4f8-64faaec2d732` — "Auto-locked after 3 cheat flags" |
| `cheat_flag_count = 2` | 1 | `1b4d0dc3-…` (Malcolm/admin) |
| Unlocked, no flags | 2 | |

### 5.2 Lock trigger path

```
client → POST /api/game/state (or /api/auth/migrate-guest)
        → validateGameState() returns riskLevel ∈ {high, critical}
        → flagCheatAttempt(userId, type, desc, severity)
            → supabase.rpc('increment_cheat_flag', ...)
                → 1 cheat_investigations row inserted
                → server_game_state.cheat_flag_count += 1
                → if ≥ 3: is_locked = true, lock_reason = 'Auto-locked after 3 cheat flags'
```

### 5.3 Lock dimensions

| Dimension | Implemented? | Notes |
|---|---|---|
| **Account** (`is_locked` on `server_game_state.user_id`) | ✅ | Authoritative |
| **Device** (`guest_identities.device_id`) | ❌ | Not in schema, not in any code path |
| **Fingerprint** (`guest_identities.fingerprint_hash`) | ❌ | Not in any code path |
| **IP** | ❌ | No IP-based ban table; no IP column on `server_game_state` |
| **Player session** | ❌ | `player_sessions` has no lock column |

**Implication**: a banned user can re-sign-in anonymously on a new browser and start fresh. The banned identity is per-`auth.users` row only.

### 5.4 Admin bypass

- `verifyAuthAndOwnership` + `isAdminUserId(auth.userId)` (env-var) → bypass lock.
- `isAdminUserDb` (DB-backed) is the authoritative check, but `gameStateValidator.ts:158-162` uses `isAdminUserId` (env-var only) for the bypass decision — meaning **a DB-only admin can still be locked out of the game**.

### 5.5 Resolution flow

- `cheat_investigations.resolved_by` + `resolution_note` + `resolved_at` are populated.
- Live: 3 resolved (Malcolm's self-tests on 2026-06-09, notes `"its me"`), 3 open (the auto-locked user).
- Resolution does **not** automatically unlock the account. There's no `unlock_account` RPC or `is_locked = false` write in the code. Malcolm had to manually unlock via... unknown mechanism (probably direct DB edit).

---

## Section 6 — Device tracking audit

### 6.1 Storage — `verified-live` + `code-only`

- `guest_identities.device_id` (TEXT, indexed, partial `WHERE device_id IS NOT NULL`).
- Created from `crypto.randomUUID()` client-side; stored on `POST /api/auth/initialize-guest`.
- Survives `localStorage` clear only if also written to a `guest-uid` cookie (which is what `link-identity` falls back on).
- Live: 0 rows in `guest_identities` → device tracking is **currently inert**.

### 6.2 Usage — `code-only`

| Use | File | Line |
|---|---|---|
| Recovery | `recover-by-device` | [src/app/api/auth/recover-by-device/route.ts:54-57](src/app/api/auth/recover-by-device/route.ts#L54-L57) |
| Fallback for link | `link-identity` | [src/app/api/auth/link-identity/route.ts:90-97](src/app/api/auth/link-identity/route.ts#L90-L97) |
| Identity creation | `initialize-guest` | [src/app/api/auth/initialize-guest/route.ts:103-110](src/app/api/auth/initialize-guest/route.ts#L103-L110) |
| Identity preservation | `claim-guest` | [src/app/api/auth/claim-guest/route.ts:131-144](src/app/api/auth/claim-guest/route.ts#L131-L144) |

### 6.3 Bypass vectors

- **Incognito mode**: no `localStorage` → new `deviceId` on every visit.
- **Clear browsing data**: same.
- **Different browser / device / OS user**: new `deviceId`.
- **Mobile + desktop**: two `deviceId`s for the same human.
- **Server-side fingerprint recovery**: **not implemented**. Comment in `recover-by-device` line 1-2 is explicit: `"Fingerprint is NEVER used for recovery."`

### 6.4 No device lock

There is no way to "ban this device" or "ban this fingerprint". Banning an account only affects one `auth.users` row.

---

## Section 7 — Fingerprint audit

### 7.1 Storage — `verified-live`

- `guest_identities.fingerprint` (TEXT) — raw, unindexed
- `guest_identities.fingerprint_hash` (TEXT) — sha256 hex, indexed
- Created from `POST /api/auth/initialize-guest` body parameter `fingerprint?: string`
- **Live: 0 rows in `guest_identities`**, so 0 rows have any fingerprint data.

### 7.2 Read paths — `code-only`

`grep_search "fingerprint" src/**/*.ts` returns **only** the writes and one read:
- Write: `initialize-guest` line 99-101 (raw + hash)
- Read: `claim-guest` line 119 (copies old `fingerprint_hash` to new anon user — **preservation only, never queried**)
- UNIQUE INDEX `guest_identities_active_fingerprint_uidx` on `fingerprint` WHERE `superseded_by IS NULL` (DB-side enforcement)

The `select` clause in `recover-by-device` does NOT include `fingerprint` — the comment at the top of the file makes the design intent explicit:

> `// Phase 1.6: Recover guest account by device_id`
> `// device_id is the PRIMARY recovery signal. Fingerprint is NEVER used for recovery.`

### 7.3 Verdict

The fingerprint is **dead data** in the current system. It's collected, hashed, stored, and copied during recovery, but never used for any decision. The unique index on `fingerprint` is a side-effect (prevents duplicate active rows for the same fingerprint, but no code path depends on this).

**Options**:
1. **Remove** the fingerprint collection entirely. Saves client CPU + DB rows. Document the decision.
2. **Use it** for: (a) cross-device recovery ("here are your accounts on other devices"), (b) fraud signal ("3 anon accounts in 1 hour from same fingerprint"), (c) soft-ban signal.

---

## Section 8 — IP tracking audit

### 8.1 Where IP should be captured — `code-only`

| Table | Code | Column written | Live column exists? |
|---|---|---|---|
| `admin_actions` | [src/app/api/admin/market/resources/[id]/route.ts:73](src/app/api/admin/market/resources/%5Bid%5D/route.ts#L73) | `ip_address` | ❌ NO |
| `admin_actions` | [src/app/api/admin/market/resources/route.ts:135,202](src/app/api/admin/market/resources/route.ts#L135) | `ip_address` | ❌ NO |
| `player_actions` | (none — was dropped in migration 005) | n/a | n/a |
| `player_sessions` | (none — heartbeat comment says "no client_ip, no user_agent") | n/a | n/a |
| `merge_audit_log` | (none — fields exist but never written) | `actor_ip_hash`, `actor_ip_region`, `actor_user_agent` | ✅ exists |
| `pending_link_operations` | (none — fields exist but never written) | `ip_hash`, `ip_region`, `user_agent` | ✅ exists |
| `cheat_investigations` | (none) | n/a | n/a |
| `merge_receipts` | (none) | n/a | n/a |

### 8.2 Live data

- `merge_audit_log` total rows: **0** (0 with `actor_ip_hash`, 0 with `actor_user_agent`).
- `pending_link_operations` total rows: **0**.
- `player_sessions` has no IP/UA columns.
- `admin_actions` total rows: **3**, all `action_type = 'resolve_investigation'`. None of them are from market resource routes — meaning **no admin has ever triggered the market resource code path in production**, so the broken audit-log writes have not surfaced as a user-visible bug yet.

### 8.3 Risk

- **Admin actions on market resources are not auditable.** Once an admin creates/updates/deletes a market resource, the audit insert fails silently. There is no record of who did what.
- **Merge operations are not traceable.** The `merge_audit_log` schema is designed for IP/UA forensics, but the code never writes them. If a user disputes a merge, there's no way to correlate the merge with a session.
- **No IP-based rate limiting.** The rate limiter is keyed on `identifier` which is the `userId` or `deviceId`, not IP. A botnet hitting the API with valid auth tokens from N different IPs would all be rate-limited as one. Conversely, an anonymous attacker can hit `recover-by-device` or `claim-guest` from one IP at full rate — the `deviceId` they vary is unlimited.

### 8.4 Recommendation

1. **Add IP capture to proxy** (Cloudflare/Vercel edge already provides `cf-connecting-ip` / `x-real-ip`). Store in a `request_log` table with 30-day TTL.
2. **Capture IP at every auth-route entry** (init, recover, claim, link, confirm, migrate) and hash before storing.
3. **Add IP-based rate limit** as a secondary signal: "20 anon requests per IP per minute" on top of user/device limits.
4. **Fix the `admin_actions` schema/code mismatch** (see §2.4 P0) so that admin actions are auditable.

---

## Section 9 — Security gap analysis (OWASP Top 10:2025)

| OWASP | Finding | Severity | Notes |
|---|---|---|---|
| **A01 Broken Access Control** | `increment_cheat_flag` callable by `anon`+`authenticated`; any user can lock any other user | **P0** | Migration 031 is on disk, not applied |
| A01 | `lock_cheater_account` callable by `anon`+`authenticated` | **P0** | Direct unlock/lock bypass |
| A01 | `set_capacity` callable by `anon`+`authenticated` | **P0** | DoS; an anon can lock everyone out of signup |
| A01 | `apply_market_tick` callable by all (prosecdef=true) | **P0** | Direct market manipulation |
| A01 | `upsert_market_pressure` / `upsert_supply_demand` callable by all | **P1** | Market rigging |
| A01 | `validate_game_action` callable by all | **P1** | Bypass validation |
| A01 | `compute_offline_ticks` callable by all | **P1** | Free production (any user can claim ticks they didn't earn) |
| A01 | `recover-by-device` / `claim-guest` have no auth | **P1** | Attacker can enumerate/impersonate by varying `deviceId` |
| A01 | CSRF utility never invoked | **P0** | All cookie-auth POSTs are CSRF-vulnerable (mitigated only by SameSite=Lax default) |
| A01 | `market_player_pressure` policy: no `qual` and no `with_check` | **P1** | Confirmed by live query: any authed user can write to any row |
| **A02 Cryptographic Failures** | `state_hash` (HMAC-SHA256, 16 hex) is fine; `clientChecksum` not verified; TLS in transit is Cloudflare-provided | **P3** | OK |
| **A03 Injection** | All DB access via Supabase SDK (parameterized); `FORBIDDEN_CHARS_REGEX` in `update-profile`; `RESOURCE_ID_RE` in market routes | **P3** | OK |
| **A04 Insecure Design** | Fingerprint is collected but never used → wasted data, false sense of security | **P2** | Remove or use |
| A04 | Capacity 500, 6 accounts used, 2 on waitlist — overprovisioned for now | **P4** | OK |
| A04 | "Recovery" creates a new anon user + abandons old one — orphaned auth.users accumulate | **P2** | Needs periodic cleanup job |
| A04 | `clientChecksum` field is dead — clients may believe their state is being verified | **P2** | Either verify or remove the field |
| **A05 Security Misconfiguration** | 11+ migrations on disk not applied to production (`supabase db push` workflow broken) | **P0** | CI gate should fail builds on drift |
| A05 | `admin_actions.ip_address` write fails silently (column doesn't exist) | **P0** | Code + schema are out of sync |
| A05 | `merge_audit_log` IP columns exist but never populated | **P1** | Defense-in-depth gap |
| A05 | All tables have RLS enabled but no `rls_forced` — relies on the app never using the table owner role | **P3** | Acceptable for Supabase model |
| A05 | `auto_expose_new_tables` is unset in `config.toml` — comment warns this is deprecated and the default changes 2026-10-30 | **P2** | Set explicitly before cutoff |
| **A06 Vulnerable Components** | No known CVEs in pinned deps; `vaul@^1.1.2` added this session (no known CVEs) | **P3** | OK |
| **A07 Identification & Auth Failures** | No password (OAuth only) — strong; no MFA | **P3** | OK |
| A07 | No session revocation (sign-out clears local session, but no server-side session list) | **P3** | OK for MVP |
| A07 | Orphaned `auth.users` rows accumulate (no periodic cleanup) | **P2** | |
| A07 | Rate-limit identifier for `recover-by-device` is `deviceId` (client-controlled) | **P1** | Use IP as primary, deviceId as secondary |
| **A08 Software & Data Integrity** | `state_version` conflict detection works; HMAC checksum on server is solid; client-side `clientChecksum` is dead | **P2** | |
| A08 | Migrations not applied → state of "code matches DB" is false | **P0** | See A05 |
| A08 | `app_config.capacity.max` is in the database but the client doesn't read it (only the server `/api/auth/initialize-guest` does) | **P4** | OK |
| **A09 Logging & Monitoring** | `player_actions` is the audit log (good); `cheat_investigations` is the cheat log (good); `admin_actions` is broken (see A05) | **P1** | |
| A09 | No log shipping (Supabase logs go to the dashboard only) | **P3** | OK for MVP |
| A09 | `logActionAsync` is fire-and-forget via `queueMicrotask` — failures are silent | **P2** | |
| A09 | No alerting on `is_locked` transitions or `cheat_flag_count >= 2` (near-lock) | **P2** | |
| **A10 SSRF** | N/A — no outbound HTTP from API routes | **P3** | OK |

---

## Section 10 — Final architecture summary

### 10.1 State diagram: a user's lifecycle

```
                              ┌──────────────────┐
                              │   Arrival         │
                              │ (no auth cookie)  │
                              └────────┬─────────┘
                                       │ AuthProvider init
                                       ▼
                          ┌──────────────────────────┐
                          │ recover-by-device        │
                          │   no_identity            │
                          │     ↓                    │
                          │ signInAnonymously         │◀──── deviceId in localStorage
                          │   ↓                      │
                          │ initialize-guest          │      503 if capacity_full → /waitlist
                          │   ↓                      │
                          │ [ANONYMOUS, PLAYING]      │
                          └────────┬─────────────────┘
                                   │ clicks "Sign in with Google"
                                   ▼
                          ┌──────────────────────────┐
                          │ OAuth callback            │
                          │   exchangeCodeForSession  │
                          │   ↓                       │
                          │ link-identity             │
                          │   reads factory-dominion- │
                          │   guest-uid OR deviceId   │
                          │     ↓                    │
                          │ pending_link_operations   │
                          │     ↓                    │
                          │ confirm-link              │
                          │   writes merge_receipts   │
                          │   writes merge_audit_log  │
                          │   updates guest_identities│
                          │     ↓                    │
                          │ [GOOGLE, LINKED]          │
                          └────────┬─────────────────┘
                                   │
                                   │ state sync (game/state)
                                   │ riskLevel ∈ {high, critical}
                                   ▼
                          ┌──────────────────────────┐
                          │ flagCheatAttempt         │
                          │   rpc increment_cheat_   │
                          │   flag                   │
                          │     ↓                    │
                          │ cheat_flag_count++       │
                          │     ↓ if ≥ 3             │
                          │ [LOCKED]                 │
                          │   reason: 'Auto-locked   │
                          │   after 3 cheat flags'   │
                          └──────────────────────────┘
```

### 10.2 Top 10 findings (severity-ordered)

| # | Severity | Finding | Where | Recommendation |
|---|---|---|---|---|
| **F-1** | **P0** | `increment_cheat_flag` and `lock_cheater_account` are callable by `anon`+`authenticated`. Migration 031 is on disk but not applied. | `supabase/migrations/031_revoke_increment_cheat_flag_from_authenticated.sql` + live `pg_proc` grants | Apply migration 031 via Supabase MCP `apply_migration`; add a CI gate that detects grant drift |
| **F-2** | **P0** | `set_capacity` (SECURITY DEFINER) is callable by `anon`+`authenticated`. Any visitor can change the capacity to 1 or 1,000,000. | Live `pg_proc` grants for `set_capacity` | REVOKE EXECUTE from anon and authenticated; keep only service_role |
| **F-3** | **P0** | `apply_market_tick`, `upsert_market_pressure`, `upsert_supply_demand` are open to `anon`+`authenticated`. A malicious user can write arbitrary market state. | Live `pg_proc` grants | Lock down to service_role; admin UI calls should go through service-role client (verify in [src/app/api/admin/market/](src/app/api/admin/market/)) |
| **F-4** | **P0** | CSRF token utility (`src/lib/auth/csrf.ts`) defines `validateCsrf` but **no API route calls it**. All cookie-auth POSTs rely on SameSite cookie default. | `grep_search "validateCsrf"` returns 0 in routes; only `csrf.ts` and `fetchWrapper.ts` (client) | Invoke `validateCsrf(request)` in `POST`/`PUT`/`DELETE` handlers; wire to fetchWrapper |
| **F-5** | **P0** | `admin_actions` writes fail silently. Code writes `ip_address`, `target_id`, `payload` — none of these columns exist (live schema: `target_user_id`, `details`, no IP). The market resource admin routes (POST/PUT/DELETE) all do this. | [src/app/api/admin/market/resources/[id]/route.ts:73](src/app/api/admin/market/resources/%5Bid%5D/route.ts#L73) + [src/app/api/admin/market/resources/route.ts:135,202](src/app/api/admin/market/resources/route.ts#L135) | Either (a) add the missing columns via migration 032, or (b) rewrite the code to match the current schema. Apply migration 032. |
| **F-6** | **P0** | 11+ migrations on disk are not applied to the live database. The `supabase db push` workflow is broken. Migrations 025, 026, 027, 028, 029, 031, 032, 033, 034, 035, 036, 039 are in the file system but absent from `supabase_migrations.schema_migrations`. | `supabase_migrations.schema_migrations` shows 15 applied; filesystem has 40+ | Add CI gate: `supabase db diff` must show no drift. If drift, fail the build. |
| **F-7** | **P1** | `recover-by-device` and `claim-guest` have **no auth check**. An attacker can submit arbitrary `deviceId` and `newUserId` UUIDs. Rate-limit is also by `deviceId`, which the attacker controls. | [src/app/api/auth/recover-by-device/route.ts](src/app/api/auth/recover-by-device/route.ts) + [src/app/api/auth/claim-guest/route.ts](src/app/api/auth/claim-guest/route.ts) | (a) Require `Authorization: Bearer <accessToken>` and verify the user owns the new user_id; (b) switch rate-limit identifier to IP |
| **F-8** | **P1** | Lock state is per-`auth.users` only. There is no per-device, per-fingerprint, or per-IP lock. A banned user can re-sign-in anon and start fresh. | `server_game_state.is_locked` only; no other lock column anywhere | Add `is_locked`, `lock_reason`, `cheat_flag_count` to `guest_identities` and propagate locks on fingerprint/deviceId match |
| **F-9** | **P1** | `merge_audit_log` and `pending_link_operations` have `ip_hash`/`ip_region`/`user_agent` columns that are never populated. `merge_audit_log` is 0/0/0 in production. | Live query + [src/app/api/auth/confirm-link/route.ts:209-226](src/app/api/auth/confirm-link/route.ts#L209-L226) + [src/app/api/auth/link-identity/route.ts:155-169](src/app/api/auth/link-identity/route.ts#L155-L169) | Add IP/UA capture in proxy; pass to the link/confirm handlers; hash before storing |
| **F-10** | **P1** | `market_player_pressure` RLS policy has no `qual` and no `with_check`. Any authenticated user can write to any row. | Live `pg_policies` for `market_player_pressure` | Add `qual: auth.uid() = user_id` and `with_check: auth.uid() = user_id` |
| **F-11** | **P2** | The fingerprint is dead data. Collected, hashed, stored, copied during recovery — never read for any decision. | `guest_identities.fingerprint`, `.fingerprint_hash`; `grep_search "fingerprint"` returns only writes | Either remove collection or wire to a fraud signal (e.g., soft-ban 3 accounts/hour from one fingerprint) |
| **F-12** | **P2** | `validate_game_action` and `compute_offline_ticks` are callable by `anon`+`authenticated`. Validation bypass + free production. | Live `pg_proc` grants | Lock to service_role |
| **F-13** | **P2** | No lock-resolution flow. `cheat_investigations.resolved_by` is set, but `server_game_state.is_locked` is not auto-set to false. | No `unlock_account` RPC found | Add `unlock_account(p_user_id, p_note)` SECURITY DEFINER RPC; only service_role |
| **F-14** | **P2** | "Recovery" creates a new `auth.users` row and abandons the old one. Orphaned anon users accumulate; no cleanup job exists. | [src/app/api/auth/claim-guest/route.ts:34-37](src/app/api/auth/claim-guest/route.ts#L34-L37) | Add a scheduled `cleanup_orphan_anon_users` RPC (delete anon users with no game state > 30d) |
| **F-15** | **P2** | `logActionAsync` is fire-and-forget. Insert failures are logged but never surface. | [src/lib/auth/gameStateValidator.ts:476-503](src/lib/auth/gameStateValidator.ts#L476-L503) | Send to Sentry or similar; alert on consecutive failures |

### 10.3 What's working well

- RLS is enabled on all 40 tables with appropriate per-table policies.
- `state_version` conflict detection in `POST /api/game/state` prevents concurrent save races.
- HMAC checksum with `CHECKSUM_SECRET` fail-fast at module load is solid.
- Capacity limit + waitlist + admin support panel for capacity gating.
- `rateLimiter` is backed by a Supabase RPC, so it works across multi-instance Vercel deployments.
- `get_capacity_status()` is comprehensive: active_15m, active_24h, active_7d.
- `isAdminUserDb` with 60s in-memory cache + env-var fallback is a sensible pattern.
- `display_name` sanitization in `update-profile` and `migrate-guest` is thorough.
- `merge_receipts` is the correct design for a 90-day dispute window.

### 10.4 Quick-win remediation plan (≤ 1 day)

1. **Apply migration 031** via `mcp__supabase__apply_migration` (P0).
2. **REVOKE** `EXECUTE` on `set_capacity`, `apply_market_tick`, `upsert_market_pressure`, `upsert_supply_demand`, `validate_game_action`, `compute_offline_ticks` from `anon` and `authenticated`. **GRANT** to `service_role` only.
3. **Apply migration 032** (extend admin_actions action_types and add the `ip_address`, `target_id`, `payload` columns that the code is writing — or vice versa).
4. **Add a CI gate**: `supabase db diff` against the local migration history. Fail the build on drift.
5. **Wire `validateCsrf`** into every cookie-auth `POST` handler. Use the `csrf_token` cookie the proxy already sets.
6. **Add `qual: auth.uid() = user_id`** to `market_player_pressure` policies.
7. **Add IP capture** in Next.js proxy (Cloudflare: `cf-connecting-ip`) and pass to auth handlers via request header. Hash before storing.

### 10.5 Open questions for the user

1. Is the `supabase db push` workflow intentionally paused, or is it broken? (15 of 40+ migrations are applied; 11+ on disk are not.)
2. Migration 033 (`support_ticket_system`) — is it applied? The `support_tickets` and `support_messages` tables exist, but I don't see it in `schema_migrations`. Was it hot-patched?
3. Should we keep the `clientChecksum` field on the client for backwards compat (per the comment), or remove it as a P2 cleanup?
4. Is the dead-fingerprint situation intentional, or just an artifact of the recovery redesign? (F-11.)
5. Should the `auto_expose_new_tables` default-change deadline (2026-10-30) be tracked?

---

## Appendix A — Methodology and provenance

- **Live queries**: ~50 `mcp_supabase__execute_sql` calls against `wkkzqtseqwcyyyezroqq`.
- **Code reads**: ~20 files from `src/app/api/auth/`, `src/app/api/admin/`, `src/app/api/game/`, `src/lib/auth/`, `src/components/providers/`, `src/proxy.ts`.
- **Migration reads**: 1 file (`031_revoke_increment_cheat_flag_from_authenticated.sql`), 1 config (`supabase/config.toml`).
- **Searches**: `grep_search` for `validateCsrf`, `x-forwarded-for`, `fingerprint`.
- **All findings labeled** `[verified-live]`, `[code-only]`, or `[migration-file-only]`.
- **No code was modified.** Audit only.

## Appendix B — Confidence table

| Claim | Confidence | Source |
|---|---|---|
| 13 SECURITY DEFINER functions open to all | verified-live | `pg_proc` + `has_function_privilege` |
| 11+ migrations not applied | verified-live | `supabase_migrations.schema_migrations` |
| `increment_cheat_flag` callable by anon+authenticated | verified-live | `has_function_privilege` |
| `admin_actions` schema/code drift | verified-live | `information_schema.columns` + code |
| `merge_audit_log` IP columns never populated | verified-live | row counts |
| `player_sessions` has no IP/UA columns | verified-live | `information_schema.columns` |
| `guest_identities` is empty in production | verified-live | `count(*)` |
| 6 users total (4 anon, 2 Google) | verified-live | `auth.users` |
| CSRF utility never invoked in routes | code-only | `grep_search` |
| `clientChecksum` is dead input | code-only | code + handoff §8 |
| Recovery always creates new anon user | code-only | `recover-by-device` comment + `claim-guest` flow |
| Orphaned `auth.users` accumulate | code-only | `claim-guest` comment + auth.users count vs guest_identities count |
| Orphan cleanup not implemented | code-only | no `cleanup_orphan_anon_users` RPC found |
| Admin bypass uses env-var only | code-only | `gameStateValidator.ts:158-162` |
| Lock resolution not automated | code-only | no `unlock_account` RPC; no `is_locked = false` write in code |
| `app_config` has only `capacity` key | verified-live | `select key, value from app_config` |
| 500 max capacity | verified-live | `get_capacity_status()` |
| `set_capacity` callable by anon+authenticated | verified-live | `pg_proc` grants |
| `apply_market_tick` callable by anon+authenticated | verified-live | `pg_proc` grants |
| `market_player_pressure` policy is unqualified | verified-live | `pg_policies` |
| `increment_cheat_flag` is NOT SECURITY DEFINER | verified-live | `pg_proc.prosecdef` |
| `merge_audit_log` actor_ip_hash column exists | verified-live | `information_schema.columns` |
| `pending_link_operations` ip_hash column exists | verified-live | `information_schema.columns` |
