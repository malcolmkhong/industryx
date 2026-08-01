# PRODUCTION SECURITY & ARCHITECTURE AUDIT

## Methodology

This audit was performed by:
1. Reading the local codebase (migrations, API routes, auth helpers, game state)
2. **Querying the LIVE Supabase project** (`wkkzqtseqwcyyyezroqq` / IndustryX) via the Supabase MCP tools to verify schema, RLS, function signatures, and actual data

The migrations in the repo (`supabase/migrations/001-017_*.sql`) **do not match the live database**. The live DB has 5 applied migrations (`20260611114348` through `20260611202104`) that are not in the repo, plus 5 tables (`profiles`, `guest_identities`, `merge_receipts`, `pending_link_operations`, `merge_audit_log`) that have no migration file.

---

## Overall Grade: **D+**

**Production Ready: NO**

The database layer is more sophisticated than the migration files suggest (account linking infrastructure exists in schema, atomic operations, careful RLS). But the application code is **fundamentally broken**:
- Server action validation exists as scaffolding but is **never called by the game**
- `is_game_admin()` is **hardcoded to one UID** — adding admins to the table has no effect
- The 17 migration files don't match the live DB — **5 migrations are uncommitted**
- 5 tables for account linking exist in the DB but the **application has no code that uses them**

---

## Critical Issues

### C1. Server Action Validation is Dead Code (CONFIRMED)
**Severity: CRITICAL**
**Location:** `src/lib/game/store.ts` (entire file), `src/lib/game/serverActions.ts`
**Problem:** The `/api/game/action` endpoint exists and validates build/sell/buy/research/upgrade/transport actions. `grep` confirmed `submitActionToServer` is **only called from within `serverActions.ts` itself** — never from the game store. All game logic runs client-side.

**Evidence (live DB confirms no usage):**
- `player_actions` has 1414 rows from real usage, but all from save events (audit logs), not action validations
- No API route in `/api/game/action` is called from the game store

**Impact:** Every action in the game (build, sell, research, prestige, market trades) is **trivially exploitable via DevTools console**:
- `__gameStore.setState({ money: 1e15 })` — unlimited money
- `__gameStore.setState({ buildings: [...] })` — fake buildings
- `__gameStore.setState({ completedResearch: ['all', 'ids'] })` — unlock everything
- `__gameStore.setState({ prestigeState: { corporationPoints: 9999 } })` — fake prestige

**Evidence:** `src/lib/game/store.ts:3562` exposes the store to `window.__gameStore`.

**Fix:** Wire `submitActionToServer()` into every action in the store, remove `window.__gameStore` exposure in production.

---

### C2. `migrate-guest` Route Trusts Client-Provided `userId` (CONFIRMED)
**Severity: CRITICAL**
**Location:** `src/app/api/auth/migrate-guest/route.ts:23-55`
**Problem:** The route takes `userId` from the request body, then uses `supabase.auth.admin.getUserById(userId)` (service role) to verify the user exists. It does **not** verify that the requester's session matches the userId.

**Impact:** An attacker authenticated as User A can submit:
```json
{ "userId": "<victim_user_id>", "gameState": { "money": 1e15, ... } }
```
If victim has no existing cloud state, the server "migrates" the attacker's crafted state into the victim's account.

**Fix:** Replace `auth.admin.getUserById(userId)` with `verifyAuthAndOwnership(userId)` to ensure session matches body.

---

### C3. `is_game_admin()` is Hardcoded to One UID — Admin System is Broken
**Severity: CRITICAL** (NEW — confirmed against live DB)
**Location:** Live DB function `public.is_game_admin()`
**Problem:** The function source is literally:
```sql
RETURN auth.uid()::text = '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';
```

**It does not consult the `admin_users` table at all.** Every RLS policy that uses `is_game_admin()` (which is ~20 policies on `game_config_*` tables, plus `admin_users` policies) only succeeds for that single hardcoded UID.

**Impact:**
- Adding admins to the `admin_users` table has **zero effect** for any RLS-gated operation
- The app code path `isAdminUserDb()` (which DOES query the table) can grant admin access at the application level, but the admin cannot actually write game configs (RLS blocks them)
- Only the env-var UID (the developer) can ever write configs
- If the developer UID is compromised → total config control
- The `admin_users` table is effectively decorative for non-env-var admins

**Fix:** Replace the function body with a real query against `admin_users`:
```sql
CREATE OR REPLACE FUNCTION public.is_game_admin() 
RETURNS boolean 
LANGUAGE plpgsql STABLE SECURITY DEFINER 
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
      OR auth.uid()::text = '1b4d0dc3-e4d2-4fc0-b731-9782243ad061';  -- keep env-var bootstrap
END;
$$;
```

---

### C4. Live DB Schema is Out of Sync with Repo Migrations
**Severity: CRITICAL** (NEW — confirmed against live DB)
**Location:** `supabase/migrations/` vs live `supabase_migrations.schema_migrations`
**Problem:** 
- **Live DB has 5 applied migrations** (`20260611114348` through `20260611202104`) that are **NOT in the repo**
- **5 tables exist in the live DB with no migration file**: `profiles`, `guest_identities`, `merge_receipts`, `pending_link_operations`, `merge_audit_log`
- The repo's `supabase/migrations/017_security_hardening_and_cleanup.sql` attempted to drop tables that are now in the live DB without any migration record (e.g., `research_prerequisites` is mentioned in the file but isn't actually present in the live DB — the live DB has different tables)

**Tables in the live DB but NOT in any migration file:**
- `profiles` (with `is_guest`, `linked_account_id`, `linked_at`, `device_fingerprint`)
- `guest_identities` (with `fingerprint`, `device_id`, `superseded_by`, `fingerprint_hash`)
- `merge_audit_log` (with `idempotency_key`, `risk_score`, `risk_flags`, `preference`, `merge_result`)
- `merge_receipts` (with `kept_user_id`, `archived_user_id`, `decision_type`, `expires_at`)
- `pending_link_operations` (with `idempotency_key`, `status`, `risk_score`, `expires_at`)

**Impact:**
- The repo cannot be reproduced — a fresh Supabase project from these migrations would be missing the entire account linking / merge infrastructure
- New developers cannot bootstrap a working environment
- Disaster recovery is broken

**Fix:** Dump the live schema, generate migration files for all uncommitted tables/functions/policies, commit them.

---

### C5. `guest_identities` Uses the Old Insecure `USING (true)` RLS Pattern
**Severity: CRITICAL** (NEW — confirmed against live DB)
**Location:** Live DB policy `guest_identities."Service role full access on guest_identities"`
**Problem:** The policy is:
```sql
CREATE POLICY "Service role full access on guest_identities" ON guest_identities
  FOR ALL USING (true) WITH CHECK (true);
```

This is the **OLD insecure pattern** that migration 007 was supposed to eliminate. The migration replaced `USING (true)` with `auth.role() = 'service_role'` for all tables, but `guest_identities` was created AFTER migration 007 (it has no migration file) and inherited the old pattern.

**Impact:** Any authenticated or anonymous user can read/write ALL rows in `guest_identities` — including reading other users' fingerprints and device IDs, and modifying their `superseded_by`/`superseded_at` to disrupt account linking.

**Fix:** Apply migration to replace with:
```sql
DROP POLICY "Service role full access on guest_identities" ON guest_identities;
CREATE POLICY "Service role full access on guest_identities" ON guest_identities
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

---

### C6. `/api/game/state` POST Allows Gradual Cheating & Admin Bypass (CONFIRMED)
**Severity: CRITICAL**
**Location:** `src/app/api/game/state/route.ts:104-345`
**Problem:** The state save endpoint validates against `GAME_LIMITS` (MAX_MONEY=1e15, MAX_BUILDINGS=500) and uses delta checks. But:
- **Admin bypass** (`isUserAdmin`) on line 212-226 disables ALL cheat detection
- Gradual cheaters (staying within delta limits) are never caught
- `lastOnlineTimestamp` (used for tick rate check) is client-provided

**Impact:** Admin account compromise = total game integrity loss. Gradual cheaters get to MAX bounds.

**Fix:** Remove or strictly limit admin bypass; require server-side timestamps.

---

### C7. `/api/game/compute` and `/api/game/action` Trust Client State (CONFIRMED)
**Severity: CRITICAL**
**Location:** `src/app/api/game/compute/route.ts:225-304`, `src/app/api/game/action/route.ts:331-488`
**Problem:** Both endpoints take the entire `gameState` from the client without loading the authoritative `server_game_state`. The server then operates on the client's claimed state.

**Impact:** Client can send a state with `money: 1e14`, ask the server to compute 60,000 ticks, and receive a "legitimate" new state. This can then be saved via `/api/game/state` with a delta that appears plausible.

**Fix:** Load authoritative state from `server_game_state` first.

---

## High Issues

### H1. `increment_cheat_flag` is Publicly Callable (REVISED — actual impact smaller than expected)
**Severity: HIGH** (REVISED DOWN from CRITICAL)
**Location:** Live DB function `public.increment_cheat_flag`
**Original C1 Finding:** I claimed a SQL lockout attack. **This is largely mitigated by RLS at runtime.**

**Verified live state:**
- Function: `increment_cheat_flag(p_user_id uuid, p_flag_type text, p_description text, p_severity text)` RETURNS void
- **NOT SECURITY DEFINER** (`prosecdef: false`)
- ACL: `["=X/postgres","postgres=X/postgres","anon=X/postgres","authenticated=X/postgres","service_role=X/postgres"]` — callable by PUBLIC, anon, authenticated
- Function body: `UPDATE server_game_state SET cheat_flag_count = cheat_flag_count + 1 WHERE user_id = p_user_id RETURNING ...; INSERT INTO cheat_investigations (...) VALUES (...); PERFORM lock_cheater_account(p_user_id, ...)`

**Why the lockout attack FAILS:**
- `cheat_investigations` has **0 INSERT/UPDATE policies** for non-service-role → the INSERT inside the function fails
- `server_game_state` has **0 INSERT/UPDATE/DELETE policies** for non-service-role → the UPDATE inside the function fails
- The whole transaction rolls back, so no state is modified
- `lock_cheater_account()` does `UPDATE server_game_state SET is_locked = true` → also blocked by RLS

**What remains exploitable:**
- The function returns no error to the client; the client gets a 500/PGRST error that reveals nothing useful
- An attacker can call it with their own user_id to grief themselves (3 calls = self-lock) — not a useful attack
- The function signature matches the migration 012 definition BUT the runtime version is the simpler migration 005 version (not security definer, no FOR UPDATE)

**Remaining concerns:**
- The function should still be locked to `service_role` only for defense in depth
- The function is NOT the race-safe version from migration 012 (no FOR UPDATE, no auto-lock check) — but the simpler `UPDATE ... SET cheat_flag_count = cheat_flag_count + 1` is still atomic in SQL

**Fix:** `REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag(uuid,text,text,text) FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role;`

---

### H2. `flagCheatAttempt` App Code Has TOCTOU Despite Atomic RPC Existing
**Severity: HIGH**
**Location:** `src/lib/auth/gameStateValidator.ts:353-425`
**Problem:** The deployed function is the simple atomic one. The app code in `flagCheatAttempt` does read-then-write at line 379-404, with a TODO acknowledging the race. The SQL is atomic but the application logic is not.

**Fix:** Replace with `supabase.rpc('increment_cheat_flag', ...)`.

---

### H3. Account Linking Infrastructure Exists in DB but Has No Application Code
**Severity: HIGH** (NEW)
**Location:** Tables `guest_identities`, `merge_receipts`, `pending_link_operations`, `merge_audit_log` in live DB
**Problem:** The full account linking/merge infrastructure is in the schema, with columns for:
- `pending_link_operations`: `idempotency_key`, `status`, `risk_score`, `expires_at`, `preference` (user choice: keep guest/keep google)
- `merge_receipts`: `kept_user_id`, `archived_user_id`, `decision_type`, `expires_at` (90-day default)
- `merge_audit_log`: full state snapshots before/after merge

**Confirmed via grep:** NO application code in `src/` references `guest_identities`, `merge_receipts`, `pending_link_operations`, `merge_audit_log`, `/api/auth/link`, `/api/auth/recover`, `/api/auth/merge`, `linkIdentity`, or `signInAnonymously`.

**Live data confirms:** All linking tables have 0 rows. The infrastructure was designed but never wired up.

**Impact:** The user's spec requires guest → Google linking, account recovery, and anonymous auth. None of it works because no code consumes the schema.

**Fix:** Build the API routes and client code that consume these tables. Or drop the dead schema.

---

### H4. Offline Progress is Entirely Client-Computed (CONFIRMED)
**Severity: HIGH**
**Location:** `src/lib/hooks/page/useOfflineProgressCheck.ts`, `src/lib/game/store.ts:3050-3165`
**Problem:** `calculateOfflineProgress()` runs entirely in the browser using the client-controlled `lastOnlineTimestamp`. The server CAN compute offline progress via `runServerTicks()`, but the offline flow never calls it.

**Impact:** Player can set `lastOnlineTimestamp: 0` to get max offline rewards (capped at 36000 ticks = 10 hours).

**Fix:** After local calculation, send claim to server for verification.

---

### H5. Leaderboard Submission Uses Client `totalMoneyEarned` for Scoring
**Severity: HIGH**
**Location:** `src/app/api/leaderboard/submit/route.ts:94-100`
**Problem:** The score formula uses `gameState.totalMoneyEarned` directly. The 10% tolerance check is easily bypassed by also inflating `gameState.totalMoneyEarned` to match the fake score.

**Fix:** Load `server_game_state.total_money_earned` for scoring instead of trusting client.

---

### H6. `expire_stale_pending_operations` is SECURITY DEFINER with No Revoked Grants
**Severity: HIGH** (NEW)
**Location:** Live DB function `public.expire_stale_pending_operations`
**Problem:** This is a SECURITY DEFINER function that mutates `pending_link_operations` (sets status to 'expired'). The ACL is only `["postgres=X/postgres","service_role=X/postgres"]` so it can't be called by anon/authenticated directly. **But it's not in any migration file** — only the function exists, not the migration. This is a sign of uncommitted schema.

**Fix:** Capture the function definition as a migration file.

---

### H7. No Anonymous Auth / No Code Uses `signInAnonymously`
**Severity: HIGH**
**Location:** Entire codebase (confirmed via grep)
**Problem:** The user's spec requires "anonymous login" and "guest accounts". The live DB supports anonymous users (`auth.users.is_anonymous` column exists, `profiles.is_guest` column exists, `handle_new_user()` sets `is_guest` based on `is_anonymous`). But **no application code calls `signInAnonymously`**. The AuthProvider only has `signInWithGoogle`.

**Impact:** Guests in the current implementation are 100% localStorage with no Supabase identity. They cannot be linked, recovered, or tracked server-side.

**Fix:** Add `signInAnonymously()` call in AuthProvider for first pageload, store the anon user_id, use it for the merge infrastructure.

---

### H8. Two `update_updated_at` Trigger Functions Firing
**Severity: HIGH** (NEW)
**Location:** Live DB has both `auto_update_timestamp()` and `update_updated_at_column()` installed
**Problem:** Both functions fire on UPDATE for game_config tables. Confirmed by the trigger listing:
- `set_updated_at` → `EXECUTE FUNCTION auto_update_timestamp()`
- `trg_gca_updated_at` → `EXECUTE FUNCTION update_updated_at_column()`

**Impact:** 
- Each UPDATE fires both triggers, doing essentially the same work twice
- Two triggers for the same logic is a maintenance hazard — they could drift

**Fix:** Drop one set of triggers (keep one function and one trigger per table).

---

### H9. `/api/auth/migrate-guest` Has No Rate Limiting
**Severity: HIGH**
**Location:** `src/app/api/auth/migrate-guest/route.ts`
**Problem:** No `checkRateLimit()` call. An attacker can spam the migration endpoint with different `userId` values.

**Fix:** Add rate limiting (e.g., 5/min per userId).

---

### H10. OAuth Callback Errors Not Surfaced; No Mutex on Sign-In
**Severity: HIGH**
**Location:** `src/app/api/auth/callback/route.ts:43`, `src/components/providers/AuthProvider.tsx:96-112`
**Problem:** 
- Callback errors only set `?auth=error` URL param, which is never read by `page.tsx`
- `signInWithGoogle()` silently swallows errors — UI gets permanently stuck in "Signing in..."
- No mutex on `signInWithGoogle()` — rapid clicks open multiple OAuth popups

**Fix:** Throw errors, add mutex, read `?auth=error` param, show error banner.

---

### H11. `initialLoadDone` Ref Never Resets on Sign-Out
**Severity: HIGH**
**Location:** `src/lib/hooks/cloudSync/index.ts:70-91`
**Problem:** The ref persists across sign-out → sign-in within the same session. The second sign-in will not trigger cloud load or migration.

**Fix:** Reset ref in `useEffect` when `user` becomes null.

---

## Medium Issues

### M1. CHECKSUM_SECRET Has No Startup Guard
**Location:** `src/lib/auth/gameStateValidator.ts:58-63`

### M2. `admin.ts` Queries `admin_users` with Non-Existent `is_active` Column
**Location:** `src/lib/auth/admin.ts:57`, `src/lib/auth/admin-helpers.ts:20`
**Verified live:** The query fails silently. Admin list is always empty in DB. All admin checks fall back to env var.
**Note:** This is a real bug but is REDUNDANT with C3 — even if the column existed, `is_game_admin()` is hardcoded so only the env-var UID is admin.

### M3. Player Sync Route Lacks Optimistic Concurrency
**Location:** `src/app/api/player/route.ts:121-291`

### M4. Admin OAuth Callback Uses Env Var Only
**Location:** `src/app/admin/auth/callback/route.ts:26-30`

### M5. No Security Headers in next.config.ts
**Location:** `next.config.ts`

### M6. `typescript.ignoreBuildErrors: true` Disables Type Safety
**Location:** `next.config.ts:7`

### M7. Service Role Key Used in 31 Files
**Location:** 31 files
**Note:** The live DB confirms that **all 16 game_config tables have `Service role full access` AND separate `Config X: admin can write/update/delete` policies**. The admin policies are technically duplicate with the service-role ones (service role can already do everything) but they serve as a safety net for cases where admin uses a non-service-role key.

### M8. Action Route Doesn't Check Ownership Strictly
**Location:** `src/app/api/game/action/route.ts:358-370`

### M9. `displayName` Not Sanitized
**Location:** `src/app/api/auth/migrate-guest/route.ts:160`

### M10. `GENEROSITY_MULTIPLIER: 3` Too Loose
**Location:** `src/lib/auth/guestMigrationValidator.ts:107`

### M11. `trade_history` Admin Policy Uses Direct Table Query Instead of `is_game_admin()`
**Location:** Live DB policy `trade_history."Admin read access"`
**Verified live:** The policy is `EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())`. Combined with C3 (admin_users effectively has no admins), this policy is dead for non-env-var users.
**Note:** This is a separate finding from C3 — at least this policy correctly tries to consult the table (it just doesn't work due to C3).

---

## Live Database State (Verified)

### Tables (35 total in public schema)
- **Migrations accounted for (17)**: All 17 files in `supabase/migrations/` correspond to applied tables
- **Unaccounted tables (5)**: `profiles`, `guest_identities`, `merge_receipts`, `pending_link_operations`, `merge_audit_log`
- **Account linking tables (4)**: All 0 rows — infrastructure exists but never used

### Functions (16 in public schema)
- `auto_update_timestamp` (NEW, not in migrations) — trigger function
- `check_rate_limit` — from migration 016
- `cleanup_rate_limits` — from migration 016
- `cleanup_stale_sessions` — from migration 004
- `compute_offline_ticks` — from migration 004
- `expire_stale_pending_operations` (NEW, not in migrations) — SECURITY DEFINER
- `get_leaderboard` — from migration 011
- `get_user_rank` — from migration 011
- `handle_new_user` (replaced, not in any migration) — uses `is_anonymous` from auth.users
- `increment_cheat_flag` — from migration 005 (NOT 012), NOT security definer
- `is_game_admin` (hardcoded to one UID, not in any migration)
- `lock_cheater_account` — from migration 005
- `rls_auto_enable` (Supabase infrastructure, not in migrations)
- `update_updated_at_column` — from migration 009
- `validate_game_action` — from migration 004
- `validate_research_prereqs` — from migration 004

### Actual Data (live)
- **auth.users**: 2 rows (1 admin@test.com test, 1 Google user `malcolmkhong@gmail.com`)
- **profiles**: 1 row (the Google user, NOT a guest, NOT linked)
- **server_game_state**: 1 row (the Google user, money=4121, tick=11784, cheat_flag_count=2, NOT locked)
- **player_progress**: 1 row
- **player_actions**: 1414 rows (audit log)
- **cheat_investigations**: 3 rows (all admin's own state_tampering during dev, all resolved)
- **rate_limits**: 0 rows (rate limiter never triggered)
- **guest_identities, pending_link_operations, merge_receipts, merge_audit_log**: 0 rows each

### RLS Policies Verified
- `server_game_state`: 1 SELECT policy (own data) + 1 service-role ALL — no user INSERT/UPDATE/DELETE
- `cheat_investigations`: 1 service-role ALL — no user access
- `guest_identities`: 1 service-role ALL with `USING (true) WITH CHECK (true)` (INSECURE, old pattern)
- `admin_users`: 4 policies using `is_game_admin()` (which is hardcoded)
- `trade_history`: includes `Admin read access` policy using direct `admin_users` query
- All `game_config_*` tables: public SELECT + `is_game_admin()` write policies

### Triggers
- 16 game_config tables each have BOTH `set_updated_at` (→ `auto_update_timestamp()`) AND `trg_gcX_updated_at` (→ `update_updated_at_column()`) — double-firing triggers
- `player_progress` has only `set_updated_at`
- 1 `on_auth_user_created` → `handle_new_user()` trigger on `auth.users`

### Admin Count
- **Real admin users**: 1 (env-var UID `1b4d0dc3-e4d2-4fc0-b731-9782243ad061`)
- **admin_users table rows**: 0 (despite migration 004 seeding it)
- **`is_game_admin()` returns true for**: only the env-var UID

---

## Attack Simulation (REVISED with live DB)

| Attack | Success? | Evidence |
|--------|----------|----------|
| 1. Modify API requests | **YES** | `/api/game/compute`, `/api/game/action` trust client state. `/api/game/state` delta checks are bypassable. |
| 2. Modify localStorage | **YES** | `__gameStore.setState()` in DevTools bypasses all validation. |
| 3. Replay requests | **PARTIAL** | State version prevents save replay. Action endpoints have no nonce. |
| 4. Multi-tab linking | **YES** | `migrate-guest` route can be hit from multiple tabs. `initialLoadDone` ref doesn't reset. |
| 5. Multi-device linking | **YES** | C2 + H9: Attack with valid `userId` from any device. |
| 6. Guest account abuse | **YES** | C1 (dead server validation) + window store exposure = infinite local money, then migrate. |
| 7. Cloud save abuse | **YES** | `/api/game/compute` returns "blessed" state, can save to server. |
| 8. Offline progress abuse | **YES** | H4: Set `lastOnlineTimestamp: 0` → max offline reward. |
| 9. Account lockout DoS via SQL | **NO (REVISED)** | H1: RLS on `cheat_investigations` (0 write policies) and `server_game_state` (0 write policies) blocks the cross-user attack. The RPC call fails silently. |
| 10. Cross-user data read via guest_identities | **YES (REVISED)** | C5: `guest_identities` uses `USING (true)` — any anon/authenticated user can read ALL guest identities including device fingerprints. |
| 11. Leaderboard cheating | **YES** | H5: Inflate `totalMoneyEarned` in game state. |
| 12. Sign-in DoS | **YES** | H10: Rapid clicks open multiple OAuth popups. |
| 13. Server error → unlimited local play | **YES** | `serverActions.ts:99` silently disables validation on network error. |
| 14. Admin escalation via admin_users table | **NO** | C3: `is_game_admin()` is hardcoded — adding to admin_users has no effect. |
| 15. Exploit unaccounted link tables | **PARTIAL** | C5: `guest_identities` is fully readable due to `USING (true)`. The other merge tables use proper `auth.role() = 'service_role'` policies. |

---

## Final Verdict

| Category | Score | Notes |
|----------|-------|-------|
| **Security** | **48/100** | DB layer well-designed but undermined by `is_game_admin()` hardcoding, `guest_identities` `USING (true)`, and dead server validation. C1 lockout attack was overstated — RLS mitigates. |
| **Architecture** | **40/100** | Account linking tables exist in DB but no app code uses them. Server action API is dead code. Migrations don't match live DB. |
| **Scalability** | **55/100** | Rate limiting distributed. Double trigger fires waste CPU. Service role used per-request. |
| **Anti-Cheat** | **25/100** | Client-authoritative. `window.__gameStore` exposed. No server validation called. Multiple exploits via console. |

### Would I deploy this to production for 1,000 active players?

**NO.**

### Why?

1. **Server action validation is dead code.** Any player opens DevTools and sets `__gameStore.setState({ money: 1e15 })`. The 1414 player_actions rows in the DB are just save audits, not action validations.

2. **`is_game_admin()` is hardcoded** — only the developer's UID can write game configs. The `admin_users` table is decorative.

3. **`guest_identities` has the old insecure `USING (true)` RLS pattern** — any user can read all device fingerprints and link operations.

4. **The account linking infrastructure is dead schema** — 4 tables and 1 function exist for guest→Google linking, but no application code uses them. The user's spec requires this and it doesn't work.

5. **`/api/auth/migrate-guest` doesn't verify session matches `userId`** — first-time cloud state can be overwritten by any authenticated attacker.

6. **Migrations don't match the live DB** — 5 migrations applied but not in the repo. The project cannot be reproduced from the codebase.

7. **Offline progress, leaderboard scoring, and tick computation all trust the client.**

### Minimum Viable Production Fixes (Priority Order)

1. **C3** (CRITICAL): Replace `is_game_admin()` body to actually query `admin_users`.
2. **C5** (CRITICAL): Fix `guest_identities` RLS — drop `USING (true)` policy, recreate with `auth.role() = 'service_role'`.
3. **C2** (CRITICAL): Add `verifyAuthAndOwnership` to `/api/auth/migrate-guest`.
4. **C1** (CRITICAL): Wire `submitActionToServer()` into every action in `store.ts`. Remove `window.__gameStore` exposure.
5. **C4** (CRITICAL): Dump live schema, generate migration files for uncommitted tables/functions/policies.
6. **H7** (HIGH): Add `signInAnonymously()` to AuthProvider.
7. **H3** (HIGH): Build the API routes that consume the account linking tables (or drop the dead schema).
8. **H1** (HIGH): Replace `flagCheatAttempt` with the atomic RPC.
9. **H2** (HIGH): Verify offline progress via server.
10. **H5** (HIGH): Use `server_game_state` for leaderboard scoring.
11. **H8** (HIGH): Drop duplicate trigger set.
12. **C6/C7** (CRITICAL): Make `/api/game/compute` and `/api/game/action` load `server_game_state`.
13. **H10** (HIGH): Add mutex to `signInWithGoogle`, surface errors, read `?auth=error`.
14. **H1 (REVISED)**: `REVOKE EXECUTE ON FUNCTION public.increment_cheat_flag FROM PUBLIC, anon, authenticated` for defense in depth.
15. **C4 (NEW)** (CRITICAL): Migrate all uncommitted schema to files in `supabase/migrations/`.

**This is roughly 3-5 weeks of focused engineering work** before this game is safe for 1,000 active players.

---

## Appendix: Corrections from Initial Audit

| Original Claim | Verified Against Live DB |
|---|---|
| C1: `increment_cheat_flag` lockout attack via SQL | **INVALIDATED** — RLS blocks the cross-user UPDATE/INSERT. The function is callable but RLS prevents the attack. Still HIGH severity for defense in depth. |
| C1: `is_game_admin()` is missing from migrations | **PARTIALLY TRUE** — it's not in any migration file (exists in DB only). And it's also hardcoded to one UID. |
| H4: No account linking infrastructure | **CORRECTED** — the infrastructure EXISTS in the DB (4 tables + 1 function) but is dead code (no app references). |
| `auth.users` schema assumption | **CORRECTED** — `is_anonymous` column exists with default `false`, supporting anonymous auth even though the app doesn't use it. |
| `increment_cheat_flag` is the migration 012 version | **CORRECTED** — the deployed function is the simpler migration 005 version, NOT the atomic migration 012 version. |
| 17 migrations = full schema | **CORRECTED** — 5 additional migrations were applied directly to the live DB. The repo migrations are incomplete. |
| `is_game_admin` exists with unknown source | **CONFIRMED** — the function exists in DB, source is hardcoded UID comparison. Not in any migration file. |
