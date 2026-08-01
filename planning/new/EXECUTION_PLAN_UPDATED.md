# EXECUTION PLAN — Identity & Anti-Cheat Hardening (UPDATED 2026-06-19, EOD)

> **Date:** 2026-06-19
> **Project:** IndustryX (Factory Dominion) — `db.wkkzqtseqwcyyyezroqq.supabase.co`
> **Status:** ✅ **ALL 3 PHASES APPLIED TO LIVE DB** · Code changes complete · TypeScript + ESLint clean
> **Original:** `planning/new/EXECUTION_PLAN.md` (2026-06-18) preserved unmodified.
> **Policy:** Google Account = hard enforcement; Fingerprint = correlation; Device ID = recovery; IP = analytics. **No fingerprint/device_id/IP may auto-lock, auto-ban, deny login, deny guest creation, or deny recovery.**

---

## 0. Execution Status Snapshot (2026-06-19, EOD)

| Task | Status | Notes |
|---|---|---|
| **Phase 1 migrations 041, 042, 043, 044, 047, 050** | ✅ **APPLIED** | All 6 applied 2026-06-19. `unlock_account` grants needed extra REVOKE (BUG-031) — fixed at apply time + on-disk. |
| **`src/lib/auth/fingerprint.ts`** (new) | ✅ CREATED + clean | `@fingerprintjs/fingerprintjs@^4.6.2` wrapper, 24h localStorage cache, 2s timeout |
| **`src/app/api/auth/request-ip-log-helper.ts`** (new) | ✅ CREATED + clean | `logRequestIp`, `hashIp`, `extractClientIp` (cf-connecting-ip → x-real-ip → x-forwarded-for) |
| **`package.json`** | ✅ UPDATED | `@fingerprintjs/fingerprintjs@^4.6.2` |
| **`src/middleware.ts`** | ✅ MODIFIED + clean | IP capture, sets `x-real-ip` on all responses |
| **`src/lib/auth/gameStateValidator.ts`** | ✅ MODIFIED + clean | `flagCheatAttempt` extended with `FlagCheatAttemptOptions { fingerprintHash?, deviceId? }` |
| **`src/app/api/game/state/route.ts`** | ✅ MODIFIED + clean | Passes fingerprint/deviceId to `flagCheatAttempt` |
| **`src/app/api/auth/initialize-guest/route.ts`** | ✅ MODIFIED + clean | IP log + `fingerprintHash` echo |
| **`src/app/api/auth/recover-by-device/route.ts`** | ✅ MODIFIED + clean | IP log + reads fingerprintHash from body + echoes + updates identity if blank |
| **`src/app/api/auth/claim-guest/route.ts`** | ✅ MODIFIED + clean | IP log + **Phase 3 lock check** (E1 closed) |
| **`src/app/api/auth/link-identity/route.ts`** | ✅ MODIFIED + clean | IP log + fingerprint/device_id/ip_hash/user_agent + **Phase 3 Google lock check** (E8 closed) |
| **`src/app/api/auth/confirm-link/route.ts`** | ✅ MODIFIED + clean | IP log + writes fingerprint_hash/actor_ip_hash/actor_user_agent |
| **`src/components/providers/AuthProvider.tsx`** | ✅ MODIFIED + clean | Sends fingerprintHash in `recover-by-device` and `initialize-guest` |
| **`src/lib/hooks/useMergeFlow.ts`** | ✅ MODIFIED + clean | Sends fingerprintHash + userAgent to `link-identity` |
| **TypeScript compile** | ✅ Exit 0 | 13 modified + 2 new files |
| **ESLint (modified files)** | ✅ Exit 0 | `claim-guest/route.ts` + `link-identity/route.ts` |
| **Phase 2 migrations 048, 049** | ✅ **APPLIED** | RLS `auth.uid() = user_id` on `market_player_pressure`; 8 RPCs service_role-only. `has_function_privilege` triple `false/false/true` for all 8. |
| **Phase 3 migration 051** | ✅ **APPLIED** | `cleanup_orphan_anon_users()` SECURITY DEFINER, service_role only. `pg_cron` NOT installed — schedule line omitted. Dry-run: 0 deletions. |
| **Live DB tests (E2E)** | 🔴 PENDING MANUAL | 40 staging test items require dev server + `Invoke-RestMethod` |

### BUG-031 (found and fixed during this execution)

`REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC` is insufficient in Supabase. anon and authenticated have **explicit** grants that need separate `REVOKE`. Caught at apply time on `unlock_account` — all 4 roles (postgres, anon, authenticated, service_role) had EXECUTE despite the "correct" SQL. Fixed live via `execute_sql`. On-disk migration 050 patched with the 3-line REVOKE pattern + comment. Migration 049 was written correctly from the start (lesson applied during live execution). See `BUGS.md` BUG-031 for full analysis.

---

## 1. Migration Order (Authoritative — All Applied)

| # | File | Phase | Status | Content |
|---|---|---|---|---|
| 1 | `041_alter_cheat_investigations.sql` | 1 | ✅ APPLIED | `fingerprint_hash`, `device_id` + 2 indexes |
| 2 | `042_alter_merge_audit_log.sql` | 1 | ✅ APPLIED | `fingerprint_hash` + index |
| 3 | `043_alter_pending_link_operations.sql` | 1 | ✅ APPLIED | `fingerprint_hash`, `device_id` |
| 4 | `044_alter_admin_actions.sql` | 1 | ✅ APPLIED | `ip_address inet`, `target_id text`, `payload jsonb` |
| 5 | `047_create_request_ip_log.sql` | 1 | ✅ APPLIED | new table + RLS + 2 indexes |
| 6 | `050_create_unlock_account_rpc.sql` | 1 | ✅ APPLIED + BUG-031 fixed | `unlock_account(p_user_id uuid, p_note text)` |
| 7 | `048_rls_market_player_pressure.sql` | 2 | ✅ APPLIED | RLS `auth.uid() = user_id` |
| 8 | `049_lockdown_security_rpcs.sql` | 2 | ✅ APPLIED | 8 RPCs → service_role only |
| 9 | `051_cleanup_orphan_anon_users.sql` | 3 | ✅ APPLIED | `cleanup_orphan_anon_users()` (no cron) |

---

## 2. Final Enforcement Model (Authoritative)

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
    → existing Google enforcement review (unchanged)

fingerprint → correlation only (never enforcement)
device_id   → recovery only (never enforcement)
IP          → analytics only (never enforcement)
```

**Lock authority:** `server_game_state.is_locked` (single source of truth, per `user_id`).
**Lock trigger:** `flagCheatAttempt` → `increment_cheat_flag` RPC → `is_locked = true` at `cheat_flag_count >= 3`.
**Lock admin:** `unlock_account` RPC (service_role only).
**No fingerprint, device_id, or IP may lock or unlock an account.**

---

## 3. Hard Rules (Unchanged)

1. No code written outside approved files.
2. No changes to checksum / economy / balance.
3. No new UNIQUE constraints on fingerprint.
4. No `is_fingerprint_banned` RPC.
5. No change to `isAccountLocked` semantics (still keyed on `user_id` only).
6. No fingerprint/device_id/IP enforcement paths.

---

## 4. Completed Work (Files Created / Modified)

### New files (11)
1. `supabase/migrations/041_alter_cheat_investigations.sql` — APPLIED
2. `supabase/migrations/042_alter_merge_audit_log.sql` — APPLIED
3. `supabase/migrations/043_alter_pending_link_operations.sql` — APPLIED
4. `supabase/migrations/044_alter_admin_actions.sql` — APPLIED
5. `supabase/migrations/047_create_request_ip_log.sql` — APPLIED
6. `supabase/migrations/048_rls_market_player_pressure.sql` — APPLIED
7. `supabase/migrations/049_lockdown_security_rpcs.sql` — APPLIED
8. `supabase/migrations/050_create_unlock_account_rpc.sql` — APPLIED + BUG-031 fix
9. `supabase/migrations/051_cleanup_orphan_anon_users.sql` — APPLIED
10. `src/lib/auth/fingerprint.ts`
11. `src/app/api/auth/request-ip-log-helper.ts`

### Modified files (13)
1. `package.json` — added `@fingerprintjs/fingerprintjs@^4.6.2`
2. `src/middleware.ts` — IP capture + `x-real-ip` header
3. `src/lib/auth/gameStateValidator.ts` — `flagCheatAttempt` extended
4. `src/app/api/game/state/route.ts` — passes fingerprint/deviceId
5. `src/app/api/auth/initialize-guest/route.ts` — IP log + fingerprintHash echo
6. `src/app/api/auth/recover-by-device/route.ts` — IP log + fingerprintHash
7. `src/app/api/auth/claim-guest/route.ts` — IP log + **Phase 3 lock check**
8. `src/app/api/auth/link-identity/route.ts` — IP log + audit fields + **Phase 3 Google lock check**
9. `src/app/api/auth/confirm-link/route.ts` — IP log + audit fields
10. `src/components/providers/AuthProvider.tsx` — sends fingerprintHash
11. `src/lib/hooks/useMergeFlow.ts` — sends fingerprintHash + userAgent
12. `BUGS.md` — BUG-031 added
13. `planning/new/EXECUTION_PLAN_UPDATED.md` — this file

---

## 5. Staging Test Checklists (Manual — Dev Server Required)

Use PowerShell `Invoke-RestMethod` to call `http://localhost:3000/api/...`. Reference template:

```powershell
$headers = @{ "Content-Type" = "application/json" }
$body = @{ newUserId = "..."; deviceId = "..."; fingerprintHash = "..." } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/claim-guest" -Method POST -Headers $headers -Body $body
```

### 5.1 Phase 1 (18 items)
- [ ] All 6 migrations applied (already verified ✅)
- [ ] `cf-connecting-ip` / `x-real-ip` reads work
- [ ] High-risk `/api/game/state` POST → `cheat_investigations.fingerprint_hash` populated within ~100ms
- [ ] `request_ip_log` has 5+ rows after hitting all 5 auth routes
- [ ] `link-identity` with `fingerprintHash` → `pending_link_operations.fingerprint_hash` populated
- [ ] `confirm-link` → `merge_audit_log.fingerprint_hash` populated
- [ ] Middleware sets `x-real-ip` on all responses
- [ ] No 4xx/5xx errors from schema changes
- [ ] 6 pre-existing users unaffected
- [ ] `unlock_account` test invocation clears lock (use savepoint to roll back)

### 5.2 Phase 2 (12 items)
- [ ] All 4 anon + 2 Google test users can still sign in
- [ ] `increment_cheat_flag` callable by service_role only (anon/auth get 42501)
- [ ] 8 RPCs callable by service_role only
- [ ] `market_player_pressure` self-write succeeds
- [ ] `market_player_pressure` cross-user write rejected
- [ ] Existing routes (`/api/game/trade`, `/api/market/tick`) still work
- [ ] 51 `rate_limits` rows preserved
- [ ] 6 `cheat_investigations` rows preserved

### 5.3 Phase 3 (10 items)
- [ ] `cleanup_orphan_anon_users` 60d window → 0
- [ ] `cleanup_orphan_anon_users` 30d window → 0
- [ ] No real users deleted
- [ ] `claim-guest` with locked `d1af2ba4-…` → 403 + `previous_account_locked`
- [ ] `claim-guest` with clean anon → succeeds
- [ ] `link-identity` with locked Google user → 403
- [ ] `link-identity` with unlocked Google user → succeeds
- [ ] Shared-family-PC flow works end-to-end
- [ ] 6 pre-existing users unaffected

### 5.4 Full Regression Audit
Guest creation → recovery → claim → Google link → confirm-link → cloud save → cloud load → admin players → admin investigations → lock flow → unlock flow → rate limits → audit logs.

---

## 6. Known Issues / Errors

1. **MCP `apply_migration` parallel-call race**: 2+ `apply_migration` calls in same batch share timestamp → PK conflict on `schema_migrations_pkey`. **Workaround**: sequential with 2s sleep. Future agents: one migration per call.
2. **`@fingerprintjs/fingerprintjs` resolved to `^4.6.2`** (not `^4.5.1` as plan said). 4.x API compatible.
3. **BUG-031**: on-disk migration 050 fixed. See `BUGS.md`.
4. **`pg_cron` not installed** on `wkkzqtseqwcyyyezroqq`. Migration 051 created without `cron.schedule`. If/when `pg_cron` is added, run the schedule call manually: `SELECT cron.schedule('cleanup-orphan-anon', '0 3 * * *', $$SELECT public.cleanup_orphan_anon_users()$$);`
5. **`request-ip-log-helper.ts` was initially placed in `src/lib/auth/`** — moved to `src/app/api/auth/`. No code change.
6. **`useMergeFlow.ts` `userAgent` field** in `link-identity` body — server reads from body; IP from headers. Correct.

---

## 7. Relevant Files

**Planning / verification:**
- `planning/new/EXECUTION_PLAN.md` (original 2026-06-18, preserved)
- `planning/new/EXECUTION_PLAN_UPDATED.md` (this file)
- `planning/new/PRE_EXECUTION_VERIFICATION.md`
- `planning/ARCHITECTURE_AUDIT_REPORT_2026_06_18.md`
- `planning/ARCHITECTURE_AUDIT_HANDOFF_2026_06_18.md`

**Migrations (all 9 created and applied):** see §1.

**Code:** see §4.

**Pre-existing code (unchanged):**
- `supabase/migrations/012_atomic_cheat_flag.sql` — defines `increment_cheat_flag` RPC (now service_role-only)
- `src/app/api/auth/{callback,me,migrate-guest,update-profile}/route.ts` — not in scope

---

## 8. Recommended Next Steps

1. Run Phase 1/2/3 staging checklists (§5.1, 5.2, 5.3) — use `Invoke-RestMethod` scripts.
2. Run full regression audit (§5.4).
3. **(Step 5 — STOP) See §9 for `pg_cron` enablement instructions.**

---

## 9. Phase 3 Test ID (Canonical)

The locked user `d1af2ba4-1aa6-4320-a4f8-64faaec2d732` is the canonical test case for the `claim-guest` lock check:
- Anonymous Supabase user (not Google-linked)
- `server_game_state.is_locked = true`
- `cheat_flag_count = 3`
- `lock_reason = 'Auto-locked after 3 cheat flags'`
- No `profiles.linked_account_id` (never linked Google)

After Phase 3, attempting `claim-guest` with this user's `oldIdentity.user_id` (via a `guest_identities` row with `device_id` matching the test device) must return 403 with `code: 'previous_account_locked'`. Single most important test in the entire plan.
