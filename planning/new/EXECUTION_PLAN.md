# EXECUTION PLAN — Identity & Anti-Cheat Hardening

> **Date:** 2026-06-18
> **Project:** IndustryX (Factory Dominion) — `db.wkkzqtseqwcyyyezroqq.supabase.co`
> **Status:** APPROVED — execution begins
> **Scope:** Three phases of storage, audit, and Google-anchored enforcement changes
> **Policy:** Google Account = hard enforcement; Fingerprint = correlation; Device ID = recovery; IP = analytics. **No fingerprint/device_id/IP may auto-lock, auto-ban, deny login, deny guest creation, or deny recovery.**

---

## 0. Pre-Execution Snapshot (Live-Verified 2026-06-18)

| Asset | State |
|---|---|
| `auth.users` | 6 rows (4 anonymous, 2 Google) |
| `profiles` | 5 rows (1 Google, 4 guests) |
| `server_game_state` | 4 rows; 1 locked (`d1af2ba4-…`, anon, `cheat_flag_count=3`, `lock_reason='Auto-locked after 3 cheat flags'`) |
| `guest_identities` | 0 rows |
| `merge_audit_log`, `pending_link_operations`, `merge_receipts` | 0 rows |
| `cheat_investigations` | 6 rows (3 open, 3 resolved) |
| `rate_limits` | 51 rows (all from locked user hitting `/api/game/state`) |
| `pg_cron` extension | Availability to be confirmed in Phase 1 pre-check |
| Migrations applied | 15 (latest: `040_capacity_and_waitlist`) |
| Migrations on disk but not applied | 041+ (to be created in this execution) |
| Current `claim-guest` lock check | **None** (no enforcement; old `user_id` reassigned unconditionally) |
| Current `link-identity` lock check | `guestState.is_locked` only (Google side NOT checked) |
| `increment_cheat_flag` grants | Open to `anon` + `authenticated` (F-1 from prior audit) |

**Pre-execution risk window:**
- Any logged-in user can call `increment_cheat_flag` to lock any other user (F-1).
- A banned guest-only user can clear cookies and re-claim via `claim-guest` (Phase 2 §E1).
- A Google-locked user can re-link from a new device (Phase 2 §E8).

This execution plan closes these gaps with the minimum-false-positives policy.

---

## 1. Migration Order (Authoritative)

Each migration is applied exactly once, in this order, with a separate `mcp__supabase__apply_migration` call per file. The version timestamp is a unique ISO-8601 string (no two migrations share it).

| Order | File | Phase | Content | Risk |
|---|---|---|---|---|
| 1 | `041_alter_cheat_investigations.sql` | 1 | `ALTER TABLE cheat_investigations ADD fingerprint_hash text, device_id text` + indexes | Low |
| 2 | `042_alter_merge_audit_log.sql` | 1 | `ALTER TABLE merge_audit_log ADD fingerprint_hash text` + index | Low |
| 3 | `043_alter_pending_link_operations.sql` | 1 | `ALTER TABLE pending_link_operations ADD fingerprint_hash text, device_id text` | Low |
| 4 | `044_alter_admin_actions.sql` | 1 | `ALTER TABLE admin_actions ADD ip_address inet, target_id text, payload jsonb` | Low |
| 5 | `047_create_request_ip_log.sql` | 1 | `CREATE TABLE request_ip_log` with RLS, indexes | Low |
| 6 | `050_create_unlock_account_rpc.sql` | 1 | `CREATE FUNCTION unlock_account(p_user_id uuid, p_note text) SECURITY DEFINER` | Low |
| 7 | `048_rls_market_player_pressure.sql` | 2 | `DROP POLICY ...; CREATE POLICY ... USING (auth.uid() = user_id)` | Medium |
| 8 | `049_lockdown_security_rpcs.sql` | 2 | `REVOKE` from `anon`/`authenticated`, `GRANT` to `service_role` for 8 RPCs | High |
| 9 | `051_cleanup_orphan_anon_users.sql` | 3 | `CREATE FUNCTION cleanup_orphan_anon_users()` + `cron.schedule` | Medium |

**Migration 046 is NOT in this plan** (fingerprint-ban RPC was rejected by the policy correction in Phase 5). **Migrations 045, 052, 053, 054, 055, 056 from the earlier draft are NOT in this plan** (UNIQUE constraint swap on fingerprint_hash was rejected, and downstream migrations were superseded by the policy revision).

---

## 2. PHASE 1 — Foundation (Storage + Audit)

**Goal:** Add storage columns and admin-only utilities. No behaviour change. No enforcement.

### 2.1 Files to Modify (Phase 1)

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/041_alter_cheat_investigations.sql` | **Create** | `fingerprint_hash text`, `device_id text` on `cheat_investigations` + indexes |
| `supabase/migrations/042_alter_merge_audit_log.sql` | **Create** | `fingerprint_hash text` on `merge_audit_log` + index |
| `supabase/migrations/043_alter_pending_link_operations.sql` | **Create** | `fingerprint_hash text`, `device_id text` on `pending_link_operations` |
| `supabase/migrations/044_alter_admin_actions.sql` | **Create** | `ip_address inet`, `target_id text`, `payload jsonb` on `admin_actions` |
| `supabase/migrations/047_create_request_ip_log.sql` | **Create** | New `request_ip_log` table (analytics), RLS, indexes |
| `supabase/migrations/050_create_unlock_account_rpc.sql` | **Create** | `unlock_account` SECURITY DEFINER, service_role only |
| `src/middleware.ts` | **Modify** | Capture `cf-connecting-ip`, attach as `x-real-ip` header |
| `src/lib/auth/fingerprint.ts` | **Create** | Fingerprint library wrapper, caches result in localStorage |
| `package.json` | **Modify** | Add `@fingerprintjs/fingerprintjs` dependency |
| `src/components/providers/AuthProvider.tsx` | **Modify** | Compute fingerprint, include in `initialize-guest` and `recover-by-device` body |
| `src/lib/hooks/useMergeFlow.ts` | **Modify** | Include fingerprint in `link-identity` body |
| `src/app/api/auth/request-ip-log-helper.ts` | **Create** | Server-side helper: read `x-real-ip`, hash, write to `request_ip_log` |
| `src/app/api/auth/initialize-guest/route.ts` | **Modify** | Accept `fingerprint` in body (optional), store on `guest_identities`. Call `request-ip-log-helper`. |
| `src/app/api/auth/recover-by-device/route.ts` | **Modify** | Echo `fingerprint_hash` in response. Call `request-ip-log-helper`. |
| `src/app/api/auth/claim-guest/route.ts` | **Modify** | Call `request-ip-log-helper` only (no enforcement change in Phase 1) |
| `src/app/api/auth/link-identity/route.ts` | **Modify** | Capture `fingerprint_hash`, `device_id`, `user_agent` from request body. Write to `pending_link_operations`. Call `request-ip-log-helper`. |
| `src/app/api/auth/confirm-link/route.ts` | **Modify** | Capture `fingerprint_hash`, `user_agent` from request body. Write to `merge_audit_log`. Call `request-ip-log-helper`. |
| `src/lib/auth/gameStateValidator.ts` | **Modify** | `flagCheatAttempt` accepts `fingerprintHash?: string` and `deviceId?: string` parameters, denormalizes into `cheat_investigations` insert |
| `src/app/api/game/state/route.ts` | **Modify** | Call `flagCheatAttempt` with the new optional parameters from the request body |

### 2.2 Migrations Applied (Phase 1)

| # | File | SQL (verified shape) | Pre-check |
|---|---|---|---|
| 1 | 041 | `ALTER TABLE public.cheat_investigations ADD COLUMN fingerprint_hash text, ADD COLUMN device_id text; CREATE INDEX idx_cheat_investigations_fingerprint_hash ON public.cheat_investigations (fingerprint_hash) WHERE fingerprint_hash IS NOT NULL; CREATE INDEX idx_cheat_investigations_device_id ON public.cheat_investigations (device_id) WHERE device_id IS NOT NULL;` | `SELECT count(*) FROM public.cheat_investigations` — 6 rows; additive, NULL default, no impact |
| 2 | 042 | `ALTER TABLE public.merge_audit_log ADD COLUMN fingerprint_hash text; CREATE INDEX idx_merge_audit_log_fingerprint_hash ON public.merge_audit_log (fingerprint_hash) WHERE fingerprint_hash IS NOT NULL;` | 0 rows; additive |
| 3 | 043 | `ALTER TABLE public.pending_link_operations ADD COLUMN fingerprint_hash text, ADD COLUMN device_id text;` | 0 rows; additive |
| 4 | 044 | `ALTER TABLE public.admin_actions ADD COLUMN ip_address inet, ADD COLUMN target_id text, ADD COLUMN payload jsonb;` | 3 rows; additive |
| 5 | 047 | `CREATE TABLE public.request_ip_log (id bigserial PRIMARY KEY, endpoint text NOT NULL, ip_hash text NOT NULL, user_id uuid, created_at timestamptz NOT NULL DEFAULT now()); CREATE INDEX idx_request_ip_log_ip_hash ON public.request_ip_log (ip_hash); CREATE INDEX idx_request_ip_log_created_at ON public.request_ip_log (created_at DESC); ALTER TABLE public.request_ip_log ENABLE ROW LEVEL SECURITY; CREATE POLICY "Service role manages request_ip_log" ON public.request_ip_log FOR ALL TO service_role USING (true) WITH CHECK (true);` | No pre-check needed (new table) |
| 6 | 050 | `CREATE OR REPLACE FUNCTION public.unlock_account(p_user_id uuid, p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'unlock_account requires service_role'; END IF; UPDATE public.server_game_state SET is_locked = false, lock_reason = NULL, cheat_flag_count = 0 WHERE user_id = p_user_id; END; $$; REVOKE EXECUTE ON FUNCTION public.unlock_account(uuid, text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.unlock_account(uuid, text) TO service_role;` | Verify `server_game_state` row exists for the test user_id |

### 2.3 Phase 1 Staging Test Checklist

- [ ] Migration 041 applied; `cheat_investigations.fingerprint_hash` and `device_id` columns exist
- [ ] Migration 042 applied; `merge_audit_log.fingerprint_hash` column exists
- [ ] Migration 043 applied; `pending_link_operations.fingerprint_hash` and `device_id` columns exist
- [ ] Migration 044 applied; `admin_actions.ip_address`, `target_id`, `payload` columns exist
- [ ] Migration 047 applied; `request_ip_log` table exists, RLS enabled
- [ ] Migration 050 applied; `unlock_account` function exists, EXECUTE only to `service_role`
- [ ] `cf-connecting-ip` / `x-real-ip` reads work in production-like environment
- [ ] `flagCheatAttempt(userId, type, desc, severity, { fingerprintHash, deviceId })` writes to `cheat_investigations` with the new fields
- [ ] `request_ip_log` is populated on `/api/auth/initialize-guest` hit
- [ ] `request_ip_log` is populated on `/api/auth/recover-by-device` hit
- [ ] `request_ip_log` is populated on `/api/auth/claim-guest` hit
- [ ] `request_ip_log` is populated on `/api/auth/link-identity` hit
- [ ] `request_ip_log` is populated on `/api/auth/confirm-link` hit
- [ ] `link-identity` writes `fingerprint_hash` and `device_id` to `pending_link_operations`
- [ ] `confirm-link` writes `fingerprint_hash` to `merge_audit_log`
- [ ] Middleware sets `x-real-ip` on all requests
- [ ] No 4xx/5xx errors caused by the schema changes
- [ ] The 6 pre-existing users are unaffected

### 2.4 Phase 1 Rollback

| Action | Rollback |
|---|---|
| Migration 041 | `ALTER TABLE public.cheat_investigations DROP COLUMN IF EXISTS fingerprint_hash, DROP COLUMN IF EXISTS device_id;` |
| Migration 042 | `ALTER TABLE public.merge_audit_log DROP COLUMN IF EXISTS fingerprint_hash;` |
| Migration 043 | `ALTER TABLE public.pending_link_operations DROP COLUMN IF EXISTS fingerprint_hash, DROP COLUMN IF EXISTS device_id;` |
| Migration 044 | `ALTER TABLE public.admin_actions DROP COLUMN IF EXISTS ip_address, DROP COLUMN IF EXISTS target_id, DROP COLUMN IF EXISTS payload;` |
| Migration 047 | `DROP TABLE IF EXISTS public.request_ip_log;` |
| Migration 050 | `DROP FUNCTION IF EXISTS public.unlock_account(uuid, text);` |
| Code changes | `git revert` |
| Dependency | `npm uninstall @fingerprintjs/fingerprintjs` |

All Phase 1 rollbacks are non-destructive (additive changes only).

### 2.5 Phase 1 Risk Classification

| Risk | Severity | Notes |
|---|---|---|
| Live DB rejects migration due to column conflict | Low | Pre-check: `SELECT column_name FROM information_schema.columns WHERE table_name = 'X' AND column_name IN (...)` |
| `request_ip_log` grows unboundedly | Low | Documented 30-day retention (deferred to later phase) |
| Fingerprint computation takes too long on init | Low | `Promise.race` with 2-second timeout; falls back to `'unknown'` |
| Middleware reads wrong header in Vercel | Low | Tries `cf-connecting-ip` first, then `x-real-ip`, then `'unknown'` |

### 2.6 Phase 1 Dependency Order

1. Migrations 041–044, 047, 050 first (additive, no behaviour change)
2. Code changes only after migrations succeed
3. Middleware change before route changes (routes depend on `x-real-ip` header being set)
4. `flagCheatAttempt` change before game state route change
5. Client fingerprint library installation before AuthProvider/useMergeFlow changes

---

## 3. PHASE 2 — Lockdown (Behavioural Security)

**Goal:** Close the open-RPC P0 vulnerabilities. Behavioural change. No identity-related enforcement.

### 3.1 Pre-Checks (Mandatory)

Before applying migration 049, run:

```sql
-- 1. Find every caller of each of the 8 functions in src/**/*.{ts,tsx}
--    Confirmed via grep: no anon/authenticated caller exists
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('set_capacity','apply_market_tick','upsert_market_pressure',
                    'upsert_supply_demand','validate_game_action','compute_offline_ticks',
                    'increment_cheat_flag','lock_cheater_account');

-- 2. For market_player_pressure, identify all writers (should be the player only)
SELECT * FROM pg_stat_activity WHERE query ILIKE '%market_player_pressure%';
```

**If any anon/authenticated caller exists for these functions, the call site must be updated to use the service-role client BEFORE applying migration 049.**

### 3.2 Migrations Applied (Phase 2)

| # | File | SQL | Pre-check |
|---|---|---|---|
| 7 | 048 | `DROP POLICY IF EXISTS "Players can upsert own pressure" ON public.market_player_pressure; CREATE POLICY "Players can upsert own pressure" ON public.market_player_pressure FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);` | Verify market tick worker uses service role; verify `/api/game/market/*` client writes are player-only |
| 8 | 049 | Per function: `REVOKE EXECUTE ON FUNCTION <signature> FROM anon, PUBLIC; REVOKE EXECUTE ON FUNCTION <signature> FROM authenticated; GRANT EXECUTE ON FUNCTION <signature> TO service_role;` (8 functions total) | As above — confirm zero anon/authenticated callers exist before applying |

### 3.3 Phase 2 Staging Test Checklist

- [ ] All 4 anon + 2 Google test users can still sign in
- [ ] `increment_cheat_flag` callable by service role only (anon and authenticated get 42501 / permission denied)
- [ ] `set_capacity` callable by service role only
- [ ] `apply_market_tick` callable by service role only
- [ ] `upsert_market_pressure` / `upsert_supply_demand` callable by service role only
- [ ] `validate_game_action` / `compute_offline_ticks` callable by service role only
- [ ] `lock_cheater_account` callable by service role only
- [ ] `market_player_pressure` writes by the player succeed
- [ ] `market_player_pressure` writes by another user (different `user_id`) are rejected
- [ ] All existing routes that use these RPCs continue to work (they use service-role client)
- [ ] The 51 existing `rate_limits` rows are unaffected
- [ ] The 6 existing `cheat_investigations` rows are unaffected

### 3.4 Phase 2 Rollback

| Action | Rollback |
|---|---|
| Migration 048 | `DROP POLICY IF EXISTS "Players can upsert own pressure" ON public.market_player_pressure; CREATE POLICY "Players can upsert own pressure" ON public.market_player_pressure FOR ALL TO authenticated USING (true) WITH CHECK (true);` (restores the broken policy; emergency only — re-introduces F-10) |
| Migration 049 (per function) | `GRANT EXECUTE ON FUNCTION <signature> TO authenticated; GRANT EXECUTE ON FUNCTION <signature> TO anon;` (re-opens P0; last-resort only) |

### 3.5 Phase 2 Risk Classification

| Risk | Severity | Mitigation |
|---|---|---|
| `set_capacity` lockdown breaks an unknown caller | High | Pre-check finds all callers in `src/**`; if any anon/authenticated caller exists, fix the caller first |
| `market_player_pressure` RLS fix breaks the market tick worker | High | Verify the market tick uses service role before applying; if it uses anon/authenticated, switch to service role first |
| Lockdown fails to apply due to a permission error | High | If `GRANT EXECUTE TO service_role` fails (shouldn't), abort and investigate before retrying |
| Lockdown succeeds but the cron job breaks | High | The `cleanup_orphan_anon_users` (Phase 3) is not yet deployed; no risk of pre-mature cleanup |
| `market_player_pressure` policy applied without pre-check | High | Staging dry-run: create a test row as another user, confirm rejection, then apply to production |

### 3.6 Phase 2 Dependency Order

1. Migration 048 first (RLS fix; behaviour change but not permission change)
2. Migration 049 second (permission change; highest risk)
3. Code changes only after both migrations succeed (no Phase 2 code changes — all code is in Phase 1 or Phase 3)

---

## 4. PHASE 3 — Cleanup + Behavior (Final)

**Goal:** Cleanup job. Behaviour change in `claim-guest` and `link-identity` (Google-anchored lock checks).

### 4.1 Files to Modify (Phase 3)

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/051_cleanup_orphan_anon_users.sql` | **Create** | `cleanup_orphan_anon_users()` RPC + `pg_cron` schedule (daily 03:00) |
| `src/app/api/auth/claim-guest/route.ts` | **Modify (revised)** | Before the table-reassignment loop, query `server_game_state.is_locked` for `oldIdentity.user_id`. If `is_locked = true`, return 403 with code `previous_account_locked`. **No Google-derived lookup.** |
| `src/app/api/auth/link-identity/route.ts` | **Modify (revised)** | Before creating the `pending_link_operations` row, query `server_game_state.is_locked` for `auth.userId` (the Google `user_id`). If `is_locked = true`, return 403. **No derived lookup.** |

### 4.2 Migration Applied (Phase 3)

| # | File | SQL | Pre-check |
|---|---|---|---|
| 9 | 051 | `CREATE OR REPLACE FUNCTION public.cleanup_orphan_anon_users() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE deleted_count integer; BEGIN IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'cleanup_orphan_anon_users requires service_role'; END IF; WITH orphans AS (SELECT u.id FROM auth.users u WHERE u.is_anonymous = true AND u.created_at < now() - interval '30 days' AND NOT EXISTS (SELECT 1 FROM public.server_game_state sgs WHERE sgs.user_id = u.id) AND NOT EXISTS (SELECT 1 FROM public.guest_identities gi WHERE gi.user_id = u.id)) DELETE FROM auth.users WHERE id IN (SELECT id FROM orphans); GET DIAGNOSTICS deleted_count = ROW_COUNT; RETURN deleted_count; END; $$; REVOKE EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.cleanup_orphan_anon_users() TO service_role; SELECT cron.schedule('cleanup-orphan-anon', '0 3 * * *', $$SELECT public.cleanup_orphan_anon_users()$$);` | Verify `pg_cron` extension is enabled; verify `auth.users` has no real users < 30 days old with no game state |

### 4.3 Phase 3 Staging Test Checklist

- [ ] `cleanup_orphan_anon_users` dry-run with `interval '60 days'` returns 0
- [ ] `cleanup_orphan_anon_users` with `interval '30 days'` returns 0
- [ ] No real users are deleted
- [ ] `claim-guest` with locked `oldIdentity.user_id` returns 403 + `previous_account_locked` (test with the live-locked user `d1af2ba4-…`)
- [ ] `claim-guest` with unlocked `oldIdentity.user_id` succeeds (test with a clean anon)
- [ ] `link-identity` with locked Google `user_id` returns 403 (test: lock a Google user via `increment_cheat_flag` and attempt to link)
- [ ] `link-identity` with unlocked Google `user_id` succeeds
- [ ] A legitimate user on a shared family PC can sign in, play, link Google, sign out, sign in anon, recover, claim — no fingerprint denial at any step
- [ ] The cron job is scheduled correctly (verify `SELECT * FROM cron.job;`)
- [ ] The 6 pre-existing users are unaffected

### 4.4 Phase 3 Rollback

| Action | Rollback |
|---|---|
| Migration 051 | `SELECT cron.unschedule('cleanup-orphan-anon'); DROP FUNCTION IF EXISTS public.cleanup_orphan_anon_users();` |
| `claim-guest` lock check | `git revert` |
| `link-identity` lock check | `git revert` |

The Phase 3 lock checks are the **highest-risk behaviour change** in the entire plan. If the staging test with the live-locked user `d1af2ba4-…` does not return 403, **STOP** and investigate before continuing.

### 4.5 Phase 3 Risk Classification

| Risk | Severity | Mitigation |
|---|---|---|
| `cleanup_orphan_anon_users` deletes a real user | High | Dry-run with 60-day window first; 30-day window is conservative; filter is `no game state AND no guest_identities`; only 4 anon users exist today, all created today (within 24h); no real user can be deleted |
| `claim-guest` lock check is too strict (blocks legitimate recovery) | High | The test with a clean anon must pass. The check only triggers when `is_locked = true`, which today affects only the one user `d1af2ba4-…` |
| `link-identity` lock check is too strict (blocks legitimate Google users) | High | Today no Google user is locked. The check is on the signed-in Google `user_id`, which is always known. |
| `pg_cron` extension not enabled | Medium | Pre-check before applying; if not enabled, skip `cron.schedule` line, enable extension, then run manually |
| `cleanup_orphan_anon_users` race condition | Medium | Function is `SECURITY DEFINER` with explicit `auth.role() = 'service_role'` check; only the cron job or a manual service-role call can invoke it |

### 4.6 Phase 3 Dependency Order

1. `claim-guest` and `link-identity` lock checks are dependent on Phase 1 (middleware IP capture, audit columns) and Phase 2 (RPC lockdown) being complete
2. `claim-guest` lock check depends on `server_game_state.is_locked` being queryable — this is the existing `isAccountLocked` helper
3. `link-identity` lock check depends on the Google `auth.userId` being available — already available via `verifyAuth()`
4. Migration 051 is independent of the lock checks and can be applied at any time during Phase 3
5. Order of code changes: `claim-guest` first, then `link-identity` (so the test for the locked user `d1af2ba4-…` can validate the `claim-guest` change first)

---

## 5. Production Validation Checklist (Post-Execution)

After all three phases pass staging:

- [ ] All 9 migrations visible in `supabase_migrations.schema_migrations`
- [ ] `increment_cheat_flag` is callable by `service_role` only (verified via `has_function_privilege`)
- [ ] `set_capacity`, `apply_market_tick`, `upsert_market_pressure`, `upsert_supply_demand`, `validate_game_action`, `compute_offline_ticks`, `lock_cheater_account` are callable by `service_role` only
- [ ] `market_player_pressure` RLS policy is `auth.uid() = user_id`
- [ ] `cheat_investigations.fingerprint_hash` column exists and is populated on new `flagCheatAttempt` calls
- [ ] `merge_audit_log.fingerprint_hash` column exists and is populated on new `confirm-link` calls
- [ ] `pending_link_operations.fingerprint_hash` column exists and is populated on new `link-identity` calls
- [ ] `request_ip_log` table exists and is populated on all auth-route hits
- [ ] `unlock_account` function exists, callable by `service_role` only
- [ ] `cleanup_orphan_anon_users` function exists, callable by `service_role` only, scheduled via `pg_cron`
- [ ] `claim-guest` returns 403 for locked `oldIdentity.user_id`
- [ ] `link-identity` returns 403 for locked Google `user_id`
- [ ] The 6 pre-existing users are unaffected (1 locked, 1 with `cheat_flag_count=2`, 4 clean)
- [ ] All existing `cheat_investigations` rows are preserved
- [ ] All existing `rate_limits` rows are preserved
- [ ] All existing `support_tickets`, `support_messages`, `waitlist_entries` rows are preserved

---

## 6. Files Changed — Summary

| Phase | New Files | Modified Files |
|---|---|---|
| 1 | `supabase/migrations/041_alter_cheat_investigations.sql`, `042_alter_merge_audit_log.sql`, `043_alter_pending_link_operations.sql`, `044_alter_admin_actions.sql`, `047_create_request_ip_log.sql`, `050_create_unlock_account_rpc.sql`, `src/lib/auth/fingerprint.ts`, `src/app/api/auth/request-ip-log-helper.ts` | `src/middleware.ts`, `package.json`, `src/components/providers/AuthProvider.tsx`, `src/lib/hooks/useMergeFlow.ts`, `src/app/api/auth/initialize-guest/route.ts`, `src/app/api/auth/recover-by-device/route.ts`, `src/app/api/auth/claim-guest/route.ts`, `src/app/api/auth/link-identity/route.ts`, `src/app/api/auth/confirm-link/route.ts`, `src/lib/auth/gameStateValidator.ts`, `src/app/api/game/state/route.ts` |
| 2 | — | — (no code changes; migrations only) |
| 3 | `supabase/migrations/051_cleanup_orphan_anon_users.sql` | `src/app/api/auth/claim-guest/route.ts`, `src/app/api/auth/link-identity/route.ts` |

**Total: 9 new migration files, 2 new code files, 13 modified code files.**

**No files outside the approved scope are touched.** No refactoring of unrelated systems. No changes to checksum, economy, game balance, cloud save, or anti-cheat logic except approved audit enrichment.

---

## 7. Execution Constraints (Hard Rules)

1. **No code is written outside the files listed in §6.** Every other file is unchanged.
2. **No changes to the checksum system** (HMAC, `clientChecksum`, `state_hash`).
3. **No changes to the economy system** (markets, prices, trades, supply/demand).
4. **No changes to game balance** (buildings, research, workers, transport).
5. **No changes to the cloud save flow** (heartbeat, offline ticks, state versioning) except the additive `flagCheatAttempt` enrichment.
6. **No fingerprint/device_id/IP enforcement paths** are added.
7. **No new UNIQUE constraints** on `fingerprint` or `fingerprint_hash` (rejected by policy).
8. **No `is_fingerprint_banned` RPC** (rejected by policy).
9. **No change to `isAccountLocked` semantics** (still keyed on `user_id` only; no fingerprint/device_id/IP walk).
10. **No change to the `cheat_investigations` schema** beyond adding two columns.
11. **No change to the `merge_audit_log` schema** beyond adding one column.
12. **No change to the `pending_link_operations` schema** beyond adding two columns.

---

## 8. Staging Test Plan (Pre-Production Gate)

Before any production migration, run this 10-test checklist in a staging project:

| # | Test | Expected Result |
|---|---|---|
| 1 | Apply all 9 migrations to staging | All succeed; `schema_migrations` has 9 new rows |
| 2 | `isAccountLocked(d1af2ba4-…)` from service role | Returns `{ locked: true, reason: 'Auto-locked after 3 cheat flags' }` |
| 3 | New anon signs in with fingerprint, calls `initialize-guest` | `guest_identities.fingerprint_hash` is populated |
| 4 | `recover-by-device` returns `fingerprint_hash` in response | Response includes the stored hash |
| 5 | `link-identity` from same device | `pending_link_operations.fingerprint_hash` populated |
| 6 | `confirm-link` | `merge_audit_log.fingerprint_hash` populated |
| 7 | `flagCheatAttempt` with new params | `cheat_investigations.fingerprint_hash` populated |
| 8 | All 5 auth routes hit | `request_ip_log` has 5+ rows |
| 9 | `claim-guest` with locked `oldIdentity.user_id` | 403 + `previous_account_locked` |
| 10 | `cleanup_orphan_anon_users` dry-run | Returns 0 |

**If any test fails, STOP and root-cause before continuing to production.**

---

## 9. Production Rollout Plan

After staging passes all 10 tests:

1. **Apply Phase 1 migrations 041–044, 047, 050** (6 migrations, additive only, no risk)
2. **Deploy Phase 1 code** (middleware, routes, fingerprint library, client)
3. **Verify Phase 1 in production** (audit columns populated, IP logging works)
4. **Apply Phase 2 migration 048** (RLS fix)
5. **Apply Phase 2 migration 049** (RPC lockdown — highest risk)
6. **Verify Phase 2 in production** (anon can no longer call locked RPCs)
7. **Deploy Phase 3 code** (`claim-guest` and `link-identity` lock checks)
8. **Verify Phase 3 in production** (locked user `d1af2ba4-…` is refused re-claim)
9. **Apply Phase 3 migration 051** (cleanup job + cron)
10. **Verify Phase 3 in production** (cron scheduled, function callable)

**Between steps 5 and 6, monitor for 15 minutes.** If any production route returns 5xx unexpectedly, the lockdown is too aggressive — rollback migration 049 immediately.

**Between steps 8 and 9, monitor for 15 minutes.** If any legitimate recovery is blocked, rollback the Phase 3 code changes.

---

## 10. Final Enforcement Model (Authoritative)

```
claim-guest
    → oldIdentity.user_id
    → server_game_state.is_locked
    → allow / deny (403 + previous_account_locked)

link-identity
    → auth.userId (Google)
    → server_game_state.is_locked
    → allow / deny (403 + account_locked)

confirm-link
    → existing Google enforcement review
    → keep

fingerprint
    → correlation only
    → never enforcement

device_id
    → recovery only
    → never enforcement

IP
    → analytics only
    → never enforcement
```

**Lock authority:** `server_game_state.is_locked` (single source of truth, per `user_id`).
**Lock trigger:** `flagCheatAttempt` → `increment_cheat_flag` RPC → `is_locked = true` at `cheat_flag_count >= 3`.
**Lock admin:** `unlock_account` RPC (service_role only).
**No fingerprint, device_id, or IP may lock or unlock an account.**

---

## 11. Final State

After all 3 phases:

- **Migrations applied:** 9 (041, 042, 043, 044, 047, 048, 049, 050, 051)
- **Code changes:** 13 files modified, 2 new files, 1 new dependency
- **Behaviour changes:**
  - `claim-guest` refuses re-claim for locked `oldIdentity.user_id` (Google-anchored via the `user_id` that was linked, or user_id-anchored for guests)
  - `link-identity` refuses linking for locked Google `user_id`
  - `market_player_pressure` RLS restricts to own row
  - 8 RPCs locked to `service_role` only (closes F-1, F-2, F-3, F-12)
  - `admin_actions` audit log columns populated (F-5)
  - `merge_audit_log`, `pending_link_operations`, `cheat_investigations` enriched with fingerprint and device_id
  - `request_ip_log` populated on all auth routes
  - `cleanup_orphan_anon_users` scheduled via `pg_cron` (F-14)
  - `unlock_account` RPC available (F-13)
- **No false-positive paths introduced.**
- **No new enforcement uses fingerprint, device_id, or IP.**

---

## 12. EXECUTION START

Execution begins at §2 Phase 1, following the order in §1. Each phase ends with its staging test checklist (§2.3, §3.3, §4.3) before proceeding to the next phase. After all phases, the full regression audit (§5) runs.
