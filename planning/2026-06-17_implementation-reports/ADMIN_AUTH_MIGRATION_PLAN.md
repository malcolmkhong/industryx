# Admin Auth Migration Plan (M7)

> **Date:** 2026-06-11
> **Issue:** M7 — Admin auth via env var `ADMIN_UIDS` (RULES.md §2.5)
> **Status:** Design only (no implementation in this phase)
> **Reference:** `src/middleware.ts:64-74` (current implementation)

---

## Problem

Current admin authentication in `middleware.ts:64-74` uses an environment variable `ADMIN_UIDS` as an allowlist. Adding or removing admins requires:

1. Update the env var on the deployment platform (Vercel, etc.)
2. Redeploy the application
3. Wait for the new deployment to propagate

This is operationally slow and error-prone. Admins cannot be granted/revoked without a deploy cycle.

## Goal

Move admin authorization from environment variable to a database table (`admin_users`) that can be managed at runtime via standard admin tooling.

## Current State (Verified)

Per RULES.md §5:

| Role | Can Read | Can Write | Source |
|------|----------|-----------|--------|
| `viewer` | ✅ All admin data | ❌ No mutations | `admin_users.role` |
| `admin` | ✅ All admin data | ✅ All mutations | `admin_users.role` |
| `super_admin` | ✅ All admin data | ✅ All mutations + manage admins | `ADMIN_UIDS` env var (implicit) |

**Current flow (`middleware.ts:64-74`):**

```typescript
// 1. Check env var for super_admin
const adminUids = process.env.ADMIN_UIDS?.split(',') ?? [];
if (adminUids.includes(userId)) {
  // Implicit super_admin
  return { role: 'super_admin' };
}

// 2. Else query admin_users table
const { data } = await supabase
  .from('admin_users')
  .select('role')
  .eq('user_id', userId)
  .single();

return { role: data?.role ?? null };
```

**Problems with current flow:**

1. **Super admin management requires redeploy** — Cannot grant/revoke super_admin at runtime
2. **No audit trail** — Env var changes are not logged
3. **Inconsistency** — Super admins bypass DB, regular admins don't
4. **No role transitions** — Cannot promote admin → super_admin without redeploy

## Target Architecture

### Database Schema (Already Exists)

Migration `006_admin_users.sql` (referenced in RULES.md) created:

```sql
CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'admin', 'super_admin')),
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX idx_admin_users_role ON admin_users(role);
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
-- RLS policies: service role can do everything
```

**Schema is ready** — no migration needed.

### Migration Plan (Implementation Step)

**Step 1: Bootstrap migration** — Move existing `ADMIN_UIDS` UIDs to `admin_users` table as `super_admin`.

```sql
-- 013_admin_users_bootstrap.sql
-- Idempotent: uses ON CONFLICT DO NOTHING

INSERT INTO admin_users (user_id, role, granted_by, granted_at, notes)
SELECT
  u.id,
  'super_admin',
  NULL, -- System bootstrap, no granter
  NOW(),
  'Bootstrapped from ADMIN_UIDS env var on ' || NOW()::TEXT
FROM auth.users u
WHERE u.id = ANY(string_to_array(current_setting('app.admin_uids_to_bootstrap', true), ',')::uuid[])
ON CONFLICT (user_id) DO NOTHING;
```

**Step 2: Update middleware** — Single source: `admin_users` table. Env var becomes bootstrap-only.

```typescript
// src/middleware.ts (target)
export async function checkAdminRole(userId: string): Promise<AdminRole | null> {
  // Single source: admin_users table
  const { data, error } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error) {
    // Fail-closed: DB error = no admin access
    logger.error('admin_role_check_failed', { userId, error: error.message });
    return null;
  }

  return (data?.role as AdminRole) ?? null;
}
```

**Step 3: Bootstrap path** — Env var used only for initial admin seeding, not authorization.

```typescript
// src/lib/auth/admin-bootstrap.ts (new)
export async function ensureBootstrapAdmins(): Promise<void> {
  // Called once on app startup or via admin tool
  const envUids = process.env.ADMIN_UIDS?.split(',').filter(Boolean) ?? [];
  if (envUids.length === 0) return;

  for (const uid of envUids) {
    await supabase.from('admin_users').upsert({
      user_id: uid,
      role: 'super_admin',
      notes: 'Bootstrap from ADMIN_UIDS env var',
    }, { onConflict: 'user_id' });
  }
}
```

### Admin Management UI (Future)

Phase 02+ scope. Required for full self-service admin management:

- `/admin/admins` page: list, grant, revoke, change role
- Audit log: who changed what role when
- Self-service: existing `super_admin` can promote others

### Rollback Strategy

**Immediate rollback** (within minutes): Restore `ADMIN_UIDS` check in middleware. System continues to work.

**Safe migration order:**

1. Deploy middleware change to read from `admin_users` table only
2. Run bootstrap migration to seed `admin_users` from `ADMIN_UIDS`
3. Verify all admins can still access
4. Leave `ADMIN_UIDS` env var in place as fallback
5. After 1 week: remove `ADMIN_UIDS` env var

## Implementation Checklist (When Phase 02+ begins)

- [ ] Create `013_admin_users_bootstrap.sql` migration
- [ ] Run migration on production Supabase
- [ ] Verify all env-var admins are in `admin_users` table
- [ ] Update `src/middleware.ts:64-74` to single-source
- [ ] Add `src/lib/auth/admin-bootstrap.ts` for startup seeding
- [ ] Wire `ensureBootstrapAdmins()` into app startup
- [ ] Test: existing super_admin still works
- [ ] Test: admin in DB works
- [ ] Test: regular user denied
- [ ] Test: DB error fails closed (returns null role)
- [ ] Document rollback procedure in DEPLOYMENT.md

## Security Considerations

1. **Bootstrap path must be idempotent** — Re-running must not duplicate or overwrite
2. **Revoked admins lose access immediately** — No caching, real-time DB read
3. **Service role used for admin_users writes** — Never client-writable
4. **Audit trail** — Every grant/revoke should log to `admin_actions` table (existing)
5. **Fail-closed on DB error** — Don't grant access if we can't verify

## Out of Scope

- Admin UI for self-service management (Phase 02+)
- Multi-factor auth for super_admin (future)
- Time-bounded admin access (e.g., temporary viewer role) (future)
- Migration to OAuth/SSO for admin auth (future)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Locked out during migration | LOW | HIGH | Keep `ADMIN_UIDS` as fallback for 1 week |
| Bootstrap migration fails mid-way | LOW | MEDIUM | Idempotent (ON CONFLICT DO NOTHING) |
| Performance: extra DB read per request | LOW | LOW | Add response cache (5s TTL) if needed |
| RLS policy bypass | LOW | HIGH | Use service role for writes, audited |

## Recommendation

**Status:** DESIGN COMPLETE. Implementation deferred to Phase 02+.

**Priority:** Medium — current env-var approach works but is operationally painful. Not a security emergency.

**Effort estimate:** 1-2 days (migration + middleware update + testing)

**Blocking dependencies:** None
