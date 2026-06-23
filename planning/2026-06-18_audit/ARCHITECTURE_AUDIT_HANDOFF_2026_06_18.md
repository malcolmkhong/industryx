# IndustriaX Architecture Audit — Session Handoff

> **Status:** Discovery complete in file-only mode. Live data verification pending — blocked on Supabase MCP tool injection. The next session must use the Supabase MCP, NOT `supabase/migrations/*.sql`, to verify any claim about live data.

---

## 1. Why this handoff exists

The audit was started on **2026-06-18** with a 10-section scope (frontend, backend, DB, identity, ban/lock, device tracking, fingerprint, IP, security gaps, summary). Mid-audit, the user instructed: **"do not use this as standard!! `A:\industryx\industryx\supabase`, use supabase MCP"**. Subsequent attempts to reach the Supabase MCP server failed — the server was discovered by the MCP host (`Discovered 29 tools`) but the tool catalog was never injected into the agent session. This handoff captures everything file-source can establish so the next session can finish with live data.

---

## 2. Verified facts about the environment

| Check | Result | Source |
|---|---|---|
| Supabase MCP registered (remote `https://mcp.supabase.com/mcp`) | ✓ in `%APPDATA%\Code\User\mcp.json` | `Get-Content` of user mcp.json |
| Supabase MCP registered (local stdio `@supabase/mcp-server-supabase@0.8.2`) | ✓ in `a:\industryx\industryx\.vscode\mcp.json` | file read |
| Local stdio config has empty input placeholders | ✓ `${input:arg_project_ref}` etc. | file read |
| `mcp__supabase__*` callable from current session | ✗ — not in tool schema | function list inspection |
| Supabase MCP process running | ✗ — only `biome lsp-proxy` and `playwriter` node processes found | `Get-Process` |
| TypeScript `tsc --noEmit` | ✓ exit 0 | terminal |
| `vaul` package | added to `package.json` deps, installed in `node_modules` | npm install + grep |

---

## 3. Audit scope (10 sections, per user)

1. Frontend architecture (guest startup, anon login, device id, fingerprint, recovery, migration, Google login, linking, merge, cloud save/load, client anti-cheat)
2. Backend architecture (every `/api/auth/*`, `/api/game/*`, `/api/player`, admin lock routes, anti-cheat routes)
3. Database architecture (every related table: `guest_identities`, `server_game_state`, `auth.users`, `player_progress`, `cheat_investigations`, `pending_link_operations`, `merge_receipts`, `merge_audit_log`, `rate_limits`, `admin_users`, `admin_actions`, `app_config`, `waitlist_entries`, `support_tickets`, `support_messages`, `player_sessions`, `player_actions`, `research_prerequisites`, `admin_permissions`, `server_market_state`, `market_player_pressure`, `market_supply_demand`, `game_config_*`, `trade_history`, `leaderboard`, `game_config_market_history`, `game_config_market`, `game_config_balancing_rules`, `game_config_seasonal_events`, `game_config_event_templates`, `game_config_weather`, `game_config_daily_rewards`, `game_config_quest_definitions`, `game_config_rank_thresholds`, `game_config_prestige_bonuses`, `game_config_transport`, `game_config_workers`, `game_config_automation`, `game_config_production_chains`, `game_config_production_recipes`, `game_config_resources`, `game_config_buildings`, `game_config_research`, `game_config_mega_projects`, `game_config_game`)
4. Identity model (guest = device id + fingerprint; Google = `auth.users`; trust ranking)
5. Ban / lock architecture (cheat flag → auto-lock at 3; account vs device vs fingerprint vs IP)
6. Device tracking audit
7. Fingerprint audit
8. IP tracking audit
9. Security gap analysis (existing protections, weaknesses, missing protections)
10. Final architecture summary (state diagrams + top 10 findings)

---

## 4. What this session verified (file-only, with caveats)

**Caveat: all of the following is based on `src/**/*.ts` and `supabase/migrations/*.sql`. Nothing was confirmed against the live database.**

### 4.1 Identity — high confidence

- **Guest identity** is built on `auth.users` (Supabase anon) + `guest_identities` row.
- **Device ID** is generated client-side with `crypto.randomUUID()` and stored in `localStorage` under key `factory-dominion-device-id` ([src/components/providers/AuthProvider.tsx:37-46](src/components/providers/AuthProvider.tsx#L37-L46)). Survives reloads; lost on incognito, "Clear browsing data", or a different browser.
- **Fingerprint** is sent in the body of `POST /api/auth/initialize-guest` and stored in two columns: `guest_identities.fingerprint` (raw) and `guest_identities.fingerprint_hash` (sha256 hex). It is **never** used for recovery. Quote: `// device_id is the PRIMARY recovery signal. Fingerprint is NEVER used for recovery.` ([src/app/api/auth/recover-by-device/route.ts:1-2](src/app/api/auth/recover-by-device/route.ts#L1-L2))
- **Google identity** = `auth.users` row with `is_anonymous=false`, obtained via `signInWithOAuth({ provider: 'google' })` and `exchangeCodeForSession` callback at `/api/auth/callback`.
- **Account linking** uses `pending_link_operations` (TTL 24h) → user picks `keep_guest` or `keep_google` → `confirm-link` writes a `merge_receipts` row + `merge_audit_log` row and supersedes the old `guest_identities` row (`superseded_by` + `superseded_at`).
- **Cookie** `factory-dominion-guest-uid` is the primary bridge between the anon session and the linking endpoint. The `link-identity` route has a `deviceId` fallback (added per `AUDIT_FIXES_2026_06_18.md P0-#3`).

### 4.2 Ban / lock — high confidence

- Trigger: any `flagCheatAttempt(userId, type, desc, severity)` call from the app OR the SQL `increment_cheat_flag` RPC.
- Threshold: `cheat_flag_count >= 3` → `is_locked = true`, `lock_reason` set. Source: [src/lib/auth/gameStateValidator.ts:48-49](src/lib/auth/gameStateValidator.ts#L48-L49) (`MAX_CHEAT_FLAGS: 3`); mirrored in [supabase/migrations/012_atomic_cheat_flag.sql](supabase/migrations/012_atomic_cheat_flag.sql) (`v_threshold INTEGER := 3`).
- Two flagging paths:
  1. **App** (service-role `supabase.rpc('increment_cheat_flag', ...)`) — atomic. Lockdown in [supabase/migrations/017_security_hardening_and_cleanup.sql](supabase/migrations/017_security_hardening_and_cleanup.sql) restricts execute to `service_role`.
  2. **DB** trigger `validate_player_save()` on `player_progress` was **dropped** in migration 005. So now flags only come from the app.
- Lock is **account-based only** — `is_locked` lives on `server_game_state.user_id`. There is no per-device or per-fingerprint lock. There is no IP-based lock.

### 4.3 Anti-cheat triggers (file-only)

- `validateGameState` enforces bounds: `MAX_MONEY=1e12`, `MAX_BUILDINGS=500`, `MAX_BUILDING_LEVEL=100`, `MAX_TICK_RATE_PER_SECOND=50`, `MAX_RESOURCE_AMOUNT=1e9`, `MAX_RESEARCH_POINTS=1e9`, `MAX_PRESTIGE_POINTS=1000`, allowed speeds = `[1,2,5,10]`.
- Delta checks: tick must not go backward, money jump cannot exceed `earnedDelta * 1.1 + 50000`, max +5 research per save, max +20 buildings per save.
- **The previous `clientChecksum !== validation.checksum` block has been removed this session** (P0 fix from the original `CHECKSUM_MISMATCH` audit). `clientChecksum` field is still accepted in the request body and `state_hash` is still stored/returned; only the comparison is gone.
- Admin bypass: `isAdminUserId(auth.userId)` is the env-var bootstrap check (`ADMIN_UIDS` comma-separated UUIDs). DB-backed `isAdminUserDb` queries `admin_users` with 60s in-memory cache.

### 4.4 Recovery — high confidence

- `recover-by-device` returns one of:
  - `recovered: true, recoveredAs: 'recovered', userId` — old anon user exists, no linked Google account.
  - `recoveredAs: 'linked_to', googleUserId` — the device is already linked to a Google account.
  - `recovered: false, reason: 'no_identity'` — first visit on this device.
- Client then calls `signInAnonymously` and, if `recoveredAs === 'recovered'`, also calls `claim-guest` to re-assign per-user tables (`server_game_state`, `player_progress`, `player_actions`, `player_sessions`, `market_player_pressure`, `leaderboard_entries`, `support_tickets`) from the old anon user to the new one.
- Comment in [src/app/api/auth/recover-by-device/route.ts:75-84](src/app/api/auth/recover-by-device/route.ts#L75-L84) admits the limitation: `For anon users, this means the recovery returns the userId but the client must then establish a session via signInAnonymously and then merge the identity.`

### 4.5 Migration — high confidence

- `migrate-guest` runs `validateGuestMigration` (rich, economic feasibility checks) and `validateGameState` (bounds, no delta since no previous state).
- Outcomes: `accept`, `accept_with_flag`, `reject` (→ reset to 1000 money, 0 tick, cheat_flag_count=1), or `use_cloud` (cloud state already exists).
- `use_cloud` is hit on every second migration attempt. Player losing their local work to a stale cloud snapshot is a real risk.

### 4.6 IP tracking — high confidence (file-only)

- **Stored only in admin audit tables**: `admin_actions.ip_address` ([src/app/api/admin/market/resources/[id]/route.ts:73](src/app/api/admin/market/resources/%5Bid%5D/route.ts#L73), [src/app/api/admin/market/resources/route.ts:135,202](src/app/api/admin/market/resources/route.ts#L135)) — `request.headers.get('x-forwarded-for') ?? null`.
- **Not stored in player-facing tables**: migration 005 explicitly dropped `player_actions.client_ip` and `player_actions.user_agent`. Migration 004 had `client_ip` on `validated_actions` (table itself was dropped in 005). `player_sessions` still has `client_ip` and `user_agent` columns but the heartbeat route in [src/app/api/game/heartbeat/route.ts:49](src/app/api/game/heartbeat/route.ts#L49) explicitly does **not** write them: `// Upsert session (lean: no session_token, no client_ip, no user_agent)`.
- IP is **not** used for bans, investigations, or analytics. `merge_audit_log` has `actor_ip_hash`, `actor_ip_region`, `actor_user_agent` columns but I did not find any code writing to them — this is a schema/code drift to confirm via MCP.

### 4.7 Fingerprint — high confidence (file-only)

- Sent by client in `POST /api/auth/initialize-guest` body as `fingerprint?: string`.
- Stored in `guest_identities.fingerprint` (TEXT) and `guest_identities.fingerprint_hash` (TEXT, sha256 hex).
- **Never read after being stored** in any code path I traced. No recovery flow uses it. No ban flow uses it. No investigation flow uses it.
- The `claim-guest` route copies the old `fingerprint_hash` to the new anon user. So it's at least preserved across the recovery flow, but never queried.

### 4.8 Device tracking — high confidence

- Only stored in `guest_identities.device_id` (TEXT, indexed).
- `recover-by-device` queries `.eq('device_id', deviceId).eq('is_primary', true)`.
- `link-identity` queries the same way as a fallback when the `factory-dominion-guest-uid` cookie is missing (P0-#3 fix).
- **Bypassable by**: incognito (no `localStorage`), clear browsing data, different browser, different device, different OS user. Each is a brand new deviceId. There is **no** server-side fingerprint-based device recovery.

### 4.9 Capacity / waitlist

- `get_capacity_status()` RPC returns `max=500` (from `app_config.capacity.max`).
- `initialize-guest` returns 503 with `{ error: 'capacity_full', redirect: '/waitlist' }` if full.
- Waitlist entries live in `waitlist_entries` and create a `support_tickets` row when submitted so the existing admin support panel can see them.

### 4.10 Rate limiting

- `RATE_LIMITS` enum in [src/lib/auth/rateLimiter.ts:21-29](src/lib/auth/rateLimiter.ts#L21-L29):
  - `player`: 20/min, best-effort
  - `compute`: 10/min, best-effort
  - `action`: 30/min, fail-closed
  - `sync`: 30/min, fail-closed
  - `config`: 30/min, best-effort
  - `general`: 60/min, best-effort
  - `admin`: 100/min, best-effort
- `claim-guest` is rate-limited **by deviceId** (not by userId), because the new userId hasn't authenticated yet.

### 4.11 Routes confirmed in repo

`src/app/api/auth/`: callback, claim-guest, confirm-link, initialize-guest, link-identity, me, migrate-guest, recover-by-device, update-profile.
`src/app/api/admin/`: actions, admin-actions, admins, audit, economy, investigations, jobs, market, monitoring, permissions, players, stats, support, system-status.
`src/app/api/game/`: action, compute, definitions, heartbeat, market-history, offline, state, trade, trades.
`src/app/api/leaderboard/submit/`.
`src/app/api/player/`.

---

## 5. Findings from this session that are not yet verified against live data

The next session MUST use the Supabase MCP to verify each of these. Suggested SQL queries are in section 6.

1. **Does `cheat_investigations` have any rows at all?** If zero, the auto-lock path has never been exercised in production. If many, which `detection_type` is most common?
2. **How many `server_game_state` rows are `is_locked = true`?** What are the `lock_reason` values?
3. **How many `guest_identities` rows have a non-null `fingerprint_hash`?** If zero, the fingerprint is collected but unused at the link layer.
4. **How many `guest_identities` rows have `superseded_at` set?** Indicates how many guest→Google merges have completed.
5. **How many `pending_link_operations` are currently `status='pending'` and not expired?** Active merge dialogs.
6. **How many `merge_audit_log` rows have non-null `actor_ip_hash`?** Confirms whether the IP/UA capture in that table is actually wired up in code.
7. **Is `player_sessions.client_ip` / `user_agent` actually populated for live users, given that the heartbeat route does not write them?**
8. **Is `increment_cheat_flag` callable from `authenticated` role?** The migration 017 lockdown is in the file, but was it actually applied?
9. **Does `guest_identities` have any unique constraint on `(device_id, is_primary=true)`?** If not, the recovery flow could match multiple rows.
10. **What does the `pg_proc` signature of `increment_cheat_flag` look like in production?** Migration 012 redefines it with 4 params; migration 004's original has 4 params too. But migration 017's `REVOKE` uses the 4-param signature. Confirm there's no 3-param/5-param shadow.

---

## 6. Recommended SQL queries for the next session

```sql
-- 0. Project / schema sanity
select current_database(), current_user, version();

-- 1. cheat_investigations summary
select detection_type, severity, status, count(*)
from public.cheat_investigations
group by 1,2,3
order by count(*) desc;

-- 2. Locked accounts
select count(*) as locked_total,
       count(*) filter (where cheat_flag_count >= 3) as threshold_locked
from public.server_game_state
where is_locked = true;

select lock_reason, count(*)
from public.server_game_state
where is_locked = true
group by 1 order by 2 desc;

-- 3. fingerprint coverage
select
  count(*) as total,
  count(*) filter (where fingerprint_hash is not null) as with_fp_hash,
  count(*) filter (where fingerprint is not null and fingerprint <> '') as with_fp_raw
from public.guest_identities;

-- 4. merge history
select
  count(*) as total,
  count(*) filter (where superseded_at is not null) as superseded,
  count(*) filter (where is_primary) as primary_rows
from public.guest_identities;

-- 5. pending merges
select count(*) from public.pending_link_operations
where status = 'pending' and expires_at > now();

-- 6. merge audit log IP capture
select count(*) as total,
       count(*) filter (where actor_ip_hash is not null) as with_ip_hash,
       count(*) filter (where actor_user_agent is not null) as with_ua
from public.merge_audit_log;

-- 7. session IP/UA in live data
select count(*) as total,
       count(*) filter (where client_ip is not null) as with_ip,
       count(*) filter (where user_agent is not null) as with_ua
from public.player_sessions;

-- 8. SECURITY DEFINER grants
select proname,
       has_function_privilege('anon', oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', oid, 'EXECUTE') as svc_exec
from pg_proc p join pg_namespace n on p.pronamespace = n.oid
where n.nspname = 'public' and p.prosecdef = true
order by proname;

-- 9. guest_identities indexes / constraints
select indexname, indexdef from pg_indexes
where schemaname='public' and tablename='guest_identities';

select conname, contype, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.guest_identities'::regclass;

-- 10. actual signature of increment_cheat_flag
select proname, pg_get_function_identity_arguments(oid), prosecdef
from pg_proc p join pg_namespace n on p.pronamespace = n.oid
where n.nspname='public' and proname='increment_cheat_flag';
```

---

## 7. Prompt for the next session

> You are continuing an architecture audit of the IndustriaX (Factory Dominion) codebase at `A:\industryx\industryx`. The full 10-section scope is documented in `planning/ARCHITECTURE_AUDIT_HANDOFF_2026_06_18.md` and the relevant code is in `src/app/api/`, `src/lib/auth/`, `src/lib/hooks/cloudSync/`, `src/lib/hooks/useMergeFlow.ts`, and `src/components/providers/AuthProvider.tsx`.
>
> **Hard requirement: use the Supabase MCP for any data verification. Do NOT use `supabase/migrations/*.sql` as a substitute for live data.** The MCP server is registered as `com.supabase/mcp` (remote) and `@supabase/mcp-server-supabase` (stdio, in `.vscode/mcp.json`). The tools you should call are `mcp__supabase__list_projects`, `mcp__supabase__list_tables`, `mcp__supabase__execute_sql`, and friends. If the tools are not in your schema, instruct the user to (a) confirm the MCP server is `Running` in the MCP panel, then (b) start a new chat session so the tool catalog is re-injected.
>
> Section 5 of the handoff lists 10 specific findings that need live verification. Section 6 has the SQL. Run those first, then complete the 10-section audit using both the SQL output and the code references. Do not modify code. The final report should include confidence labels (`verified-live`, `code-only`, `migration-file-only`) on every claim.

---

## 8. Files changed this session (for context)

- [src/app/api/game/state/route.ts](src/app/api/game/state/route.ts) — removed broken `clientChecksum !== validation.checksum` block; preserved `clientChecksum` request field, `stateHash` response, `state_hash` storage.
- [src/app/api/player/route.ts](src/app/api/player/route.ts) — same removal in the legacy endpoint.
- [src/app/api/admin/market/resources/[id]/route.ts](src/app/api/admin/market/resources/%5Bid%5D/route.ts) — fixed Next 16 async `params`.
- [package.json](package.json) — added `vaul@^1.1.2` dependency.

---

## 9. What is NOT in this handoff (gaps to fill in next session)

- All `game_config_*` table contents (15+ tables) — need live data to know what gameplay rules are actually configured.
- All `leaderboard*` / `trade_history*` / `server_market_state` shapes — only saw migrations, not actual data.
- The `BUDGET` of `app_config` table beyond `capacity` key.
- The `profiles` table contents (every user has one, but I didn't trace which fields are populated by which code path).
- The actual count of `auth.users` rows and ratio of `is_anonymous=true` vs `false`.
- Whether `is_game_admin` RPC exists and what it returns — only saw it referenced in middleware and RLS policies, not its definition.
- The contents of `game_config_balancing_rules`, which is queried by `validateGuestMigration` and the server engine.
