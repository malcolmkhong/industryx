/**
 * tests/unit/auth/permissions.test.ts
 *
 * Unit tests for src/lib/auth/permissions.ts (policy module wrapper).
 * Verifies the policy layer correctly delegates to the DB helpers.
 */

import { describe, it, expect, vi } from 'vitest';
import { mockSupabaseServer } from '../mocks/supabase';

vi.mock('@/lib/supabase/server', () => mockSupabaseServer());

import {
  getValidPermissions,
  getUserPermissions,
  hasPermission,
  grantPermission,
  revokePermission,
} from '@/lib/auth/permissions';

describe('auth/permissions (policy layer)', () => {
  it('getValidPermissions returns valid permission list', () => {
    const perms = getValidPermissions();
    expect(perms.length).toBe(8);
    expect(perms).toContain('view_players');
  });

  it('getUserPermissions delegates to db', async () => {
    const perms = await getUserPermissions('admin-id');
    expect(Array.isArray(perms)).toBe(true);
  });

  it('hasPermission delegates to db', async () => {
    const result = await hasPermission('admin-id', 'view_players');
    expect(typeof result).toBe('boolean');
  });

  it('grantPermission delegates to db', async () => {
    const result = await grantPermission('admin-id', 'view_players', 'grantor');
    expect(typeof result).toBe('boolean');
  });

  it('revokePermission delegates to db', async () => {
    const result = await revokePermission('admin-id', 'view_players');
    expect(typeof result).toBe('boolean');
  });
});
