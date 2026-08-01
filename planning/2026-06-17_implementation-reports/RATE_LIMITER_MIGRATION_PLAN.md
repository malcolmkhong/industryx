# Rate Limiter Migration Plan (H2)

> **Date:** 2026-06-11
> **Issue:** H2 — In-memory rate limiter doesn't scale (RULES.md §5)
> **Status:** Design only (no implementation in this phase)
> **Reference:** `src/lib/auth/rateLimiter.ts:14` (current implementation)

---

## Problem

Current rate limiting in `rateLimiter.ts:14` uses a process-memory `Map`:

```typescript
const limitStore = new Map<string, RateLimitEntry>(); // L14
```

**Problems:**

1. **Multi-instance deployments** — Each Next.js process has its own `Map`. With 3 instances, a user gets 3× the rate limit.
2. **Lost on restart** — All counters reset on deploy or server restart, allowing abuse right after restart.
3. **Memory leak risk** — `Map` grows unbounded unless carefully pruned.
4. **Inconsistent enforcement** — Different users hit different limits depending on which instance serves them.

## Goal

Migrate rate limiting to a distributed, persistent solution that:

- Works across multiple server instances
- Survives restarts
- Maintains ~1 RPS per user enforcement
- Minimal latency overhead
- Easy to operate and monitor

## Current State (Verified)

Per RULES.md §5:

> Current in-memory rate limiter (`rateLimiter.ts:14`) doesn't scale to multi-instance deployments. For production, use Supabase-backed or Redis rate limiting.

**Current rate limit profiles (per PHASE_1B_SECURITY_REPORT.md):**

| Endpoint | Profile | Limit |
|----------|---------|-------|
| `/api/news-llm` | `chat` | 5 req/min, 50/hour |
| `/api/config` | `admin` | 30 req/min, 500/hour |
| `/api/game/definitions` | `public` | 60 req/min, 1000/hour (IP-based) |
| `/api/icons` | `public` | 60 req/min, 1000/hour (IP-based) |
| `/api/game/trade` | `trade` | 30 req/min (post-fix) |
| `/api/game/state` | `sync` | 30 req/min (cloud sync) |

## Design Options

### Option A: Supabase-Backed Rate Limits (RECOMMENDED for current scale)

**Implementation:** Postgres table + atomic SQL increment.

**Schema:**

```sql
-- 014_rate_limits.sql
CREATE TABLE rate_limits (
  id BIGSERIAL PRIMARY KEY,
  identifier TEXT NOT NULL,        -- user_id or IP
  endpoint TEXT NOT NULL,          -- profile name (e.g., 'chat', 'admin')
  window_start TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('minute', NOW()),
  request_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(identifier, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_lookup
  ON rate_limits(identifier, endpoint, window_start DESC);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
-- No RLS policies: only service role accesses
```

**Check function (atomic):**

```sql
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  v_window_start := DATE_TRUNC('minute', NOW());

  -- Atomic upsert with increment
  INSERT INTO rate_limits (identifier, endpoint, window_start, request_count)
  VALUES (p_identifier, p_endpoint, v_window_start, 1)
  ON CONFLICT (identifier, endpoint, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_current_count;

  RETURN v_current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql;
```

**TypeScript wrapper:**

```typescript
// src/lib/auth/rateLimiter.ts (target)
export async function checkRateLimit(
  identifier: string,
  profile: RateLimitProfile,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const config = RATE_LIMIT_PROFILES[profile];
  const { data, error } = await supabaseAdmin.rpc('check_rate_limit', {
    p_identifier: identifier,
    p_endpoint: profile,
    p_window_seconds: 60,
    p_max_requests: config.perMinute,
  });

  if (error) {
    // Fail-open: don't block users on DB error (rate limit is best-effort)
    logger.warn('rate_limit_check_failed', { error: error.message });
    return { allowed: true, remaining: -1, resetAt: new Date() };
  }

  return {
    allowed: data === true,
    remaining: Math.max(0, config.perMinute - data),
    resetAt: nextMinute(),
  };
}
```

**Pros:**

- No new infrastructure (uses existing Supabase)
- Atomic via SQL function (no race conditions)
- Persistent across restarts
- ~5-10ms latency (single round-trip)
- Easy to inspect (`SELECT * FROM rate_limits WHERE ...`)
- Works in Edge runtime (Supabase client works there)

**Cons:**

- 5-10ms added latency per request
- DB cost: 1 insert/upsert per request (mitigated by windowing)
- Requires cleanup cron for old rows

**Mitigation for cons:**

- Use `EXPLAIN` on `check_rate_limit` to verify index usage
- Background cron: `DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour'`
- Cache results in memory for 1s to reduce DB calls (optional)

### Option B: Redis/Upstash (Recommended for high-scale)

**Implementation:** Redis with sliding window counter or token bucket.

**Schema (in Redis):**

```
Key: rl:{identifier}:{endpoint}:{minute}
Value: counter
TTL: 5 minutes
```

**TypeScript wrapper (using @upstash/ratelimit):**

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const limiters = new Map<string, Ratelimit>();

function getLimiter(profile: string) {
  if (!limiters.has(profile)) {
    const config = RATE_LIMIT_PROFILES[profile];
    limiters.set(profile, new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.perMinute, '1 m'),
      analytics: true,
    }));
  }
  return limiters.get(profile)!;
}

export async function checkRateLimit(identifier: string, profile: string) {
  const { success, limit, remaining, reset } = await getLimiter(profile).limit(identifier);
  return { allowed: success, remaining, resetAt: new Date(reset) };
}
```

**Pros:**

- O(1) latency (~1ms)
- Purpose-built for rate limiting
- Built-in analytics dashboard (Upstash)
- Sliding window accuracy (vs fixed minute window)
- TTL-based cleanup (no cron needed)

**Cons:**

- New infrastructure dependency (Upstash)
- Cost: $0-10/month for current scale (free tier covers most)
- Vendor lock-in (can migrate but takes effort)
- Edge runtime support requires HTTP-based Redis (Upstash REST API)

### Option C: Hybrid (Supabase + In-Memory Cache)

**Implementation:** Use Supabase for canonical state, in-memory for hot path.

```typescript
// Cache check first
const cached = memCache.get(`${identifier}:${profile}`);
if (cached && cached.expiresAt > NOW) {
  return cached.result; // Skip DB
}

// Cache miss: query Supabase
const result = await checkRateLimitDB(identifier, profile);
memCache.set(`${identifier}:${profile}`, { ...result, expiresAt: NOW + 1000 });
return result;
```

**Pros:**

- Best of both worlds
- DB only hit on cache miss (~1% of requests)
- Fast for hot keys

**Cons:**

- Cache invalidation complexity
- Per-instance cache (same problem as current in-memory approach for cross-instance)

## Comparison Matrix

| Factor | Option A (Supabase) | Option B (Redis) | Option C (Hybrid) |
|--------|---------------------|------------------|---------------------|
| Latency | 5-10ms | ~1ms | ~1ms (cached), 5-10ms (miss) |
| Infrastructure | Existing | New (Upstash) | Existing |
| Cost | $0 (existing Supabase) | $0-10/month | $0 |
| Persistence | ✅ DB-backed | ✅ Redis-backed | ✅ DB canonical + mem cache |
| Multi-instance | ✅ | ✅ | ⚠️ Cache per-instance |
| Edge runtime | ✅ | ✅ (HTTP API) | ✅ |
| Operational complexity | Low | Medium | High |
| Migration effort | 1-2 days | 2-3 days | 3-4 days |

## Recommendation

**For current single-instance scale: Option A (Supabase-backed)**

**Rationale:**

- No new infrastructure
- Sufficient performance for current traffic (5-10ms acceptable)
- Persistent and multi-instance ready
- ~1-2 day implementation
- Easy to migrate to Option B later if traffic grows

**When to migrate to Option B:**

- More than 10 RPS sustained across all rate-limited endpoints
- P99 latency budget < 100ms
- Need for real-time analytics dashboard

## Implementation Plan (When Phase 02+ begins)

**Step 1: Schema migration** (1 hour)
- Create `014_rate_limits.sql`
- Deploy to production Supabase

**Step 2: SQL function** (1 hour)
- Create `check_rate_limit()` function
- Test atomicity with concurrent calls

**Step 3: Update rateLimiter.ts** (2-3 hours)
- Replace `Map` with Supabase call
- Add fallback for DB error (fail-open)
- Update all callers (5 endpoints)

**Step 4: Background cleanup** (1 hour)
- Add cron to delete old rate_limits rows
- Or use Supabase scheduled function

**Step 5: Monitoring** (1 hour)
- Track rate_limit DB call latency
- Alert on check_rate_limit error rate > 1%

**Total: ~1 day**

## Rollback Strategy

**Immediate rollback:** Revert rateLimiter.ts to in-memory Map. Old code is in git.

**Safe migration order:**

1. Deploy SQL migration (additive, no behavior change)
2. Deploy rateLimiter.ts change (uses new path)
3. Monitor for 24 hours
4. If issues: revert rateLimiter.ts (SQL migration can stay)
5. Drop table after 1 week if rollback permanent

## Out of Scope

- IP-based rate limiting for unauthenticated endpoints (current code does this with in-memory)
- Sliding window accuracy (fixed minute window acceptable)
- Distributed rate limiting across multiple regions
- Real-time abuse detection (separate concern)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 5-10ms added latency too slow | LOW | MEDIUM | Profile, optimize if needed; migrate to Redis |
| DB connection pool exhaustion | LOW | HIGH | Supabase connection limits; monitor |
| Rate limit table grows unbounded | MEDIUM | LOW | Cron cleanup of old rows |
| Fail-open on DB error = abuse vector | LOW | MEDIUM | Already best-effort; not security-critical |
| Concurrent requests all pass | LOW | LOW | Atomic SQL function prevents |

## Recommendation Summary

**Status:** DESIGN COMPLETE. Implementation deferred to Phase 02+.

**Priority:** Medium — current in-memory approach has known issues but works for single instance.

**Effort estimate:** 1-2 days (Option A)

**Blocking dependencies:** None
