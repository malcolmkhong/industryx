# Migration Safety Checklist

> **Date:** 2026-06-11
> **Purpose:** Pre/post/rollback procedure for all Supabase migrations
> **Authority:** RULES.md §4 (Database Rules)
> **Reference:** All migration files in `supabase/migrations/`

---

## Pre-Migration Checklist

### Code Review

- [ ] **Migration file reviewed** by at least one other developer (peer review for prod-impact migrations)
- [ ] **Schema change documented** in PR description with:
  - What tables/columns affected
  - Why the change is needed
  - Any data backfill required
  - Rollback plan summary
- [ ] **No hardcoded secrets** in migration SQL (verify with `rg -i "secret|password|key" supabase/migrations/`)
- [ ] **No `prisma db:push` or `prisma migrate` commands** referenced (RULES.md §2.4 FORBIDDEN)

### Migration Properties

- [ ] **Idempotent** — can run twice without error
  - Use `CREATE TABLE IF NOT EXISTS`
  - Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  - Use `CREATE INDEX IF NOT EXISTS`
  - Use `CREATE OR REPLACE FUNCTION`
- [ ] **Atomic** — single transaction where possible
  - Wrap multi-statement migrations in `BEGIN; ... COMMIT;`
  - Use `DO $$ ... $$;` blocks for conditional logic
- [ ] **Naming convention** — `NNN_descriptive_name.sql` (e.g., `012_trade_history_columns.sql`)
- [ ] **One logical change** per migration file (RULES.md §4)

### Schema Validation

- [ ] **New tables have RLS enabled** — `ALTER TABLE xxx ENABLE ROW LEVEL SECURITY;`
- [ ] **New tables have user_id index** — `CREATE INDEX idx_xxx_user_id ON xxx(user_id);`
- [ ] **New tables have created_at index** — `CREATE INDEX idx_xxx_created_at ON xxx(created_at);`
- [ ] **New tables have RLS policies**:
  - `SELECT` policy: `USING (user_id = auth.uid())`
  - `INSERT` policy: `WITH CHECK (user_id = auth.uid())`
  - Service role: `TO service_role` with full access
- [ ] **Foreign keys have ON DELETE** — `CASCADE` or `SET NULL` as appropriate
- [ ] **Monetary columns are INTEGER (cents) or DECIMAL** — never FLOAT (RULES.md §4)
- [ ] **Timestamps use TIMESTAMPTZ** — never TIMESTAMP (RULES.md §4)
- [ ] **UUIDs use `uuid` type** — never text or varchar (RULES.md §4)

### Environment Verification

- [ ] **Migration tested in development** (Supabase dev project or local Postgres)
- [ ] **Migration applied to staging** (if applicable)
- [ ] **No concurrent migrations in progress** (check with team)

### Backup

- [ ] **Pre-migration backup verified** — Supabase dashboard → Settings → Backups → confirm last backup is recent
- [ ] **Backup timestamp recorded** in deployment log
- [ ] **Rollback plan reviewed** — see "Rollback" section below

---

## Migration Execution

### Step-by-step

1. **Notify team** in #deployments channel (or equivalent)
2. **Apply migration** via Supabase dashboard SQL editor OR `supabase db push` (NOT `prisma`)
3. **Verify migration success** — check for errors in Supabase logs
4. **Run verification queries** (see "Post-Migration" below)
5. **Notify team** of completion

### Concurrent Safety

- [ ] **Migration does not block** long-running queries (avoid full table rewrites during peak hours)
- [ ] **Long migrations** (>10s) run during off-peak hours (02:00-06:00 UTC)
- [ ] **Locks acquired minimally** — avoid `LOCK TABLE` if possible

---

## Post-Migration Verification

### Schema Verification

```sql
-- Verify table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'your_new_table'
);

-- Verify column added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'your_table'
ORDER BY ordinal_position;

-- Verify RLS enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'your_table';

-- Verify RLS policies
SELECT polname, polcmd, polpermissive
FROM pg_policy
WHERE polrelid = 'your_table'::regclass;

-- Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'your_table';
```

### Application Verification

- [ ] **Application starts without errors** — `bun run dev` returns 200 on `/`
- [ ] **No 500 errors** in application logs for 15 minutes post-deploy
- [ ] **No 4xx spike** beyond normal baseline
- [ ] **Health check endpoint** returns 200 — `/api/health`
- [ ] **Game loads and saves correctly** — manual smoke test
- [ ] **Admin actions work** — manual smoke test of admin endpoints

### Monitoring

- [ ] **Watch Sentry for new errors** for 30 minutes post-migration
- [ ] **Watch `/api/health` latency** for spike
- [ ] **Watch Supabase dashboard** for connection errors

---

## Rollback Procedure

### When to Rollback

Rollback if:
- Migration fails to apply (constraint violation, etc.)
- Application 500 error rate > 5% post-migration
- Data corruption detected
- New RLS policies block legitimate access

### Pre-Rollback Verification

- [ ] **Root cause identified** (don't rollback blindly)
- [ ] **Rollback migration written** (see "Reverse Migration" below)
- [ ] **Team notified**
- [ ] **Data loss risk assessed** — what data created since migration will be lost?

### Reverse Migration Template

```sql
-- migrations/NNNN_REVERT_descriptive_name.sql
-- Use IF EXISTS for safety (idempotent)
-- Run BEFORE dropping the original migration

BEGIN;

-- Drop RLS policies first (depend on table/column)
DROP POLICY IF EXISTS "policy_name" ON table_name;

-- Drop indexes
DROP INDEX IF EXISTS idx_name;

-- Drop columns
ALTER TABLE table_name DROP COLUMN IF EXISTS column_name;

-- Drop tables (last resort)
DROP TABLE IF EXISTS table_name CASCADE;

COMMIT;
```

### Rollback Execution

1. **Stop new requests** — drain traffic if possible (Vercel can route to last good deploy)
2. **Apply reverse migration** in Supabase SQL editor
3. **Verify rollback** with post-migration verification queries
4. **Revert application code** (git revert + redeploy)
5. **Verify application** works on previous schema
6. **Document incident** in worklog.md

### Data Loss Risk

| Operation | Data Loss Risk |
|-----------|----------------|
| Drop table (no other tables reference) | ALL table data |
| Drop column | ALL column data |
| Drop constraint (NOT NULL, etc.) | None if values already valid |
| Drop policy | None (RLS only) |
| Drop index | None (rebuilds) |

Always prefer:
- `DROP COLUMN IF EXISTS` over `DROP TABLE`
- Reversible: rename column (`ALTER TABLE ... RENAME COLUMN`) vs drop
- Backup before destructive ops

---

## Special Cases

### Migration Affects Production Data

- [ ] **Coordinate with team** — maintenance window required
- [ ] **Test with production data sample** in staging
- [ ] **Document expected vs actual** row count change
- [ ] **Verify CHECK constraints** don't reject existing data
- [ ] **Test ROLLBACK scenario** in staging first

### Migration Adds Index on Large Table

- [ ] **Use `CREATE INDEX CONCURRENTLY`** (non-blocking)
- [ ] **Monitor DB load** during index creation
- [ ] **Verify index used** with `EXPLAIN ANALYZE`

### Migration Backfills Data

- [ ] **Backfill in batches** to avoid long locks
- [ ] **Use `LIMIT` + offset** pattern for large tables
- [ ] **Log progress** to verify completion
- [ ] **Verify backfill** with row count comparison

---

## Admin Function Safety

**Critical warning discovered during Wave 4:** The `is_game_admin()` SQL function (migration 018) uses `auth.uid()` internally, but the function grants EXECUTE only to `service_role`. Since `auth.uid()` returns NULL for service role clients (no authenticated user context in the JWT), calling this RPC from service role context always returns `false`. This made the Phase 3.9 defense-in-depth check effectively dead code until the Wave 4 fix (`d6d71a3`) replaced it with a direct table query.

**When to use direct table query instead of `is_game_admin()` RPC:**
- If your migration runs in service role context (e.g., from a cron job, edge function, or admin route)
- If you need to check admin status for a specific user_id (not the calling user)
- If your code doesn't have an authenticated user context

**Recommended pattern:**
```ts
// Direct query — service role bypasses RLS, so this is safe
const { data: adminRecord, error } = await serviceRoleClient
  .from("admin_users")
  .select("user_id, role")
  .eq("user_id", user.id)
  .maybeSingle();

if (adminError || !adminRecord) {
  // not an admin
}
```

### Recent Admin-Related Migrations

**Migration 018** — `is_game_admin()` fix:
- Queries `public.admin_users` table (not hardcoded)
- Bootstrap fallback for UID `1b4d0dc3-e4d2-4fc0-b731-9782243ad061` (initial admin)
- Grants EXECUTE to `service_role` only (revoked from PUBLIC, anon, authenticated)
- ⚠️ Has the auth.uid() design flaw documented above

**Migration 024** — `now_iso()` RPC:
- Returns DB server time in ISO 8601 UTC format (`YYYY-MM-DDTHH:MI:SS.MSZ`)
- Called from `/api/game/state` via `supabase.rpc('now_iso')`
- Used to timestamp save events with true DB server time
- **Applied to live DB** during Wave 4

### Testing Admin Functions

```sql
-- Verify is_game_admin works (as authenticated user, NOT service role):
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub TO '<test-user-uuid>';
SELECT is_game_admin();

-- Verify admin_users contents:
SELECT user_id, email, role, created_at
FROM admin_users
ORDER BY created_at;

-- Verify is_game_admin cannot be called as anon/regular authenticated:
SET LOCAL ROLE anon;
SELECT is_game_admin();  -- should fail with permission denied

-- Verify now_iso RPC:
SELECT now_iso();  -- should return ISO 8601 timestamp
```

### Future Migration Checklist (Admin Functions)

When adding a new SQL function that checks admin status:
- [ ] Document whether the function works with service role context
- [ ] If it uses `auth.uid()`, either accept `p_user_id UUID` as parameter OR add explicit comment that it requires authenticated context
- [ ] Test with `SET LOCAL ROLE service_role` to confirm the function returns the expected value (or fails safely)
- [ ] Add a row to this checklist with the function name and test SQL

---

## Sign-off

### Required for Production Migrations

- [ ] Code reviewed: ___________
- [ ] Tested in staging: ___________
- [ ] Backup verified: ___________
- [ ] Rollback plan reviewed: ___________
- [ ] Team notified: ___________
- [ ] Applied: ___________
- [ ] Verified: ___________

---

## References

- **RULES.md §4** — Database rules (RLS, types, indexes, atomicity)
- **RULES.md §2.4** — Forbidden: prisma db:push / prisma migrate
- **planning/CLAIM_VERIFICATION_MATRIX.md** — Past migration claims (some false)
- **PROJECT_STATUS_SOURCE_OF_TRUTH.md** — Current migration state
- **supabase/migrations/** — All migration files (001 → 011 currently)
