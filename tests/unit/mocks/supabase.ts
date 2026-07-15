/**
 * tests/unit/mocks/supabase.ts
 * Mock factories for Supabase clients used in unit tests.
 *
 * Use createMockSupabaseClient() to get a chainable query mock that
 * resolves with the data you provide via `.withResult(...)`.
 */

import { vi } from 'vitest';

export interface MockSupabaseResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

/**
 * Build a query builder mock that resolves to `result`.
 * Supports chained methods: .select(), .eq(), .in(), .order(),
 * .range(), .limit(), .insert(), .update(), .delete(), .upsert().
 *
 * For most cases you only need:
 *   const sb = createMockSupabaseClient({ data: [...], error: null });
 *   await sb.from('foo').select('*').eq('id', 1);
 */
export function createMockSupabaseClient(result: MockSupabaseResult = { data: [], error: null }) {
  const queryBuilder: any = {
    select: vi.fn(() => queryBuilder),
    insert: vi.fn(() => queryBuilder),
    update: vi.fn(() => queryBuilder),
    delete: vi.fn(() => queryBuilder),
    upsert: vi.fn(() => queryBuilder),
    eq: vi.fn(() => queryBuilder),
    neq: vi.fn(() => queryBuilder),
    in: vi.fn(() => queryBuilder),
    gte: vi.fn(() => queryBuilder),
    lte: vi.fn(() => queryBuilder),
    gt: vi.fn(() => queryBuilder),
    lt: vi.fn(() => queryBuilder),
    order: vi.fn(() => queryBuilder),
    range: vi.fn(() => queryBuilder),
    limit: vi.fn(() => queryBuilder),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: undefined, // signal that this is a builder, not a promise
    // Make the builder awaitable to mimic Supabase v2 query result shape
    [Symbol.toPrimitive]: () => undefined,
  };

  // The from() method should be awaitable as well
  Object.defineProperty(queryBuilder, 'then', {
    get() {
      return (resolve: (v: unknown) => void) => resolve(result);
    },
  });

  const client: any = {
    from: vi.fn(() => queryBuilder),
    rpc: vi.fn().mockResolvedValue(result),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };

  return { client, queryBuilder, result };
}

/**
 * Stub the @/lib/supabase/server module — this is the canonical import
 * path used by all src/lib/db/* helpers (per AGENTS.md "do not modify
 * supabase/server.ts" rule).
 *
 * Usage:
 *   vi.mock('@/lib/db/access', () => mockSupabaseServer());
 */
export function mockSupabaseServer(result: MockSupabaseResult = { data: [], error: null }) {
  const { client } = createMockSupabaseClient(result);
  return {
    createServiceRoleClient: () => client,
    createClient: async () => client,
    isServiceRoleConfigured: () => true,
    isSupabaseConfigured: () => true,
  };
}

/**
 * Back-compat: alias for mockSupabaseServer. Kept for migration from
 * earlier draft tests that targeted @/lib/db/admin.
 */
export const mockServiceRoleClient = mockSupabaseServer;

export function mockUserClient(result: MockSupabaseResult = { data: [], error: null }) {
  const { client } = createMockSupabaseClient(result);
  return {
    createClient: async () => client,
    isSupabaseConfigured: () => true,
  };
}
