# Phase 01 — Security Closure

## Status: IN PROGRESS (partial)
## Predecessor: Phase 00 Source of Truth
## References: RULES.md Appendix A+C, PHASE_1B_SECURITY_REPORT.md, PHASE_1B_SECURITY_FOLLOWUP_REPORT.md

---

## Background

Phase 1B (completed 2025-03-04) closed C1-C6, H3 initial fix, H8.
Phase 1B Follow-Up closed H3 fallback (removed read-then-write fallback, added fail-closed investigation entry path).

**Issues verified FIXED in code (do not re-implement):**
- C1: HMAC fallback removed (no hardcoded secret in gameStateValidator.ts)
- C2: isAccountLocked returns `{ locked: true }` on DB errors (fail-closed)
- C3: importSave has full bounds validation (money, resources, buildings, research)
- C4: setGameSpeed only allows [1, 2, 5, 10]
- C5: Trading Post uses /api/game/trade (server-authoritative, June 2025)
- C6: console.log replaced with logger.ts (NODE_ENV gated)
- H4: Dead action types removed from validActions in action/route.ts
- H8: Rate limiting added to /api/news-llm, /api/config, /api/game/definitions, /api/icons
- M2: setImmediate replaced with queueMicrotask in gameStateValidator.ts

**Issues OPEN in code (this phase closes these):**

| ID | Issue | File | Lines |
|---|---|---|---|
| H3 | TOCTOU race in cheat flagging | gameStateValidator.ts | 353-425 |
| H2 | In-memory rate limiter does not scale | rateLimiter.ts | 14 |
| H5 | solarPanel naming collision | types.ts | 34-35 |
| M6 | Stale Prisma schema | prisma/schema.prisma | all |
| M7 | Admin auth via env var ADMIN_UIDS | middleware.ts | 64-74 |
| M8 | Weak blueprint import validation | store.ts | 3274-3277 |
| L1 | Math.random() for IDs | store.ts | 48+ |
| L6 | prisma in dependencies not devDependencies | package.json | 57 |

---

## Objective

Close H3 properly with true atomic increment (no fallback).
Fix M8 (blueprint validation).
Clean up M6/L6 (Prisma artifacts).
Design plans for M7 (admin table) and H2 (rate limiter).

---

## Task Breakdown

### 01.1 H3 — True Atomic Cheat Flag Increment

File: `src/lib/auth/gameStateValidator.ts` lines 353-425

Current state: Code has a TODO comment at line 394 and still does SELECT then UPDATE.
Migration 007_atomic_cheat_flag.sql created the RPC but code never calls it.

Steps:
1. Verify `increment_cheat_flag` RPC exists in production Supabase:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_name = 'increment_cheat_flag'
   ```
2. If NOT deployed: run migration 007 in Supabase SQL editor
3. Replace the read-then-write block with:
   ```typescript
   const { error } = await supabase.rpc('increment_cheat_flag', {
     p_user_id: userId,
     p_detection_type: detectionType,
     p_severity: severity,
     p_description: description,
   });
   ```
4. Remove the TODO comment
5. On RPC error: call `logFailedCheatFlag()` (already exists from 1B follow-up)
6. Do NOT add read-then-write fallback (explicitly removed in 1B follow-up)

### 01.2 M8 — Blueprint Import Validation

File: `src/lib/game/store.ts` around lines 3274-3277

Same vulnerability class as C3 (importSave) but for blueprints.

Fix (mirror importSave C3 validation):
1. Validate buildings array length <= 500
2. For each building: validate type exists in BUILDING_DEFS
3. For each building: validate level is `Number.isFinite` and in [1, 100]
4. Reject unknown building types or skip with warning (do not crash)
5. Return false for invalid blueprints

### 01.3 M6 + L6 — Remove Stale Prisma Artifacts

M6: `prisma/schema.prisma` contains SQLite User/Post models from Next.js starter.
Running `prisma db:push` would corrupt the production Supabase database (FORBIDDEN in RULES.md).

Steps:
1. Delete `prisma/schema.prisma` (or replace with a DO NOT USE warning file)
2. In `package.json`: move `prisma` and `@prisma/client` to devDependencies
3. Run `bun install` to update lockfile
4. Verify `bun run lint` and `bun run build` still pass

### 01.4 M7 — Admin Auth Migration Plan (Design Only)

Current: `middleware.ts` reads ADMIN_UIDS env var. Requires redeployment to change admins.

Design (do NOT implement in this phase):
1. `admin_users` table already exists (migration 006)
2. Update middleware to query `admin_users` table as primary source
3. Keep ADMIN_UIDS as fallback for bootstrapping
4. Write migration 013 to insert existing UIDs into admin_users table

Deliver: `planning/ADMIN_AUTH_MIGRATION_PLAN.md`

### 01.5 H5 — solarPanel Naming Collision

File: `src/lib/game/types.ts` lines 34-35

`solarPanel` appears in both `FactoryType` and `PowerPlantType`.

Steps:
1. Check BUILDING_DEFS in `data.ts`: is solarPanel a factory or power plant?
2. If it is a power plant: remove from FactoryType
3. If two different buildings both named solarPanel: rename factory version
4. Fix all downstream type usages (run TypeScript compiler to find them)
5. Write a migration if any building type string changes (player data compatibility)

### 01.6 H2 — Rate Limiter Migration Plan (Design Only)

Current: process-memory `Map` in `rateLimiter.ts:14`.
Problem: multiple server instances each have separate in-memory limits.

Design options:
- Option A: Supabase-backed rate_limits table (no new infra, ~5-10ms extra latency)
- Option B: Redis/Upstash (O(1), purpose-built, new infrastructure)

Recommendation: Option A for current single-instance scale.

Deliver: `planning/RATE_LIMITER_MIGRATION_PLAN.md`

---

## Deliverables

1. `flagCheatAttempt()` uses RPC — H3 fully closed
2. Blueprint import validation added — M8 closed
3. Prisma artifacts cleaned up — M6 + L6 closed
4. solarPanel collision resolved — H5 closed
5. `planning/ADMIN_AUTH_MIGRATION_PLAN.md`
6. `planning/RATE_LIMITER_MIGRATION_PLAN.md`
7. `planning/SECURITY_CLOSURE_REPORT_PHASE_01.md` — before/after evidence table

---

## Dependencies

- Migration 007_atomic_cheat_flag.sql must be deployed to Supabase before 01.1
- Phase 00 complete (know exact current state before changing it)

---

## Validation

```bash
# Verify no read-then-write in cheat flag path
grep -n 'cheat_flag_count' src/lib/auth/gameStateValidator.ts
# Must show only RPC call — no SELECT then UPDATE pattern

# Verify no TODO comments about RPC
grep -rn 'TODO.*RPC' src/lib/auth/

bun run lint  # 0 errors
```

- Test: import blueprint with level=999 — must return false and log warning
- Test: prisma is in devDependencies (check package.json)

## Exit Criteria

- `flagCheatAttempt()` calls `supabase.rpc('increment_cheat_flag')` with no fallback
- Blueprint import rejects out-of-bounds building levels
- `prisma/schema.prisma` removed or clearly marked inactive
- `prisma` moved to devDependencies in package.json
- H5 solarPanel collision resolved
- Security closure report written with before/after evidence for each fix
