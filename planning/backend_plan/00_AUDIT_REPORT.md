# Admin Backend Restructure — Audit Report

**Date:** 2026-06-16
**Scope:** IndustryX admin dashboard subsystem (Next.js + Supabase + Cloudflare Workers)
**Audit Type:** Exhaustive codebase inventory — pages, APIs, schema, RLS, workers, auth, dead code
**Status:** Complete — no implementation performed

---

## 0. Executive Summary

The admin subsystem is **functional but architecturally fragmented**. All 9 admin pages work and all 11 admin API routes respond, but the codebase carries:

- **6 critical security issues** (missing forbidden page, unauthenticated `/api/config` root, RPC grant misuse, no role guard on admin management, missing audit on writes)
- **9 high-priority refactor items** (3,150 lines of duplicated layout code, no shared components, inconsistent API paths, no rate limiting on admin endpoints)
- **3 medium-priority polish items** (naming, duplicate API calls, misleading stats)
- **7 missing pages** of the 14 proposed (Reports, Market, Economy, Support, Jobs, Roles, System Status)
- **0 external consumers** — admin is completely isolated from the game UI

**Bottom line:** Production-blocked on P0. Refactor-needed for P1. Feature-incomplete for P2. Future work for P3.

---

## 1. Current Architecture (Evidence-Based)

### 1.1 Admin Pages — 9 pages, ~7,421 LOC

| Route | File | LOC | Auth | APIs Called | Status |
|---|---|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx` | 537 | client-side verifyAdmin | `/api/admin/stats`, `/actions?limit=5`, `/investigations?limit=5` | ✅ Functional |
| `/admin/players` | `src/app/admin/players/page.tsx` | 833 | client-side verifyAdmin | `/api/admin/stats`, `/api/admin/players` | ✅ Functional |
| `/admin/players/[id]` | `src/app/admin/players/[id]/page.tsx` | 983 | client-side verifyAdmin | `/api/admin/players/[id]`, `/api/admin/players/[id]/lock` | ✅ Functional |
| `/admin/investigations` | `src/app/admin/investigations/page.tsx` | 985 | client-side verifyAdmin | `/api/admin/investigations`, `/api/admin/investigations/[id]` | ✅ Functional |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | 835 | client-side verifyAdmin | `/api/admin/actions` | ✅ Functional |
| `/admin/admin-audit` | `src/app/admin/admin-audit/page.tsx` | 781 | client-side verifyAdmin | `/api/admin/admin-actions` | ✅ Functional |
| `/admin/config` | `src/app/admin/config/page.tsx` | 1294 | client-side verifyAdmin | `/api/tables`, `/api/config/[table]`, `/api/config/[table]/[id]` | ✅ Functional |
| `/admin/admins` | `src/app/admin/admins/page.tsx` | 950 | client-side verifyAdmin | `/api/admins` (❗ inconsistent path) | ✅ Functional |
| `/admin/login` | `src/app/admin/login/page.tsx` | 223 | None (login page) | Supabase OAuth | ✅ Functional |
| `/admin/auth/callback` | `src/app/admin/auth/callback/route.ts` | 58 | OAuth exchange | n/a | ⚠️ Redirects to missing `/admin/forbidden` |

**Total: 7,421 LOC, 0 shared layout, ~3,150 lines duplicated (sidebar + header + icons + toast)**

### 1.2 Admin API Routes — 10 under `/api/admin/*` + 5 supporting

#### Under `/api/admin/*` (10 routes)

| Method | Route | File | Auth | Audit? | Tables Touched |
|---|---|---|---|---|---|
| GET | `/api/admin/stats` | `admin/stats/route.ts` | verifyAdmin | ❌ | server_game_state, player_sessions, cheat_investigations, player_actions |
| GET | `/api/admin/players` | `admin/players/route.ts` | verifyAdmin | ❌ | server_game_state, player_progress, auth.users (admin API) |
| GET | `/api/admin/players/[id]` | `admin/players/[id]/route.ts` | verifyAdmin | ❌ | server_game_state, player_progress, player_actions, cheat_investigations, auth.users |
| POST | `/api/admin/players/[id]/lock` | `admin/players/[id]/lock/route.ts` | verifyAdmin + canWrite | ✅ admin_actions | server_game_state |
| GET | `/api/admin/investigations` | `admin/investigations/route.ts` | verifyAdmin | ❌ | cheat_investigations, admin_users, auth.users + 7 game_config tables |
| POST | `/api/admin/investigations` | `admin/investigations/route.ts` | verifyAdmin | ✅ player_actions (admin_money_reset) | server_game_state, player_actions + RPC lock_cheater_account |
| GET | `/api/admin/investigations/[id]` | `admin/investigations/[id]/route.ts` | verifyAdmin | ❌ | cheat_investigations, auth.users, admin_users |
| POST | `/api/admin/investigations/[id]` | `admin/investigations/[id]/route.ts` | verifyAdmin + canWrite | ✅ admin_actions | cheat_investigations |
| GET | `/api/admin/actions` | `admin/actions/route.ts` | verifyAdmin | ❌ | player_actions, auth.users |
| GET | `/api/admin/admin-actions` | `admin/admin-actions/route.ts` | verifyAdmin | ❌ | admin_actions, admin_users, auth.users |

#### Supporting Routes (Outside `/api/admin/`)

| Method | Route | File | Auth | Status |
|---|---|---|---|---|
| GET/POST | `/api/admins` | `admins/route.ts` | verifyAdmin | ⚠️ Inconsistent path |
| DELETE | `/api/admins/[id]` | `admins/[id]/route.ts` | verifyAdmin | ⚠️ Inconsistent path |
| GET | `/api/tables` | `tables/route.ts` | verifyAdmin | ✅ |
| GET | `/api/config` (root) | `config/route.ts` | **❌ NO AUTH** | 🔴 Security gap |
| GET/POST | `/api/config/[table]` | `config/[table]/route.ts` | verifyAdmin | ✅ |
| GET/PUT/DELETE | `/api/config/[table]/[id]` | `config/[table]/[id]/route.ts` | verifyAdmin | ✅ |

#### Cron & Workers

| Type | Target | Schedule | Auth | File |
|---|---|---|---|---|
| Next.js cron | `POST /api/cron/validate-ticks` | every 5 min (intentional pg_cron) | CRON_SECRET | `cron/validate-ticks/route.ts` |
| Cloudflare worker | `markettick` | `* * * * *` (60s) | n/a | `cloudflare/markettick/worker.js` |
| Cloudflare worker | `newsgenerator` | on-demand | n/a | `cloudflare/newsgenerator/worker.js` |

### 1.3 Database Schema — Admin-Relevant Tables

| Table | Migration | RLS Policy | Purpose |
|---|---|---|---|
| `admin_users` | 004 | `is_game_admin()` + self | Admin user records |
| `admin_actions` | 006 | service_role only | Admin action audit log |
| `cheat_investigations` | 004 | service_role only | Cheat detection cases |
| `player_actions` | 002 | users read/insert own + service_role | Player action audit log |
| `server_game_state` | 004 | service_role + user read own | Core game state |
| `player_sessions` | 003 | service_role + user read own | Online session tracking |
| `player_progress` | 001 | service_role + owner R/W | Player display names |
| `merge_audit_log` | 021 | service_role only | Guest→Google merge log |
| `game_config_*` (19) | 009 | dynamic | Game config |
| `server_market_state` | 029 | n/a | Market prices (CF worker) |
| `market_player_pressure` | 029 | n/a | Market pressure (CF worker) |

### 1.4 Database Functions (SECURITY DEFINER)

| Function | Migration | Purpose | Grant | Risk |
|---|---|---|---|---|
| `is_game_admin()` | 004, 018, 028 | Admin detection | authenticated, service_role | 🟢 OK |
| `increment_cheat_flag(p_user_id, ...)` | 012 | Atomic flag + auto-lock at 3 | **authenticated, service_role** | 🔴 Any logged-in user can flag anyone |
| `lock_cheater_account(p_user_id, p_reason)` | 004, 005 | Lock account | authenticated, service_role | 🟡 No auth check inside function |
| `check_rate_limit(...)` | 016 | Distributed rate limiting | service_role | 🟢 OK |
| `handle_new_user()` | 020 | Auto-create profile | trigger | 🟢 OK |
| `expire_stale_pending_operations()` | 021 | Cleanup | service_role | 🟢 OK |
| `auto_update_timestamp()` | 022 | Trigger | service_role | 🟢 OK |
| `upsert_market_pressure(...)` | 029 | Market pressure | authenticated | 🟢 OK |

### 1.5 Auth & Permission Model

**3-layer admin detection:**
1. `ADMIN_UIDS` env var (bootstrap) — checked in `src/proxy.ts:72-79` and `src/lib/auth/admin.ts:22-27`
2. `admin_users` DB table (authoritative) — checked via `isAdminUserDb()` with 60s in-memory cache
3. `is_game_admin()` SECURITY DEFINER RPC — used by RLS and proxy

**3 roles:**
- `viewer` — read-only (cannot lock/unlock, cannot pass `is_game_admin()`)
- `admin` — full moderation (lock/unlock, resolve investigations, edit config)
- `super_admin` — same as admin + add/remove admins (defaults from `ADMIN_UIDS`)

**Rate limit profiles:** 6 profiles via Supabase RPC (`player`, `compute`, `action`, `sync`, `config`, `general`)

### 1.6 Cloudflare Workers

| Worker | Schedule | Tables | AI Provider |
|---|---|---|---|
| `markettick` | `* * * * *` (60s) | server_market_state, market_player_pressure | Calls newsgenerator |
| `newsgenerator` | on-demand | n/a | Llama 3.2 3B (Cloudflare) + Groq Llama 3.3 70B (fallback) |

---

## 2. Issues Found (Severity-Sorted)

### 2.1 Critical (P0) — Must Fix Before Production

| # | Issue | Location | Impact |
|---|---|---|---|
| 1 | **Missing `/admin/forbidden` page** | `admin/auth/callback/route.ts:36` | Authenticated non-admins get 404 |
| 2 | **`/api/config` (root) has NO auth** | `api/config/route.ts:27-65` | Public read of 19 game_config tables |
| 3 | **`increment_cheat_flag` RPC granted to `authenticated`** | Migration 012 | Any user can flag other users |
| 4 | **`POST /api/admins` has no role guard** | `admins/route.ts:91-173` | Any admin can add super_admin |
| 5 | **No audit logging for config writes** | `api/config/[table]/[id]/route.ts` PUT/DELETE | Config changes untraceable |
| 6 | **No audit logging for admin management** | `api/admins/*` POST/DELETE | Admin changes untraceable |

### 2.2 High (P1) — Should Fix in Phase 2

| # | Issue | Location | Impact |
|---|---|---|---|
| 7 | **3,150 lines of sidebar/header duplication** | 7 admin pages | Maintenance burden |
| 8 | **Inconsistent API path** | `/admin/admins` uses `/api/admins` | Architecture smell |
| 9 | **Player search uses in-memory filtering** | `api/admin/players/route.ts:131-155` | Performance at scale |
| 10 | **X-RateLimit-Remaining hardcoded to 99** | `lib/auth/admin.ts:124-135` | False rate limit headers |
| 11 | **No shared admin layout / error / loading** | `src/app/admin/` | Code duplication, UX issues |
| 12 | **No admin entrance in game UI** | `GameSidebar`, `FloatingActionButton` | Admins can't discover panel |
| 13 | **No per-endpoint rate limiting on admin APIs** | All admin routes | DoS risk |
| 14 | **In-memory admin cache has 60s TTL** | `lib/auth/admin.ts:18-20` | Admin add/remove delayed by 60s |
| 15 | **Empty catch blocks** | 3 locations | Silent failures |
| 16 | **2 `as any` casts** | `api/config/route.ts:46`, `lib/game/store.ts:538` | Type safety |
| 17 | **Investigation POST actions have no UI** | `api/admin/investigations` POST reset-money/lock-account | Dead code path |
| 18 | **Duplicate `/api/config` root** | `api/config/route.ts` | Redundant with `/api/tables` |

### 2.3 Medium (P2) — Polish

| # | Issue | Location |
|---|---|---|
| 19 | Naming confusion (`/admin/audit` vs `/admin/admin-audit`) | route + sidebar labels |
| 20 | Duplicate stats API call on players page | `admin/players/page.tsx:217-232` |
| 21 | Pagination stats misleading (resolved-today client-side) | `admin/investigations/page.tsx:350-358` |

### 2.4 Missing Pages (7 of 14 proposed)

| Proposed | Status | Where |
|---|---|---|
| Dashboard | ✅ | `/admin` |
| Players | ✅ | `/admin/players` |
| Investigations | ✅ | `/admin/investigations` |
| **Reports** | ❌ Missing | — |
| **Market** | ❌ Missing | — |
| **Economy** | ❌ Missing | — |
| **Support** | ❌ Missing | — |
| Player Actions | ✅ | `/admin/audit` |
| Admin Actions | ✅ | `/admin/admin-audit` |
| **Jobs** | ❌ Missing | — |
| Config | ✅ | `/admin/config` |
| **Roles** | ❌ Missing | (embedded in `/admin/admins`) |
| Admin Users | ✅ | `/admin/admins` |
| **System Status** | ❌ Missing | — |

---

## 3. Security Concerns — Prioritized

1. **P0 — Add `verifyAdmin()` to `/api/config` (root)** — public read of 19 game_config tables
2. **P0 — Revoke `authenticated` grant on `increment_cheat_flag` RPC** — DoS/harassment vector
3. **P0 — Add `super_admin` guard to `POST /api/admins`** — any admin can promote themselves
4. **P1 — Add audit logging to all write operations** — config table writes, admin management
5. **P1 — Fix `X-RateLimit-Remaining` hardcoded value** — misleading security headers
6. **P1 — Add per-endpoint rate limiting to admin APIs** — DoS protection
7. **P2 — Add CSRF tokens to mutating endpoints** — defense-in-depth
8. **P2 — Fix `as any` casts** — type safety

---

## 4. Permission Model — Current vs Proposed

| Action | Current | Proposed |
|---|---|---|
| View admin pages | `viewer+` | Unchanged |
| Lock/unlock player | `admin+` (canWrite) | Unchanged |
| Resolve/dismiss investigation | `admin+` (canWrite) | Unchanged |
| Add/remove admin | `admin+` (any admin) | **`super_admin` only** |
| Change admin role | **❌ impossible** | `super_admin` only |
| Edit game config | `admin+` | Unchanged |
| Override market price | **❌ missing** | `super_admin` only |
| Run cron job manually | **❌ missing** | `admin+` |
| Export audit log | **❌ missing** | `viewer+` |
| Resolve support ticket | **❌ missing** | `admin+` |
| View system status | **❌ missing** | `viewer+` |

---

## 5. Database Impact

| Table | Migration Needed | Reason |
|---|---|---|
| `system_health` | New | Track last successful run of each cron/worker |
| `admin_reports` | New | Abuse/fraud report queue |
| `admin_tickets` | New | Support tickets |
| `admin_jobs_history` | New | Job run history for Jobs page |
| `audit_log_export` | Optional | Track CSV exports |

---

## 6. API Recommendations (8 new endpoints)

| Method | Route | Purpose | Priority |
|---|---|---|---|
| GET | `/api/admin/system-status` | Aggregate health of all infra | P1 |
| POST | `/api/admin/system-status/refresh` | Force refresh + run health check | P1 |
| POST | `/api/admin/jobs/run` | Manually trigger cron job | P1 |
| GET | `/api/admin/market/state` | Read server_market_state + circuit breakers | P1 |
| POST | `/api/admin/market/override` | Override price / inject event / clear circuit breaker | P1 |
| GET | `/api/admin/economy/overview` | Currency flow, reward grants, transaction volume | P2 |
| GET | `/api/admin/reports` | Abuse/fraud reports queue | P2 |
| POST | `/api/admin/reports/[id]/resolve` | Resolve report | P2 |
| PUT | `/api/admin/admins/[id]/role` | Update admin role | P1 |
| GET | `/api/admin/audit/export` | Export admin_actions to CSV | P2 |

---

## 7. Pages to Keep / Rename / Remove / Build

**Keep (9 existing):**
- `/admin`, `/admin/players`, `/admin/players/[id]`, `/admin/investigations`, `/admin/config`, `/admin/admins`, `/admin/login`, `/admin/auth/callback`

**Rename for consistency:**
- `/admin/audit` → `/admin/actions/player`
- `/admin/admin-audit` → `/admin/actions/admin`

**Add (1 critical):**
- `/admin/forbidden`

**Build (5 new):**
- `/admin/system-status` (P1)
- `/admin/jobs` (P1)
- `/admin/market` (P1)
- `/admin/economy` (P2)
- `/admin/reports` (P2)
- `/admin/support` (P3)

**Remove:**
- None — all existing pages functional

---

## 8. Architecture Recommendations

### 8.1 Shared Layout

Create `src/app/admin/layout.tsx` to eliminate ~3,150 lines of duplication:
- Sidebar with nav items (extracted from per-page duplication)
- Header with user email + logout
- Toast provider (use existing `src/components/ui/sonner.tsx`)
- Auth check wrapper (centralized `verifyAdmin` at server-side via `getServerSession`)
- Loading state via `src/app/admin/loading.tsx`
- Error boundary via `src/app/admin/error.tsx`

### 8.2 Shared Component Library

Create `src/components/admin/`:
- `AdminSidebar` — extracted sidebar
- `AdminHeader` — extracted header
- `DataTable` — generic table with sort/paginate
- `Pagination` — generic pagination
- `ConfirmModal` — generic confirmation dialog
- `StatusBadge` — generic status badge
- `AdminIcons` — extracted inline SVG icons

### 8.3 API Path Normalization

- Move `/api/admins/*` → `/api/admin/admins/*`
- Remove duplicate `/api/config` (root)
- All admin APIs under `/api/admin/*`

### 8.4 Role Hierarchy Enforcement

Centralize in `src/lib/auth/admin-helpers.ts`:
- `requireRole(role: 'viewer' | 'admin' | 'super_admin')` — guard helper
- `canManageAdmins(role)` → `role === 'super_admin'`
- `canOverrideMarket(role)` → `role === 'super_admin'`
- `canWrite(role)` → already exists

---

## 9. Migration Plan — Order of Operations

### Phase 2A (P0 — Security + Blockers) — 1-2 days
1. Create `/admin/forbidden` page
2. Add `verifyAdmin()` to `/api/config` (root)
3. Revoke `authenticated` grant on `increment_cheat_flag` RPC
4. Add `super_admin` guard to `POST /api/admins`
5. Add audit logging to config table writes + admin management
6. Fix `X-RateLimit-Remaining` hardcoded value
7. Flush in-memory admin cache on admin add/remove

### Phase 2B (P1 — Refactor + System Status) — 3-4 days
1. Create `src/app/admin/layout.tsx`
2. Create `src/app/admin/loading.tsx` and `src/app/admin/error.tsx`
3. Move `/api/admins/*` to `/api/admin/admins/*`
4. Remove duplicate `/api/config` (root)
5. Create `src/components/admin/` shared library
6. Add admin entrance link in game UI
7. Build `/admin/system-status` page + endpoint
8. Build `/admin/jobs` page + endpoint
9. Build `/admin/market` page + endpoints
10. Add `PUT /api/admin/admins/[id]/role` endpoint

### Phase 2C (P2 — New Features + Polish) — 3-5 days
1. Build `/admin/economy` page + endpoint
2. Build `/admin/reports` page + endpoints
3. Build `/admin/support` page + endpoints
4. DB-side player search (replace in-memory filter)
5. Per-endpoint rate limiting
6. Fix `as any` casts
7. Add CSV export
8. Rename `/admin/audit` → `/admin/actions/player`, `/admin/admin-audit` → `/admin/actions/admin`

### Phase 2D (P3 — Future)
1. Support/tickets integration with email
2. CSRF tokens
3. Advanced RBAC (custom roles per page)
