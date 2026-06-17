# RULES.md — IndustriaX Project Engineering Rules

> **Last Updated:** 2025-01-17 (Post Deep Audit — 25 issues identified)
> **Status:** These rules are derived from REAL vulnerabilities and architectural weaknesses found in the codebase. Every rule exists because something broke, could break, or is currently broken.

---

## 1. ALLOWED

### General
- Adding new game features through the full stack (database → API → state → UI)
- Extending existing panels with new sections
- Adding new API routes with proper auth and validation
- Creating new Supabase migrations for schema changes
- Refactoring code to improve architecture without behavioral changes
- Adding new admin pages and API routes with proper role checks

### Database
- Adding new tables via Supabase SQL migrations
- Adding new columns to existing tables via migrations
- Adding new RLS policies
- Adding indexes for query optimization
- Using `createServiceRoleClient()` for server-side operations that need elevated access

### Frontend
- Adding new panels/components following existing patterns
- Using shadcn/ui components from `src/components/ui/`
- Using Framer Motion for animations
- Using `useGameStore` with **proper selectors** (subscribe to specific slices, NOT the entire store)
- Using `GameIcon` component for all game icons

### API
- Adding new action types to `/api/game/action` (with validation)
- Adding rate limiting to unprotected endpoints
- Adding auth checks to existing unprotected endpoints
- Extending `gameStateValidator.ts` with new validation rules

---

## 2. FORBIDDEN

### Security — CRITICAL
- **NEVER** push `.env` or `.env.local` to GitHub — contains production secrets
- **NEVER** use hardcoded secrets as fallbacks — the `CHECKSUM_SECRET` fallback `'industriax-server-secret-2024'` in `gameStateValidator.ts:56` must be removed. **Why:** Anyone who reads the source code can forge valid anti-cheat checksums, making the entire validation system useless.
- **NEVER** return `{ locked: false }` on database errors — `gameStateValidator.ts:312-315` does this. **Why:** If Supabase goes down, ALL banned cheaters are automatically unlocked. Attackers can DDoS the database to bypass account locks. Must fail CLOSED: return `{ locked: true }` on errors.
- **NEVER** create an API route without auth checks if it accesses sensitive data
- **NEVER** allow admin actions without `canWrite()` role check
- **NEVER** implement game-affecting mutations as client-only operations — the Trading Post did this. **Why:** Players can cheat via browser console. All trades must go through `/api/game/action`.
- **NEVER** return `{ valid: true }` when server validation fails or is unreachable
- **NEVER** trust client-sent game state without server-side verification
- **NEVER** expose the Supabase service role key to the client
- **NEVER** accept unvalidated input in `importSave()` — `store.ts:2428-2443` accepts `money: Infinity`, arbitrary keys in resources, and unvalidated buildings. **Why:** Cheaters can inject unlimited money, corrupt game state, or crash the game.

### Security — Input Validation
- **NEVER** set game speed without validating against `[1, 2, 5, 10]` — `store.ts:1804` accepts any number. **Why:** Setting speed to 1000 causes 1000 ticks/second, browser crashes, and data corruption.
- **NEVER** use `setImmediate` in server-side code — not available in Edge runtimes. Use `queueMicrotask()` instead. **Why:** `gameStateValidator.ts:382` uses `setImmediate` which crashes in some environments.
- **NEVER** use `Math.random()` for security-sensitive IDs — use `crypto.randomUUID()` instead. **Why:** `Math.random()` is predictable and collision-prone.

### Database
- **NEVER** run `prisma db:push` or `prisma migrate` — the Prisma schema is stale (SQLite with User/Post model) and will corrupt the Supabase PostgreSQL database. **Why:** The Prisma schema at `prisma/schema.prisma` is the Next.js starter template, NOT the game schema.
- **NEVER** remove RLS policies from existing tables
- **NEVER** add `"Service role can do everything"` policies without justification
- **NEVER** create a new table without RLS enabled
- **NEVER** write raw SQL outside of migration files
- **NEVER** use FLOAT for monetary values — use INTEGER (cents) or DECIMAL

### Architecture
- **NEVER** add game logic to React components — it belongs in the Zustand store or server-side
- **NEVER** create a new Zustand store for game state — use the existing `useGameStore`
- **NEVER** directly mutate `store.resources` without going through store actions
- **NEVER** bypass the `debouncedPersistStorage` for save operations
- **NEVER** create a new Supabase client inside a React component body — use `createClient()` from `@/lib/supabase/client`
- **NEVER** subscribe to the entire Zustand store — `useGameStore()` without a selector causes re-renders on EVERY tick. **Why:** `DashboardPanel.tsx:24` does this, causing ~10-100 re-renders/second.

### API
- **NEVER** create an API route that modifies game state without validation
- **NEVER** create an admin API route without `verifyAdmin()` check
- **NEVER** create a write admin API route without `canWrite()` check
- **NEVER** omit rate limiting on new API routes
- **NEVER** add action types to `validActions` without implementing their handler — `route.ts:321-325` has 14 dead action types. **Why:** These waste server time and mask missing implementations.

### Caddy/Gateway
- **NEVER** modify the `XTransformPort` logic in Caddyfile without security review — it's an SSRF vector
- **NEVER** add internal service ports to the Caddyfile without restricting access

---

## 3. REQUIRED REVIEWS

Before any code is accepted, these checks MUST pass:

### Pre-Implementation Review
| Check | Question |
|-------|----------|
| Rule compliance | Does this violate any FORBIDDEN rule? |
| Database impact | Does this need a migration? If so, has it been written? |
| Security impact | Does this need server-side validation? Auth? Rate limiting? |
| API impact | Does this need a new endpoint? Or modification to an existing one? |
| Admin impact | Does this need audit logging? Role checks? |
| State impact | Which store slices are affected? Are selectors efficient? |
| Offline impact | How does this behave when the server is unreachable? |
| Fail-closed check | If the database is down, does this fail closed (block) or open (allow)? |

### Post-Implementation Review
| Check | Tool/Method |
|-------|-------------|
| Lint | `bun run lint` — must pass with 0 errors |
| Server start | Dev server must start and serve `/` with HTTP 200 |
| Console | No JavaScript errors in browser console |
| Feature | Feature works as expected in browser |
| Security | No auth bypass, no data leak, no unvalidated input |
| Database | Data persists correctly (if applicable) |
| Admin | Admin actions logged (if applicable) |
| Selectors | Zustand selectors are specific (not `useGameStore()`) |
| Responsive | Works on mobile and desktop layouts |
| Worklog | `/home/z/my-project/worklog.md` updated |

---

## 4. DATABASE RULES

### Schema Changes
- All schema changes MUST be in Supabase SQL migration files under `supabase/migrations/`
- Migrations MUST be idempotent where possible
- Migrations MUST NOT be combined — one logical change per migration
- Migration files MUST have a descriptive filename (e.g., `007_add_trade_history.sql`)
- **NEVER** use Prisma to manage the database schema

### RLS (Row Level Security)
- Every new table MUST have RLS enabled: `ALTER TABLE xxx ENABLE ROW LEVEL SECURITY;`
- Every new table MUST have policies for:
  - Users can read their own data: `USING (user_id = auth.uid())`
  - Users can insert their own data: `WITH CHECK (user_id = auth.uid())`
  - Service role can do everything (for server-side API operations)
- Admin-only tables MUST have policies restricting access to service role only

### Write Frequency
- Player state saves happen every 2 minutes via cloud sync — do NOT increase this frequency
- `player_actions` table receives a write on every validated action — do NOT add unnecessary action types
- `admin_actions` table receives a write on every admin mutation — this is correct and must be preserved
- Game tick updates are client-side only — do NOT send tick data to the server

### Data Integrity
- All monetary values MUST be stored as integers (cents) or DECIMAL — never FLOAT
- All timestamps MUST use `TIMESTAMPTZ` — never `TIMESTAMP` without timezone
- All UUIDs MUST use the `uuid` type — never `text` or `varchar`
- All foreign keys MUST have `ON DELETE CASCADE` or `ON DELETE SET NULL` as appropriate
- `player_progress.money` has a check constraint `CHECK (money >= 0)` — new tables must follow this pattern
- Atomic operations MUST use SQL atomic increments (e.g., `cheat_flag_count = cheat_flag_count + 1`) not read-then-write. **Why:** `gameStateValidator.ts:332-344` has a TOCTOU race condition where concurrent requests can lose cheat flag increments.

### Indexes
- Every table MUST have an index on `user_id` (for RLS policy performance)
- Every table MUST have an index on `created_at` (for time-range queries)
- Composite indexes SHOULD be added for common query patterns
- Index creation MUST be in migration files, not in application code

---

## 5. SECURITY RULES

### Authentication
- All game API routes MUST use `verifyAuth()` or `verifyAuthAndOwnership()` from `@/lib/auth/admin.ts`
- Admin API routes MUST use `verifyAdmin()` from `@/lib/auth/admin.ts`
- Admin write operations MUST additionally use `canWrite()` from `@/lib/auth/admin-helpers.ts`
- Auth failures MUST return 401, not redirect
- Session refresh is handled by middleware — do NOT duplicate in API routes

### Authorization — Admin Roles
| Role | Can Read | Can Write |
|------|----------|-----------|
| `viewer` | ✅ All admin data | ❌ No mutations |
| `admin` | ✅ All admin data | ✅ All mutations |
| `super_admin` | ✅ All admin data | ✅ All mutations + manage admins |

- `ADMIN_UIDS` env var users are implicitly `super_admin`
- `admin_users` table can override roles
- **NEVER** create an admin endpoint that checks `verifyAdmin()` but not `canWrite()` for mutations

### Validation
- Every game-affecting mutation MUST be validated server-side in `/api/game/action`
- The `gameStateValidator.ts` MUST be updated for new game mechanics
- `importSave()` MUST validate the imported data against server-side rules with:
  - Upper/lower bounds on monetary values (e.g., `0 <= money <= 1e12`)
  - Whitelisted resource keys only (reject unknown keys)
  - Building type validation against `BUILDING_DEFS`
  - Building level bounds (1-100 or similar)
- **CRITICAL**: `serverActions.ts` MUST NOT return `{ valid: true }` on auth failures, rate limits, or network errors
- **CRITICAL**: `isAccountLocked()` MUST return `{ locked: true }` on database errors (fail-closed)

### Abuse Prevention
- Every new API route MUST have rate limiting via `checkRateLimit()` from `@/lib/auth/rateLimiter.ts`
- Rate limit profiles are defined in `rateLimiter.ts` — add new profiles as needed
- Cheat detection thresholds are in `gameStateValidator.ts` — update for new mechanics
- Account auto-locking at 3 cheat flags must be preserved
- **NOTE**: Current in-memory rate limiter (`rateLimiter.ts:14`) doesn't scale to multi-instance deployments. For production, use Supabase-backed or Redis rate limiting.

### Attack Surface Reduction
- `/api/game/definitions` MUST add at minimum a rate limit (currently no auth, no rate limit)
- `/api/news-llm` MUST add auth or rate limiting (currently open proxy to Cloudflare Worker)
- `/api/icons` MUST add rate limiting (currently open proxy to Iconify)
- `/api/config` root route MUST add auth (currently exposes table names)
- `XTransformPort` in Caddyfile MUST be restricted to known ports only

### Save/Import Security
- `importSave()` MUST validate all fields with bounds checking before applying
- `setGameSpeed()` MUST validate against allowed values `[1, 2, 5, 10]` before setting
- `importBlueprint()` needs the same strict validation as `importSave()`
- Save version MUST be incremented when adding new state fields

---

## 6. PERFORMANCE RULES

### Database Efficiency
- All queries MUST use indexed columns in WHERE clauses
- All queries MUST have a LIMIT clause for list endpoints
- Avoid SELECT * — specify needed columns
- Use `createServiceRoleClient()` only when RLS bypass is required — use regular client otherwise
- Batch inserts are preferred over individual inserts for audit logs

### API Efficiency
- Every API route MUST return within 5 seconds under normal load
- Every API route MUST have a rate limit
- Avoid N+1 queries — use JOINs or batch queries
- Cache game config server-side — it rarely changes (`configCache.ts` pattern)
- Use `Response.json()` for simple responses — avoid unnecessary serialization

### Frontend Rendering Efficiency
- **MANDATORY**: Use Zustand selectors — NEVER subscribe to the entire store
  ```typescript
  // ❌ FORBIDDEN — causes re-renders on every tick
  const store = useGameStore();
  
  // ✅ REQUIRED — only re-renders when specific value changes
  const money = useGameStore(s => s.money);
  const resources = useGameStore(s => s.resources);
  ```
- Memoize expensive computations with `useMemo`
- Debounce rapid state updates (the store already uses 5s debounced persistence)
- Use `AnimatePresence` for lists that change frequently
- Set `max-h-96 overflow-y-auto` on long lists with `game-scrollbar` styling
- Keep panel components focused — do not create god components

### Config Cache
- `configCache.ts` uses `let` exports with ES module live bindings
- **Known Issue:** React components that destructure old values won't re-render when config updates from Supabase
- **Workaround:** Use a React context or state variable that triggers re-renders on config change
- **Known Issue:** `PRODUCTION_CHAINS` is never updated from Supabase (hardcoded local values only)

### Realtime Efficiency
- Supabase Presence is used for online tracking — do NOT add new Presence channels without justification
- The Presence channel name is `industriax-online` — do not create per-user channels
- Presence refresh interval is 30s — do NOT reduce below 10s

---

## 7. ARCHITECTURE RULES

### System Interaction Pattern

```
Browser (React + Zustand)
  ↕ (API calls with auth)
Next.js API Routes
  ↕ (Supabase client)
Supabase (PostgreSQL + Auth + Presence)
```

- The game loop runs CLIENT-SIDE — this is by design for responsiveness
- The SERVER is advisory — it validates, logs, and detects cheats
- **This architecture is a tradeoff** — the client is authoritative for gameplay, the server is authoritative for validation and persistence
- Any new mutation MUST follow: client action → server validation → server persistence → client confirmation

### State Management
- `useGameStore` is the SINGLE source of truth for game state
- Do NOT create additional Zustand stores for game data
- `useSettingsStore` is acceptable for UI-only preferences
- Store actions MUST be the only way to modify game state from components
- Store version migrations are in `migrateSaveState()` — add new versions incrementally
- **Known Issue:** Save migration code (V1→V19) uses extensive `as Record<string, number>` type casting — prone to runtime errors with malformed saves

### Save System
- Local saves use `debouncedPersistStorage` with 5s debounce
- Cloud saves use `/api/game/state` with 2-minute auto-save interval
- `beforeunload` flush ensures data is written on page close
- **Known Issue:** On mobile browsers and force-kills, `beforeunload` may not fire, losing up to 5s of progress
- **NEVER** remove the `beforeunload` listener
- **NEVER** increase the auto-save frequency (would overload the server)
- Save version MUST be incremented (`SAVE_VERSION`) when adding new state fields

### API Design
- Game routes go under `/api/game/`
- Admin routes go under `/api/admin/`
- Config routes go under `/api/config/`
- Auth routes go under `/api/auth/`
- Each route file MUST have a clear purpose comment
- Error responses MUST use consistent format: `{ error: string, code?: string }`
- **Dead action types:** The following are in `validActions` but have NO handler — remove them or implement them: `set_game_speed`, `sell_market`, `buy_market`, `prestige`, `import`, `claim_quest`, `hire_worker`, `assign_worker`, `upgrade_worker`, `start_drone_mission`, `collect_drone`, `toggle_building`, `bulk_build`, `bulk_sell`

### Frontend Architecture
- Game panels go in `src/components/game/`
- Shared components go in `src/components/game/shared/`
- UI primitives go in `src/components/ui/` (shadcn/ui — do not modify these directly)
- Providers go in `src/components/providers/`
- Each game panel MUST be a self-contained component
- Panels receive data from the store — NOT from props (except for rare composition patterns)

### Admin Dashboard
- Admin pages go under `src/app/admin/`
- Admin pages MUST have sidebar navigation consistent with other admin pages
- Admin pages MUST use `verifyAdmin()` on their API calls
- Admin mutations MUST be logged to `admin_actions` table

### Type System
- **Known Issue:** `solarPanel` appears in both `FactoryType` and `PowerPlantType` (`types.ts:34-35`) — this naming collision should be resolved
- **Known Issue:** `PrestigeBonus.effect.type` is `string` — should be a union type for type safety
- **Known Issue:** `BuildingType` has ~90 variants and `FactoryType` has ~80 — these are unwieldy but acceptable for now

---

## 8. PRODUCTION RULES

### Before Any Feature Is Considered Complete

- [ ] Lint passes with 0 errors on `src/`
- [ ] Dev server starts and serves `/` with HTTP 200
- [ ] No JavaScript errors in browser console
- [ ] Feature works in browser (tested, not assumed)
- [ ] Responsive layout works on mobile and desktop
- [ ] Sticky footer rule respected (if applicable)
- [ ] Server-side validation implemented (for game mutations)
- [ ] Rate limiting implemented (for new API routes)
- [ ] Auth checks implemented (for protected routes)
- [ ] Admin audit logging implemented (for admin mutations)
- [ ] Database migration created (if schema changed)
- [ ] RLS policies created (for new tables)
- [ ] Store version incremented (if state shape changed)
- [ ] No secrets in code or committed files
- [ ] Zustand selectors are specific (not subscribing to entire store)
- [ ] Input validation with bounds checking (for import/save)
- [ ] worklog.md updated

### Deployment Checklist
- [ ] All lint checks pass
- [ ] Dev server starts without errors
- [ ] Critical pages load (game `/` and admin `/admin/`)
- [ ] No new console errors
- [ ] `.env` is NOT being pushed
- [ ] Migration files are included in the commit
- [ ] `worklog.md` is updated
- [ ] `CHECKSUM_SECRET` is set in production environment

---

## APPENDIX A: Complete Issue Registry (25 Issues Found in Deep Audit)

### 🔴 CRITICAL (5)

| ID | Issue | File | Lines | What Happens If Unfixed |
|----|-------|------|-------|------------------------|
| C1 | Hardcoded HMAC fallback secret | `gameStateValidator.ts` | 56 | Anyone who reads source code can forge valid anti-cheat checksums. Entire validation system is bypassed. |
| C2 | `isAccountLocked` returns `false` on DB errors | `gameStateValidator.ts` | 298-316 | During database outages, banned cheaters are treated as unlocked. Attackers can DDoS DB to bypass locks. |
| C3 | Unvalidated save import (no bounds) | `store.ts` | 2412-2455 | Players can import saves with `money: Infinity`, arbitrary resource keys, or corrupted buildings. Game state becomes invalid. |
| C4 | `setGameSpeed` accepts any number | `store.ts` | 1804 | Speed 1000 = 1000 ticks/sec → browser crash, data corruption, massive unfair advantage. |
| C5 | Trading Post bypasses server validation | `TradingPostPanel.tsx` | all | Players can cheat via browser console. No database persistence. Trade history lost on refresh. |

### 🟠 HIGH (6)

| ID | Issue | File | Lines | What Happens If Unfixed |
|----|-------|------|-------|------------------------|
| H1 | DashboardPanel subscribes to entire store | `DashboardPanel.tsx` | 24 | Re-renders on EVERY tick (10-100/sec). Mobile users experience severe lag. |
| H2 | In-memory rate limiter doesn't scale | `rateLimiter.ts` | 14 | Multiple server instances = per-instance limits = easily bypassed. |
| H3 | TOCTOU race in cheat flagging | `gameStateValidator.ts` | 322-372 | Concurrent cheat flags get lost. Cheaters exceed 3-flag lock threshold before being caught. |
| H4 | 14 dead action types in validActions | `route.ts` | 321-325 | Wastes server time, confuses error handling, masks missing implementations. |
| H5 | `solarPanel` in both FactoryType and PowerPlantType | `types.ts` | 34-35 | Building misclassification bugs. Which category is it really? |
| H6 | Debounced persist loses up to 5s of data | `store.ts` | 894-967 | Mobile crashes or force-kills lose recent gameplay progress. |

### 🟡 MEDIUM (8)

| ID | Issue | File | Lines | What Happens If Unfixed |
|----|-------|------|-------|------------------------|
| M1 | Config updates don't trigger re-renders | `configCache.ts` | 60-78 | UI shows stale building/resource data until user navigates away. |
| M2 | `setImmediate` in logActionAsync | `gameStateValidator.ts` | 382 | Crashes in Edge runtime environments. Silent audit log failure. |
| M3 | Hardcoded income rates in tooltip | `page.tsx` | 463-467 | Shows wrong income estimates (extractorRate=20, factoryRate=50 don't match real values). |
| M4 | Inaccurate rpPerTick calculation | `DashboardPanel.tsx` | 99-101 | Can be 2-5x off from actual rate. Misleading for players. |
| M5 | Meaningless storageUtilization | `DashboardPanel.tsx` | 155-161 | Mixing iron (100 cap) with nanoMaterial (3 cap) produces nonsense percentage. |
| M6 | Stale Prisma schema | `schema.prisma` | 1-32 | Contains User/Post models from starter, NOT the game tables. Misleading. |
| M7 | Admin auth via env var allowlist | `middleware.ts` | 64-69 | Adding/removing admins requires redeployment. Should use DB table. |
| M8 | Weak blueprint import validation | `store.ts` | 3274-3277 | Same issue as C3 but for blueprints — arbitrary data injection. |

### 🟢 LOW (6)

| ID | Issue | File | Lines | What Happens If Unfixed |
|----|-------|------|-------|------------------------|
| L1 | `Math.random()` for IDs | `store.ts`, `TradingPostPanel.tsx` | 48, 174 | Predictable, collision-prone. Low risk for single-player but not future-proof. |
| L2 | `KEY_TAB_MAP` incomplete | `GameSidebar.tsx` | 124-135 | Only 10 keyboard shortcuts for 25+ tabs. |
| L3 | `topResources` shows only raw materials | `DashboardPanel.tsx` | 43 | Advanced players don't see their most valuable resources. |
| L4 | `quickTradeAmounts` never updates | `TradingPostPanel.tsx` | 200-205 | Market price changes from Supabase not reflected in quick trade. |
| L5 | `handleReset` uses `confirm()` | `page.tsx` | 412 | Blocking dialog, poor mobile UX, can't be styled. |
| L6 | `prisma` in dependencies, not devDependencies | `package.json` | 57 | Increases production bundle size unnecessarily. |

---

## APPENDIX B: Why Each Major Rule Exists

| Rule | Origin — What Code Influenced This Rule |
|------|----------------------------------------|
| "Never use hardcoded secret fallbacks" | `gameStateValidator.ts:56` — `process.env.CHECKSUM_SECRET \|\| 'industriax-server-secret-2024'` means if the env var isn't set, anyone who reads the source can forge checksums. |
| "Fail-closed on database errors" | `gameStateValidator.ts:312-315` — `catch { return { locked: false } }` means banned players are unlocked when the DB is down. |
| "Validate all imported save data with bounds" | `store.ts:2428-2443` — `importSave()` only checks `typeof data.money === 'number'` — accepts `Infinity`, negative values, and arbitrary keys. |
| "Validate game speed against allowed values" | `store.ts:1804` — `setGameSpeed: (speed: number) => set({ gameSpeed: speed })` accepts any number. |
| "Never create client-only game mutations" | `TradingPostPanel.tsx` — the entire Trading Post modifies client Zustand state directly, with zero server validation, zero database persistence, and trade history stored in React local state (lost on refresh). |
| "Use Zustand selectors, not entire store" | `DashboardPanel.tsx:24` — `useGameStore()` subscribes to 100+ fields, causing re-renders on every tick (~10-100/sec). |
| "Use SQL atomic increments, not read-then-write" | `gameStateValidator.ts:332-344` — reads `cheat_flag_count`, then writes `count + 1`. Under concurrent requests, the count can be lost. |
| "Never add dead action types" | `route.ts:321-325` — 14 action types are listed as valid but have no handler, always returning "Unhandled action". |
| "Never use Prisma for schema management" | `prisma/schema.prisma` — contains SQLite User/Post models from the Next.js starter. Running `prisma db:push` would create wrong tables in Supabase PostgreSQL. |
| "Admin mutations need canWrite()" | `/api/admins` POST route calls `verifyAdmin()` but never checks `canWrite()`, allowing viewer-role admins to escalate to super_admin. |
| "All new tables need RLS" | The existing tables all have RLS enabled and policies defined. This is defense-in-depth that must be maintained. |
| "Increment SAVE_VERSION on state changes" | Past migrations V1→V19 show that adding state fields without version increments causes player data loss. |
| "5s debounce on persistence" | Writing to localStorage on every tick (up to 10/sec) would block the main thread and cause frame drops. |
| "2-minute cloud save interval" | More frequent saves would overload the `/api/game/state` endpoint. Less frequent risks more data loss. |
| "Never modify shadcn/ui components directly" | These are managed by the shadcn CLI. Direct modifications will be overwritten on update. |
| "Never use setImmediate server-side" | `gameStateValidator.ts:382` uses `setImmediate` which doesn't exist in Edge runtimes, causing silent audit log failures. |

---

## APPENDIX C: What Needs Immediate Attention

### Fix NOW (Before Any New Features)

1. **Remove hardcoded HMAC fallback** — `gameStateValidator.ts:56` — Remove `'industriax-server-secret-2024'`. If `CHECKSUM_SECRET` is not set, throw an error.
2. **Fix isAccountLocked fail-open** — `gameStateValidator.ts:312-315` — Return `{ locked: true }` on DB errors.
3. **Add bounds validation to importSave** — `store.ts:2428-2443` — Clamp money to `0 <= x <= 1e12`, whitelist resource keys, validate building types.
4. **Add speed validation to setGameSpeed** — `store.ts:1804` — Only allow `[1, 2, 5, 10]`.
5. **Fix Trading Post server integration** — Route all trades through `/api/game/action` with `action: 'trade'` validation. Add trade history to database.

### Fix SOON (Before Launch)

6. **Fix DashboardPanel selectors** — Replace `useGameStore()` with specific selectors.
7. **Fix TOCTOU race in cheat flagging** — Use SQL atomic increment.
8. **Remove dead action types from validActions** — Or implement their handlers.
9. **Add rate limiting to unprotected API routes** — `/api/game/definitions`, `/api/news-llm`, `/api/icons`, `/api/config`.
10. **Fix rpPerTick and income calculations** — Use real game logic instead of hardcoded estimates.

### Plan to Address (Technical Debt)

11. **Resolve solarPanel naming collision** — Rename one instance.
12. **Fix storageUtilization calculation** — Weight by resource tier.
13. **Clean up Prisma schema** — Remove or update to match Supabase tables.
14. **Add admin roles database table** — Replace env var allowlist.
15. **Scale rate limiter** — Move from in-memory to Supabase-backed or Redis.
16. **Fix config cache re-render issue** — Add React context trigger.
17. **Reduce debounce risk** — Add periodic full saves between debounced writes.
